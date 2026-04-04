/**
 * Order executor — entry order, SL registration, slippage guard, emergency close.
 *
 * Business rules:
 * 1. Mode guard: analysis mode -> hard error. alert/live -> proceed.
 * 2. Entry order: market order via adapter.createOrder()
 * 3. SL registration: IMMEDIATELY after entry fill. Bracket order first, 2-step fallback.
 *    - 3 retries on failure, emergency close after all fail
 *    - 3-second timeout on 2-step SL
 * 4. Slippage check: after entry fill. If failed -> emergency close
 * 5. Emergency close: market close (reduceOnly) + PANIC_CLOSE order record
 * 6. All orders recorded with idempotency_key + intent_id
 *
 * Layer: L6 (orders)
 */

import type Decimal from "decimal.js";

import { sub } from "@/core/decimal";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, OrderResult } from "@/core/ports";
import {
  closeSide,
  type Direction,
  type Exchange,
  type ExecutionMode,
  type OrderSide,
  type OrderStatus,
  type OrderType,
} from "@/core/types";
import type { NewOrderRow } from "@/db/schema";
import { checkSlippage, type SlippageConfig } from "./slippage";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("executor");

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ExecutionModeError extends Error {
  constructor(mode: ExecutionMode) {
    super(`Cannot execute orders in '${mode}' mode. Only 'alert' and 'live' modes are allowed.`);
    this.name = "ExecutionModeError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of SL registration retries before emergency close */
const SL_MAX_RETRIES = 3;

/** Maximum elapsed time (ms) for 2-step SL registration before emergency close */
const SL_TIMEOUT_MS = 3_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecuteEntryParams = {
  adapter: ExchangeAdapter;
  symbol: string;
  exchange: Exchange;
  mode: ExecutionMode;
  direction: Direction;
  entryPrice: Decimal;
  slPrice: Decimal;
  size: Decimal;
  leverage: number;
  slippageConfig: SlippageConfig;
};

/** Lightweight order row (pre-DB insert shape) returned from the executor */
export type OrderRecord = NewOrderRow;

export type ExecuteEntryResult = {
  success: boolean;
  entryOrder: OrderRecord | null;
  slOrder: OrderRecord | null;
  aborted: boolean;
  abortReason?: string;
};

export type EmergencyCloseParams = {
  adapter: ExchangeAdapter;
  symbol: string;
  exchange: Exchange;
  size: Decimal;
  direction: Direction;
  intentId: string;
};

export type RecordOrderParams = {
  exchange: Exchange;
  orderType: OrderType;
  status: OrderStatus;
  side: OrderSide;
  size: Decimal;
  intentId: string;
  idempotencyKey: string;
  ticketId?: string;
  price?: Decimal;
  expectedPrice?: Decimal;
  filledPrice?: Decimal;
  filledSize?: Decimal;
  exchangeOrderId?: string;
  slippage?: Decimal;
  errorMessage?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entrySide(direction: Direction): OrderSide {
  return direction === "LONG" ? "BUY" : "SELL";
}

function decimalToStr(v: Decimal | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  return v.toString();
}

// ---------------------------------------------------------------------------
// recordOrder — builds an order row (no DB write; caller inserts)
// ---------------------------------------------------------------------------

/**
 * Builds a NewOrderRow with all required fields. Decimal values are serialized
 * to strings for the numeric columns.
 */
export function recordOrder(params: RecordOrderParams): NewOrderRow {
  return {
    ticket_id: params.ticketId ?? null,
    exchange: params.exchange,
    order_type: params.orderType,
    status: params.status,
    side: params.side,
    size: params.size.toString(),
    intent_id: params.intentId,
    idempotency_key: params.idempotencyKey,
    price: decimalToStr(params.price),
    expected_price: decimalToStr(params.expectedPrice),
    filled_price: decimalToStr(params.filledPrice),
    filled_size: decimalToStr(params.filledSize),
    exchange_order_id: params.exchangeOrderId ?? null,
    slippage: decimalToStr(params.slippage),
    error_message: params.errorMessage ?? null,
  };
}

// ---------------------------------------------------------------------------
// emergencyClose
// ---------------------------------------------------------------------------

/**
 * Emergency close: market sell/buy (reduceOnly) to flatten the position.
 * Returns a PANIC_CLOSE order record.
 */
export async function emergencyClose(params: EmergencyCloseParams): Promise<NewOrderRow> {
  const { adapter, symbol, exchange, size, direction, intentId } = params;
  const side = closeSide(direction);
  const idempotencyKey = crypto.randomUUID();

  log.warn("emergency close initiated", { symbol, exchange, direction, size: size.toString() });

  try {
    const result = await adapter.createOrder({
      symbol,
      side,
      size,
      type: "market",
      reduceOnly: true,
    });

    const orderParams: RecordOrderParams = {
      exchange: exchange as Exchange,
      orderType: "PANIC_CLOSE",
      status: result.status,
      side,
      size,
      intentId,
      idempotencyKey,
      exchangeOrderId: result.exchangeOrderId,
    };
    if (result.filledPrice != null) {
      orderParams.filledPrice = result.filledPrice;
    }
    if (result.filledSize != null) {
      orderParams.filledSize = result.filledSize;
    }
    const order = recordOrder(orderParams);

    log.warn("emergency close completed", {
      symbol,
      exchange,
      orderId: result.orderId,
    });

    return order;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("emergency close FAILED", { symbol, exchange, error: errorMessage });

    return recordOrder({
      exchange: exchange as Exchange,
      orderType: "PANIC_CLOSE",
      status: "FAILED",
      side,
      size,
      intentId,
      idempotencyKey,
      errorMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// attemptBracketEntry — try a bracket order (entry + SL in one call)
// ---------------------------------------------------------------------------

type BracketResult = {
  success: boolean;
  entryResult?: OrderResult;
};

async function attemptBracketEntry(
  adapter: ExchangeAdapter,
  symbol: string,
  direction: Direction,
  size: Decimal,
  slPrice: Decimal,
): Promise<BracketResult> {
  try {
    const result = await adapter.createOrder({
      symbol,
      side: entrySide(direction),
      size,
      type: "market",
      stopLoss: slPrice,
    });
    return { success: true, entryResult: result };
  } catch {
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// attemptPlainEntry — market entry without bracket
// ---------------------------------------------------------------------------

async function attemptPlainEntry(
  adapter: ExchangeAdapter,
  symbol: string,
  direction: Direction,
  size: Decimal,
): Promise<OrderResult> {
  return adapter.createOrder({
    symbol,
    side: entrySide(direction),
    size,
    type: "market",
  });
}

// ---------------------------------------------------------------------------
// attemptSlRegistration — 2-step SL with retries + timeout
// ---------------------------------------------------------------------------

type SlRegistrationResult = {
  success: boolean;
  result?: OrderResult;
  timedOut?: boolean;
};

async function attemptSlRegistration(
  adapter: ExchangeAdapter,
  symbol: string,
  direction: Direction,
  size: Decimal,
  slPrice: Decimal,
  startTime: number,
): Promise<SlRegistrationResult> {
  for (let attempt = 1; attempt <= SL_MAX_RETRIES; attempt++) {
    // Check timeout before each attempt
    const elapsed = Date.now() - startTime;
    if (elapsed > SL_TIMEOUT_MS) {
      return { success: false, timedOut: true };
    }

    try {
      const result = await adapter.createOrder({
        symbol,
        side: closeSide(direction),
        size,
        price: slPrice,
        type: "stop_market",
        reduceOnly: true,
      });

      return { success: true, result };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.warn("SL registration attempt failed", {
        symbol,
        attempt: attempt.toString(),
        error: errorMessage,
      });

      // Check timeout after failed attempt
      const postAttemptElapsed = Date.now() - startTime;
      if (postAttemptElapsed > SL_TIMEOUT_MS) {
        return { success: false, timedOut: true };
      }
    }
  }

  return { success: false, timedOut: false };
}

// ---------------------------------------------------------------------------
// executeEntry — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Executes a full entry flow:
 * 1. Mode guard (analysis -> error)
 * 2. Set leverage
 * 3. Attempt bracket order (entry + SL)
 * 4. If bracket fails: plain entry + 2-step SL with retries
 * 5. Slippage check after fill
 * 6. Emergency close on any critical failure
 */
export async function executeEntry(params: ExecuteEntryParams): Promise<ExecuteEntryResult> {
  const {
    adapter,
    symbol,
    exchange,
    mode,
    direction,
    entryPrice,
    slPrice,
    size,
    leverage,
    slippageConfig,
  } = params;

  // 1. Mode guard
  if (mode === "analysis") {
    throw new ExecutionModeError(mode);
  }

  const intentId = crypto.randomUUID();

  log.info("executeEntry started", {
    symbol,
    exchange,
    direction,
    entryPrice: entryPrice.toString(),
    slPrice: slPrice.toString(),
    size: size.toString(),
    leverage: leverage.toString(),
  });

  // 2. Set leverage
  await adapter.setLeverage(leverage, symbol);

  // 3. Attempt bracket order
  const bracketResult = await attemptBracketEntry(adapter, symbol, direction, size, slPrice);

  let entryResult: OrderResult;
  let bracketWorked = false;

  if (bracketResult.success && bracketResult.entryResult) {
    entryResult = bracketResult.entryResult;
    bracketWorked = true;
  } else {
    // 4. Fallback: plain entry without bracket
    log.info("bracket order not supported, falling back to 2-step", { symbol, exchange });
    try {
      entryResult = await attemptPlainEntry(adapter, symbol, direction, size);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error("entry order failed", { symbol, exchange, error: errorMessage });

      const failedEntry = recordOrder({
        exchange,
        orderType: "ENTRY",
        status: "FAILED",
        side: entrySide(direction),
        size,
        intentId,
        idempotencyKey: crypto.randomUUID(),
        expectedPrice: entryPrice,
        errorMessage,
      });

      return {
        success: false,
        entryOrder: failedEntry,
        slOrder: null,
        aborted: true,
        abortReason: `Entry order failed: ${errorMessage}`,
      };
    }
  }

  // Record entry fill time for SL timeout
  const entryFillTime = Date.now();

  // 5. Build entry order record
  const slippageValue =
    entryResult.filledPrice != null ? sub(entryResult.filledPrice, entryPrice) : undefined;

  const entryOrderParams: RecordOrderParams = {
    exchange,
    orderType: "ENTRY",
    status: entryResult.status,
    side: entrySide(direction),
    size,
    intentId,
    idempotencyKey: crypto.randomUUID(),
    expectedPrice: entryPrice,
    exchangeOrderId: entryResult.exchangeOrderId,
  };
  if (entryResult.filledPrice != null) {
    entryOrderParams.filledPrice = entryResult.filledPrice;
  }
  if (entryResult.filledSize != null) {
    entryOrderParams.filledSize = entryResult.filledSize;
  }
  if (slippageValue !== undefined) {
    entryOrderParams.slippage = slippageValue;
  }
  const entryOrder = recordOrder(entryOrderParams);

  // 6. Slippage check
  if (entryResult.filledPrice != null) {
    const slippageResult = checkSlippage(
      entryPrice,
      entryResult.filledPrice,
      slippageConfig.maxSpreadPct,
    );

    if (!slippageResult.passed) {
      log.warn("slippage exceeded threshold — aborting", {
        symbol,
        exchange,
        slippagePct: slippageResult.slippagePct.toString(),
        maxSpreadPct: slippageConfig.maxSpreadPct.toString(),
      });

      // Emergency close
      await emergencyClose({
        adapter,
        symbol,
        exchange,
        size,
        direction,
        intentId,
      });

      return {
        success: false,
        entryOrder,
        slOrder: null,
        aborted: true,
        abortReason: `slippage exceeded threshold: ${slippageResult.slippagePct.toString()} > ${slippageConfig.maxSpreadPct.toString()}`,
      };
    }
  }

  // 7. SL registration
  let slOrder: OrderRecord | null = null;

  if (bracketWorked) {
    // Bracket order already has SL; create a record for it
    slOrder = recordOrder({
      exchange,
      orderType: "SL",
      status: "FILLED",
      side: closeSide(direction),
      size,
      intentId,
      idempotencyKey: crypto.randomUUID(),
      price: slPrice,
      expectedPrice: slPrice,
    });
  } else {
    // 2-step: register SL separately
    const slResult = await attemptSlRegistration(
      adapter,
      symbol,
      direction,
      size,
      slPrice,
      entryFillTime,
    );

    if (slResult.success && slResult.result) {
      slOrder = recordOrder({
        exchange,
        orderType: "SL",
        status: slResult.result.status,
        side: closeSide(direction),
        size,
        intentId,
        idempotencyKey: crypto.randomUUID(),
        price: slPrice,
        expectedPrice: slPrice,
        exchangeOrderId: slResult.result.exchangeOrderId,
      });
    } else {
      // SL failed — emergency close
      const reason = slResult.timedOut
        ? "SL registration timed out (>3s)"
        : "SL registration failed after 3 retries";

      log.error(reason, { symbol, exchange });

      await emergencyClose({
        adapter,
        symbol,
        exchange,
        size,
        direction,
        intentId,
      });

      return {
        success: false,
        entryOrder,
        slOrder: null,
        aborted: true,
        abortReason: reason,
      };
    }
  }

  log.info("executeEntry completed successfully", {
    symbol,
    exchange,
    intentId,
  });

  return {
    success: true,
    entryOrder,
    slOrder,
    aborted: false,
  };
}
