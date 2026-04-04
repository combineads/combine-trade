/**
 * Kill switch — emergency script to flatten all positions and halt trading.
 *
 * Steps:
 * 1. Fetch positions from ALL exchanges (sequential per exchange)
 * 2. For each position: emergencyClose (reduceOnly market close)
 * 3. Cancel all open orders
 * 4. Update ALL SymbolState.execution_mode → 'analysis'
 * 5. Insert EventLog KILL_SWITCH event
 * 6. Send Slack "KILL SWITCH ACTIVATED" alert
 *
 * Error handling: if one exchange fails, log and continue to next.
 * Exit code 0 on full success, 1 on partial failure.
 *
 * Layer: L0 (operational script — runs outside daemon)
 */

import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Exchange } from "@/core/types";
import type { EmergencyCloseParams } from "@/orders/executor";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("kill-switch");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An open order that can be cancelled */
export type OpenOrder = {
  exchangeOrderId: string;
  symbol: string;
  exchange: Exchange;
};

/** Dependency injection interface for kill switch */
export type KillSwitchDeps = {
  /** Map of exchange → adapter, for all configured exchanges */
  adapters: ReadonlyMap<Exchange, ExchangeAdapter>;

  /** Execute emergency close for a position */
  emergencyClose: (params: EmergencyCloseParams) => Promise<void>;

  /** Fetch all open (cancellable) orders from DB, keyed by exchange */
  getOpenOrders: () => Promise<OpenOrder[]>;

  /** Cancel a single order on the exchange */
  cancelOrder: (adapter: ExchangeAdapter, orderId: string, symbol: string) => Promise<void>;

  /** Update ALL SymbolState rows: set execution_mode = 'analysis' */
  updateAllExecutionMode: () => Promise<number>;

  /** Insert a KILL_SWITCH event into the event_log */
  insertKillSwitchEvent: (data: Record<string, unknown>) => Promise<void>;

  /** Send Slack alert (fire-and-forget) */
  sendAlert: (details: Record<string, string | number | boolean>) => Promise<void>;
};

/** Result returned by killSwitch() */
export type KillSwitchResult = {
  positionsClosed: number;
  ordersCancelled: number;
  errors: string[];
  exchangesFailed: string[];
};

// ---------------------------------------------------------------------------
// killSwitch — core logic (injectable deps)
// ---------------------------------------------------------------------------

/**
 * Executes the kill switch sequence:
 * 1. Fetch and close all positions across all exchanges
 * 2. Cancel all open orders
 * 3. Set all SymbolState.execution_mode → 'analysis'
 * 4. Record KILL_SWITCH event log
 * 5. Send Slack alert
 *
 * Individual exchange failures are logged and collected but do not
 * abort the sequence for other exchanges.
 */
