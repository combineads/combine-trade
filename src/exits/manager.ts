/**
 * Exit manager — executes exit actions determined by the checker and trailing modules.
 *
 * Responsibilities:
 * - processExit(): partial/full close orders, SL breakeven move, ticket state transition
 * - processTrailing(): trailing SL update on exchange + DB fields
 * - updateTpPrices(): TP price DB update
 * - updateMfeMae(): MFE/MAE DB update
 *
 * ExchangeAdapter is injected as a parameter (never imported).
 * All monetary calculations use Decimal.js.
 *
 * Layer: L6 (exits)
 */

import type Decimal from "decimal.js";

import { d, max as decMax, sub } from "@/core/decimal";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import { closeSide, type Direction, type Exchange } from "@/core/types";
import type { NewOrderRow } from "@/db/schema";
import { type RecordOrderParams, recordOrder } from "@/orders/executor";
import type { ExitAction, ExitActionType } from "./checker";
import { calcMaxProfit, calculateTrailingSl, shouldUpdateTrailingSl } from "./trailing";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("exit-manager");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal ticket fields needed by the exit manager */
export type ExitTicket = {
  id: string;
  symbol: string;
  exchange: Exchange;
  direction: Direction;
  entry_price: string;
  size: string;
  remaining_size: string;
  trailing_active: boolean | null;
  trailing_price: string | null;
  max_profit: string | null;
  sl_order_id: string | null;
  current_sl_price?: string | null;
};

export type ProcessExitParams = {
  adapter: ExchangeAdapter;
  ticket: ExitTicket;
  action: ExitAction;
  exchange: Exchange;
  /**
   * Exchange capability flags. When absent, safe default applies:
   * supports_edit_order=true (preserves existing behaviour — editOrder attempted).
   */
  exchangeConfig?: {
    supports_edit_order: boolean;
  };
};

export type ExitResult = {
  success: boolean;
  closeOrder: NewOrderRow | null;
  slOrder: NewOrderRow | null;
  newState: string | null;
  ticketUpdates: {
    remaining_size: string;
    trailing_active?: boolean;
    current_sl_price?: string;
  } | null;
};

export type ProcessTrailingParams = {
  adapter: ExchangeAdapter;
  ticket: ExitTicket;
  currentPrice: Decimal;
  exchange: Exchange;
  /**
   * Exchange capability flags. When absent, safe default applies:
   * supports_edit_order=true (preserves existing behaviour — editOrder attempted).
   */
  exchangeConfig?: {
    supports_edit_order: boolean;
  };
};

export type TrailingUpdateResult = {
  updated: boolean;
  newTrailingPrice: Decimal | null;
  newMaxProfit: Decimal | null;
  slOrder: NewOrderRow | null;
};

export type TpUpdateParams = {
  tp1Price: Decimal | null;
  tp2Price: Decimal | null;
};

export type TpUpdateResult = {
  tp1_price: string | null;
  tp2_price: string | null;
};

export type MfeMaeUpdateParams = {
  mfe: Decimal;
  mae: Decimal;
};

