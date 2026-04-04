/**
 * Graceful shutdown — orchestrates the daemon shutdown sequence.
 *
 * Shutdown steps (in order):
 *   1. Stop CandleManager (no new candle events)
 *   2. Stop reconciliation worker
 *   3. Cancel PENDING orders (exchange_order_id IS NOT NULL)
 *   4. Close DB pool
 *   5. Send Slack "DAEMON SHUTDOWN" alert (fire-and-forget)
 *
 * A 30-second timeout forces process.exit(1) if shutdown takes too long.
 * Open positions are NOT closed — SL is registered on the exchange.
 *
 * Layer: L9 (daemon) — may import any lower layer.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type { Exchange, ExecutionMode } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { orderTable, symbolStateTable, ticketTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("shutdown");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pending order record returned by getPendingOrders() */
export type PendingOrder = {
  exchangeOrderId: string;
  symbol: string;
  exchange: Exchange;
};

/**
 * Dependency injection interface for graceful shutdown.
 * All external side-effects are injectable for testability.
 */
export type ShutdownDeps = {
  /** CandleManager — stop() prevents new candle events */
  candleManager: { stop(): Promise<void> };

  /** Reconciliation worker handle */
  reconciliationHandle: { stop(): void };

  /** Exchange adapters keyed by exchange name */
  adapters: Map<Exchange, ExchangeAdapter>;

  /** Fetch all PENDING orders that have an exchange_order_id from DB */
  getPendingOrders: () => Promise<PendingOrder[]>;

  /**
   * Cancel a single order on the exchange.
   * Errors are caught per-order — never abort the full shutdown.
   */
  cancelOrder: (adapter: ExchangeAdapter, orderId: string, symbol: string) => Promise<void>;

  /** Close the DB connection pool */
  closePool: () => Promise<void>;

  /** Send a Slack alert (fire-and-forget — never throws) */
  sendSlackAlert: (details: Record<string, string | number | boolean | undefined>) => Promise<void>;
};

// ---------------------------------------------------------------------------
// gracefulShutdown
// ---------------------------------------------------------------------------

/**
 * Executes the graceful shutdown sequence.
 *
 * Enforces a 30-second timeout — if shutdown takes longer, calls
 * process.exit(1) to prevent hanging indefinitely.
 *
 * Never throws (all internal errors are caught and logged).
 */
export async function gracefulShutdown(deps: ShutdownDeps): Promise<void> {
  log.info("graceful_shutdown_starting");

  // 30-second timeout guard
  const timeoutHandle = setTimeout(() => {
    log.error("graceful_shutdown_timeout", {
      details: { message: "shutdown exceeded 30s — forcing exit" },
    });
    process.exit(1);
  }, 30_000);

  try {
    // ---- Step 1: Stop CandleManager ----
    try {
      await deps.candleManager.stop();
      log.info("candle_manager_stopped");
    } catch (err) {
      log.error("candle_manager_stop_failed", {
        details: { error: String(err) },
      });
    }

    // ---- Step 2: Stop reconciliation worker ----
    try {
      deps.reconciliationHandle.stop();
      log.info("reconciliation_stopped");
    } catch (err) {
      log.error("reconciliation_stop_failed", {
        details: { error: String(err) },
      });
    }

    // ---- Step 3: Cancel PENDING orders (per-order, never abort full shutdown) ----
    let pendingOrders: PendingOrder[] = [];

    try {
      pendingOrders = await deps.getPendingOrders();
      log.info("pending_orders_fetched", {
        details: { count: pendingOrders.length },
      });
    } catch (err) {
      log.error("pending_orders_fetch_failed", {
        details: { error: String(err) },
      });
    }

    for (const order of pendingOrders) {
      const adapter = deps.adapters.get(order.exchange);

      if (adapter === undefined) {
        log.warn("no_adapter_for_order", {
          symbol: order.symbol,
          exchange: order.exchange,
          details: { exchangeOrderId: order.exchangeOrderId },
        });
        continue;
      }

      try {
        await deps.cancelOrder(adapter, order.exchangeOrderId, order.symbol);
        log.info("order_cancelled", {
          symbol: order.symbol,
          exchange: order.exchange,
          details: { exchangeOrderId: order.exchangeOrderId },
        });
      } catch (err) {
        // Per-order error: log and continue with the next order
        log.error("order_cancel_failed", {
          symbol: order.symbol,
          exchange: order.exchange,
          details: { exchangeOrderId: order.exchangeOrderId, error: String(err) },
        });
      }
    }

    // ---- Step 4: Close DB pool ----
    try {
      await deps.closePool();
      log.info("db_pool_closed");
    } catch (err) {
      log.error("db_pool_close_failed", {
        details: { error: String(err) },
      });
    }

    // ---- Step 5: Send Slack "DAEMON SHUTDOWN" alert (fire-and-forget) ----
    deps
      .sendSlackAlert({
        event: "DAEMON_SHUTDOWN",
        cancelledOrders: pendingOrders.length,
      })
      .catch((err: unknown) => {
        log.error("slack_alert_failed", {
          details: { error: String(err) },
        });
      });

    log.info("graceful_shutdown_complete");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ---------------------------------------------------------------------------
// getExecutionMode
// ---------------------------------------------------------------------------

/**
 * Reads the execution_mode for a given symbol+exchange from symbol_state.
 * Returns null if no row is found.
 */
export async function getExecutionMode(
  db: DbInstance,
  symbol: string,
  exchange: Exchange,
): Promise<ExecutionMode | null> {
  const rows = await db
    .select({ execution_mode: symbolStateTable.execution_mode })
    .from(symbolStateTable)
    .where(and(eq(symbolStateTable.symbol, symbol), eq(symbolStateTable.exchange, exchange)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return rows[0]?.execution_mode as ExecutionMode;
}

// ---------------------------------------------------------------------------
// buildGetPendingOrders — factory that creates the getPendingOrders function
// ---------------------------------------------------------------------------

/**
 * Creates a getPendingOrders function bound to a specific DB instance.
 * Fetches all orders with status='PENDING' and a non-null exchange_order_id.
 * Joins with tickets to retrieve the symbol for each order.
 */
export function buildGetPendingOrders(db: DbInstance): () => Promise<PendingOrder[]> {
  return async function getPendingOrders(): Promise<PendingOrder[]> {
    const rows = await db
      .select({
        exchangeOrderId: orderTable.exchange_order_id,
        symbol: ticketTable.symbol,
        exchange: orderTable.exchange,
      })
      .from(orderTable)
      .innerJoin(ticketTable, eq(orderTable.ticket_id, ticketTable.id))
      .where(and(eq(orderTable.status, "PENDING"), isNotNull(orderTable.exchange_order_id)));

    return rows
      .filter(
        (r): r is { exchangeOrderId: string; symbol: string; exchange: string } =>
          r.exchangeOrderId !== null,
      )
      .map((r) => ({
        exchangeOrderId: r.exchangeOrderId,
        symbol: r.symbol,
        exchange: r.exchange as Exchange,
      }));
  };
}