export async function killSwitch(deps: KillSwitchDeps): Promise<KillSwitchResult> {
  const {
    adapters,
    emergencyClose,
    getOpenOrders,
    cancelOrder,
    updateAllExecutionMode,
    insertKillSwitchEvent,
    sendAlert,
  } = deps;

  const errors: string[] = [];
  const exchangesFailed: string[] = [];
  let positionsClosed = 0;
  let ordersCancelled = 0;

  log.warn("KILL SWITCH ACTIVATED", {});

  // ---- Step 1: Fetch + close all positions (sequential per exchange) ----

  for (const [exchange, adapter] of adapters) {
    log.info("fetching positions", { exchange });

    let positions: ExchangePosition[];

    try {
      positions = await adapter.fetchPositions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errMsg = `${exchange}: fetchPositions failed — ${msg}`;
      log.error("exchange fetch failed", { exchange, error: msg });
      errors.push(errMsg);
      exchangesFailed.push(exchange);
      continue;
    }

    log.info("positions fetched", { exchange, count: positions.length.toString() });

    // ---- Step 2: Emergency close each position ----

    for (const position of positions) {
      const intentId = crypto.randomUUID();

      try {
        await emergencyClose({
          adapter,
          symbol: position.symbol,
          exchange: position.exchange,
          size: position.size,
          direction: position.side,
          intentId,
        });

        positionsClosed++;
        log.info("position closed", {
          exchange: position.exchange,
          symbol: position.symbol,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const errMsg = `${exchange}/${position.symbol}: emergencyClose failed — ${msg}`;
        log.error("emergency close failed", {
          exchange: position.exchange,
          symbol: position.symbol,
          error: msg,
        });
        errors.push(errMsg);
      }
    }
  }

  // ---- Step 3: Cancel all open orders ----

  let openOrders: OpenOrder[];

  try {
    openOrders = await getOpenOrders();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("getOpenOrders failed", { error: msg });
    errors.push(`getOpenOrders failed — ${msg}`);
    openOrders = [];
  }

  for (const order of openOrders) {
    const adapter = adapters.get(order.exchange);
    if (adapter === undefined) {
      const errMsg = `${order.exchange}: no adapter for order ${order.exchangeOrderId}`;
      log.warn("no adapter for order", { exchange: order.exchange });
      errors.push(errMsg);
      continue;
    }

    try {
      await cancelOrder(adapter, order.exchangeOrderId, order.symbol);
      ordersCancelled++;
      log.info("order cancelled", {
        exchange: order.exchange,
        symbol: order.symbol,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errMsg = `${order.exchange}/${order.symbol}: cancelOrder(${order.exchangeOrderId}) failed — ${msg}`;
      log.error("cancel order failed", {
        exchange: order.exchange,
        symbol: order.symbol,
        error: msg,
      });
      errors.push(errMsg);
    }
  }

  // ---- Step 4: Update ALL SymbolState.execution_mode → 'analysis' ----

  let symbolsUpdated = 0;

  try {
    symbolsUpdated = await updateAllExecutionMode();
    log.info("execution_mode reset to analysis", { count: symbolsUpdated.toString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("updateAllExecutionMode failed", { error: msg });
    errors.push(`updateAllExecutionMode failed — ${msg}`);
  }

  // ---- Step 5: Insert EventLog KILL_SWITCH ----

  try {
    await insertKillSwitchEvent({
      positionsClosed,
      ordersCancelled,
      symbolsUpdated,
      errors: errors.length,
      exchangesFailed: exchangesFailed.join(","),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("insertKillSwitchEvent failed", { error: msg });
    errors.push(`insertKillSwitchEvent failed — ${msg}`);
  }

  // ---- Step 6: Send Slack alert (fire-and-forget) ----

  try {
    await sendAlert({
      event: "KILL SWITCH ACTIVATED",
      positionsClosed,
      ordersCancelled,
      errors: errors.length,
      exchangesFailed: exchangesFailed.join(", ") || "none",
    });
  } catch {
    // fire-and-forget — never throw
  }

  log.warn("kill switch sequence complete", {
    positionsClosed: positionsClosed.toString(),
    ordersCancelled: ordersCancelled.toString(),
    errors: errors.length.toString(),
  });

  return { positionsClosed, ordersCancelled, errors, exchangesFailed };
}

// ---------------------------------------------------------------------------
// Main script block
// ---------------------------------------------------------------------------

if (import.meta.main) {
  /**
   * Wire up real implementations and run the kill switch.
   * Exits with code 0 on full success, 1 on partial failure.
   */
  (async () => {
    const { initDb, getDb, closePool } = await import("@/db/pool");
    const { emergencyClose } = await import("@/orders/executor");
    const { symbolStateTable, orderTable, ticketTable } = await import("@/db/schema");
    const { insertEvent } = await import("@/db/event-log");
    const { sendSlackAlert, SlackEventType } = await import("@/notifications/slack");
    const { inArray, eq, and, isNotNull } = await import("drizzle-orm");
    const { createExchangeAdapter } = await import("@/exchanges/index");

    // Initialise DB
    await initDb();
    const db = getDb();

    // Build adapter map from environment / config
    // Only include exchanges that have API keys configured
    const adapterMap = new Map<Exchange, ExchangeAdapter>();

    const exchangeEnvMap: Record<Exchange, { key: string; secret: string }> = {
      binance: {
        key: process.env.BINANCE_API_KEY ?? "",
        secret: process.env.BINANCE_API_SECRET ?? "",
      },
      okx: { key: process.env.OKX_API_KEY ?? "", secret: process.env.OKX_API_SECRET ?? "" },
      bitget: {
        key: process.env.BITGET_API_KEY ?? "",
        secret: process.env.BITGET_API_SECRET ?? "",
      },
      mexc: { key: process.env.MEXC_API_KEY ?? "", secret: process.env.MEXC_API_SECRET ?? "" },
    };

    for (const [exchange, { key, secret }] of Object.entries(exchangeEnvMap) as [
      Exchange,
      { key: string; secret: string },
    ][]) {
      if (key && secret) {
        try {
          const adapter = createExchangeAdapter(exchange, { apiKey: key, apiSecret: secret });
          adapterMap.set(exchange, adapter);
          log.info("adapter initialised", { exchange });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn("adapter init failed", { exchange, error: msg });
        }
      }
    }

    if (adapterMap.size === 0) {
      log.warn("no adapters configured — kill switch will skip position closing", {});
    }

    const deps: KillSwitchDeps = {
      adapters: adapterMap,

      emergencyClose: async (params) => {
        await emergencyClose(params);
      },

      getOpenOrders: async () => {
        // Join orders → tickets to get the symbol needed for cancelOrder
        const rows = await db
          .select({
            exchangeOrderId: orderTable.exchange_order_id,
            symbol: ticketTable.symbol,
            exchange: orderTable.exchange,
          })
          .from(orderTable)
          .innerJoin(ticketTable, eq(orderTable.ticket_id, ticketTable.id))
          .where(
            and(inArray(orderTable.status, ["PENDING"]), isNotNull(orderTable.exchange_order_id)),
          );

        return rows
          .filter((r) => r.exchangeOrderId !== null)
          .map((r) => ({
            exchangeOrderId: r.exchangeOrderId as string,
            symbol: r.symbol,
            exchange: r.exchange as Exchange,
          }));
      },

      cancelOrder: async (adapter, orderId, symbol) => {
        await adapter.cancelOrder(orderId, symbol);
      },

      updateAllExecutionMode: async () => {
        const result = await db
          .update(symbolStateTable)
          .set({ execution_mode: "analysis" })
          .returning({ id: symbolStateTable.id });
        return result.length;
      },

      insertKillSwitchEvent: async (data) => {
        await insertEvent(db, {
          event_type: "KILL_SWITCH",
          data,
        });
      },

      sendAlert: async (details) => {
        await sendSlackAlert(SlackEventType.DAEMON_STOP, details, db);
      },
    };

    const result = await killSwitch(deps);

    log.info("kill switch result", {
      positionsClosed: result.positionsClosed.toString(),
      ordersCancelled: result.ordersCancelled.toString(),
      errors: result.errors.length.toString(),
      exchangesFailed: result.exchangesFailed.join(", ") || "none",
    });

    await closePool();

    const exitCode = result.errors.length > 0 ? 1 : 0;
    process.exit(exitCode);
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("kill switch fatal error", { error: msg });
    process.exit(1);
  });
}