export type MfeMaeUpdateResult = {
  max_favorable: string;
  max_adverse: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps ExitActionType to OrderType for DB recording */
function actionTypeToOrderType(actionType: ExitActionType): string {
  switch (actionType) {
    case "TP1":
      return "TP1";
    case "TP2":
      return "TP2";
    case "TIME_EXIT":
      return "TIME_EXIT";
    case "NONE":
      return "NONE";
  }
}

/** Maps exit action type to the new ticket state */
function actionTypeToNewState(actionType: ExitActionType): string | null {
  switch (actionType) {
    case "TP1":
      return "TP1_HIT";
    case "TP2":
      return "TP2_HIT";
    case "TIME_EXIT":
      return "CLOSED";
    case "NONE":
      return null;
  }
}

// ---------------------------------------------------------------------------
// SL move helper — editOrder with cancel+create fallback
// ---------------------------------------------------------------------------

async function moveSl(
  adapter: ExchangeAdapter,
  ticket: ExitTicket,
  newSlPrice: Decimal,
  exchange: Exchange,
  intentId: string,
  supportsEditOrder: boolean,
): Promise<NewOrderRow | null> {
  const slOrderId = ticket.sl_order_id;
  const side = closeSide(ticket.direction);
  const remainingSize = d(ticket.remaining_size);

  // Try editOrder first only when the exchange supports it
  if (slOrderId && supportsEditOrder) {
    try {
      const editResult = await adapter.editOrder(slOrderId, {
        price: newSlPrice,
      });

      log.info("SL moved via editOrder", {
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        newSl: newSlPrice.toString(),
        orderId: editResult.orderId,
      });

      return recordOrder({
        exchange,
        orderType: "SL",
        status: editResult.status,
        side,
        size: remainingSize,
        intentId,
        idempotencyKey: crypto.randomUUID(),
        price: newSlPrice,
        expectedPrice: newSlPrice,
        ticketId: ticket.id,
        exchangeOrderId: editResult.exchangeOrderId,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.warn("SL editOrder failed, falling back to cancel+create", {
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        error: errorMessage,
      });
    }
  }

  // cancel+create path: either supports_edit_order=false, or editOrder failed
  if (slOrderId) {
    try {
      await adapter.cancelOrder(slOrderId, ticket.symbol);
    } catch (cancelErr) {
      const cancelMsg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
      log.warn("cancel old SL failed", {
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        error: cancelMsg,
      });
    }
  }

  // Create new SL order
  try {
    const createResult = await adapter.createOrder({
      symbol: ticket.symbol,
      side,
      size: remainingSize,
      price: newSlPrice,
      type: "stop_market",
      reduceOnly: true,
    });

    log.info("SL moved via cancel+create", {
      symbol: ticket.symbol,
      exchange: ticket.exchange,
      newSl: newSlPrice.toString(),
      orderId: createResult.orderId,
    });

    return recordOrder({
      exchange,
      orderType: "SL",
      status: createResult.status,
      side,
      size: remainingSize,
      intentId,
      idempotencyKey: crypto.randomUUID(),
      price: newSlPrice,
      expectedPrice: newSlPrice,
      ticketId: ticket.id,
      exchangeOrderId: createResult.exchangeOrderId,
    });
  } catch (createErr) {
    const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
    log.error("SL create failed", {
      symbol: ticket.symbol,
      exchange: ticket.exchange,
      error: createMsg,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// processExit
// ---------------------------------------------------------------------------

/**
 * Executes an exit action:
 * - TP1: partial close (50%), SL breakeven, trailing_active=true, state=TP1_HIT
 * - TP2: partial close (remaining/3), state=TP2_HIT
 * - TIME_EXIT: full close, state=CLOSED
 * - NONE: no-op
 *
 * Returns the result containing order records and ticket updates.
 * The caller is responsible for DB writes (ticket state transition, order insert).
 */
export async function processExit(params: ProcessExitParams): Promise<ExitResult> {
  const { adapter, ticket, action, exchange, exchangeConfig } = params;
  // Safe default: attempt editOrder unless flag explicitly set to false
  const supportsEditOrder = exchangeConfig?.supports_edit_order ?? true;

  // NONE → no-op
  if (action.type === "NONE") {
    return {
      success: true,
      closeOrder: null,
      slOrder: null,
      newState: null,
      ticketUpdates: null,
    };
  }

  const intentId = crypto.randomUUID();
  const side = closeSide(ticket.direction);
  const closeSize = action.closeSize;

  log.info("processExit started", {
    symbol: ticket.symbol,
    exchange: ticket.exchange,
    actionType: action.type,
    closeSize: closeSize.toString(),
  });

  // 1. Create reduceOnly partial/full close order
  let closeOrder: NewOrderRow;
  try {
    const orderResult = await adapter.createOrder({
      symbol: ticket.symbol,
      side,
      size: closeSize,
      type: "market",
      reduceOnly: true,
    });

    const orderParams: RecordOrderParams = {
      exchange,
      orderType: actionTypeToOrderType(action.type) as RecordOrderParams["orderType"],
      status: orderResult.status,
      side,
      size: closeSize,
      intentId,
      idempotencyKey: crypto.randomUUID(),
      ticketId: ticket.id,
      exchangeOrderId: orderResult.exchangeOrderId,
    };
    if (orderResult.filledPrice != null) {
      orderParams.filledPrice = orderResult.filledPrice;
    }
    if (orderResult.filledSize != null) {
      orderParams.filledSize = orderResult.filledSize;
    }

    closeOrder = recordOrder(orderParams);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("close order failed", {
      symbol: ticket.symbol,
      exchange: ticket.exchange,
      error: errorMessage,
    });

    closeOrder = recordOrder({
      exchange,
      orderType: actionTypeToOrderType(action.type) as RecordOrderParams["orderType"],
      status: "FAILED",
      side,
      size: closeSize,
      intentId,
      idempotencyKey: crypto.randomUUID(),
      ticketId: ticket.id,
      errorMessage,
    });

    return {
      success: false,
      closeOrder,
      slOrder: null,
      newState: null,
      ticketUpdates: null,
    };
  }

  // 2. Calculate new remaining size
  const newRemaining = sub(ticket.remaining_size, closeSize.toString());
  const newState = actionTypeToNewState(action.type);

  // 3. TP1-specific: move SL to breakeven + trailing_active
  let slOrder: NewOrderRow | null = null;
  if (action.type === "TP1") {
    const breakevenPrice = d(ticket.entry_price);
    slOrder = await moveSl(adapter, ticket, breakevenPrice, exchange, intentId, supportsEditOrder);

    log.info("TP1 processed — SL moved to breakeven, trailing activated", {
      symbol: ticket.symbol,
      exchange: ticket.exchange,
      breakevenPrice: breakevenPrice.toString(),
    });

    return {
      success: true,
      closeOrder,
      slOrder,
      newState,
      ticketUpdates: {
        remaining_size: newRemaining.toString(),
        trailing_active: true,
        current_sl_price: breakevenPrice.toString(),
      },
    };
  }

  // 4. TP2 / TIME_EXIT: just the close order
  log.info(`${action.type} processed`, {
    symbol: ticket.symbol,
    exchange: ticket.exchange,
    closedSize: closeSize.toString(),
  });

  return {
    success: true,
    closeOrder,
    slOrder: null,
    newState,
    ticketUpdates: {
      remaining_size: newRemaining.toString(),
    },
  };
}

// ---------------------------------------------------------------------------
// processTrailing
// ---------------------------------------------------------------------------

/**
 * Processes trailing stop update:
 * 1. calcMaxProfit(entry, currentPrice, direction)
 * 2. Use max of prev maxProfit and new maxProfit
 * 3. calculateTrailingSl(entry, maxProfit, direction)
 * 4. shouldUpdateTrailingSl(currentSl, newSl, direction)
 * 5. If yes: edit SL on exchange (with cancel+create fallback)
 * 6. Return trailing_price and max_profit updates
 */
export async function processTrailing(
  params: ProcessTrailingParams,
): Promise<TrailingUpdateResult> {
  const { adapter, ticket, currentPrice, exchange, exchangeConfig } = params;
  // Safe default: attempt editOrder unless flag explicitly set to false
  const supportsEditOrder = exchangeConfig?.supports_edit_order ?? true;

  // Skip if trailing is not active
  if (!ticket.trailing_active) {
    return {
      updated: false,
      newTrailingPrice: null,
      newMaxProfit: null,
      slOrder: null,
    };
  }

  const entryPrice = d(ticket.entry_price);
  const prevMaxProfit = d(ticket.max_profit ?? "0");
  const currentTrailingPrice = d(ticket.trailing_price ?? ticket.entry_price);

  // 1. Calculate current max profit
  const currentMaxProfit = calcMaxProfit(entryPrice, currentPrice, ticket.direction);

  // 2. Use maximum of previous and current
  const newMaxProfit = decMax(prevMaxProfit, currentMaxProfit);

  // 3. Calculate new trailing SL
  const newTrailingSl = calculateTrailingSl(entryPrice, newMaxProfit, ticket.direction);

  // 4. Check if SL should be updated (ratchet: only moves in favorable direction)
  const shouldUpdate = shouldUpdateTrailingSl(
    currentTrailingPrice,
    newTrailingSl,
    ticket.direction,
  );

  if (!shouldUpdate) {
    return {
      updated: false,
      newTrailingPrice: null,
      newMaxProfit: null,
      slOrder: null,
    };
  }

  // 5. Move SL on exchange
  const intentId = crypto.randomUUID();
  const slOrder = await moveSl(
    adapter,
    ticket,
    newTrailingSl,
    exchange,
    intentId,
    supportsEditOrder,
  );

  log.info("trailing SL updated", {
    symbol: ticket.symbol,
    exchange: ticket.exchange,
    prevSl: currentTrailingPrice.toString(),
    newSl: newTrailingSl.toString(),
    maxProfit: newMaxProfit.toString(),
  });

  return {
    updated: true,
    newTrailingPrice: newTrailingSl,
    newMaxProfit,
    slOrder,
  };
}

// ---------------------------------------------------------------------------
// updateTpPrices
// ---------------------------------------------------------------------------

/**
 * Builds TP price update fields for the ticket.
 * Returns serialized values ready for DB update.
 */
export function updateTpPrices(params: TpUpdateParams): TpUpdateResult {
  return {
    tp1_price: params.tp1Price !== null ? params.tp1Price.toString() : null,
    tp2_price: params.tp2Price !== null ? params.tp2Price.toString() : null,
  };
}

// ---------------------------------------------------------------------------
// updateMfeMae
// ---------------------------------------------------------------------------

/**
 * Builds MFE/MAE update fields for the ticket.
 * Returns serialized values ready for DB update.
 */
export function updateMfeMae(params: MfeMaeUpdateParams): MfeMaeUpdateResult {
  return {
    max_favorable: params.mfe.toString(),
    max_adverse: params.mae.toString(),
  };
}
