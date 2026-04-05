/**
 * Reconciliation worker — 60s setTimeout chain that compares exchange positions
 * against DB tickets and takes corrective action on mismatches.
 *
 * Business rules:
 * 1. setTimeout chain (NOT setInterval) for drift-free scheduling
 * 2. runOnce: snapshot time -> fetchPositions (all exchanges) -> get active tickets
 *    -> get pending order symbols -> comparePositions -> execute actions
 * 3. Unmatched -> emergencyClose + EventLog RECONCILIATION
 * 4. Orphaned -> SymbolState IDLE + EventLog RECONCILIATION
 * 5. Matched -> EventLog RECONCILIATION (normal)
 * 6. Exchange API failure -> skip that exchange, continue others, log error
 * 7. stop() cancels next cycle
 *
 * Layer: L7 (reconciliation)
 */

import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Exchange } from "@/core/types";
import { comparePositions, type TicketSnapshot } from "./comparator";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("reconciliation-worker");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the reconciliation worker */
export type ReconciliationConfig = {
  /** Interval between reconciliation runs in milliseconds (default: 60000) */
  intervalMs: number;
};

/** Error encountered while fetching from an exchange */
export type ExchangeError = {
  exchange: Exchange;
  error: string;
};

/** Result of a single reconciliation run */
export type ReconciliationRunResult = {
  snapshotTime: Date;
  matched: number;
  unmatched: number;
  orphaned: number;
  excluded: number;
  errors: ExchangeError[];
  /** Number of action errors (e.g., emergencyClose failures) */
  actionErrors: number;
  durationMs: number;
};

/** Handle returned by startReconciliation for lifecycle control */
export type ReconciliationHandle = {
  stop: () => void;
};

/**
 * Dependency injection interface for the reconciliation worker.
 * Keeps the worker testable by abstracting DB and order operations.
 *
 * IMPORTANT — getActiveTickets implementation contract:
 *   The implementation MUST use SELECT ... FOR UPDATE to lock the rows for
 *   the duration of the reconciliation transaction. This prevents race
 *   conditions where another process modifies a SymbolState row between the
 *   point of reading and the point of applying corrective action.
 *   Example (postgres.js):
 *     sql`SELECT ... FROM tickets WHERE state != 'CLOSED' FOR UPDATE`
 */
export type ReconciliationDeps = {
  /** Fetch active tickets (state != 'CLOSED') from DB.
   *  Implementation MUST use SELECT ... FOR UPDATE to lock rows. */
  getActiveTickets: () => Promise<TicketSnapshot[]>;

  /** Fetch set of "symbol:exchange" keys with pending orders */
  getPendingSymbols: () => Promise<Set<string>>;

  /** Execute emergency close for an unmatched position */
  emergencyClose: (params: {
    symbol: string;
    exchange: Exchange;
    adapter: ExchangeAdapter;
    position: ExchangePosition;
  }) => Promise<void>;

  /** Set symbol_state.fsm_state to IDLE for an orphaned ticket */
  setSymbolStateIdle: (symbol: string, exchange: Exchange) => Promise<void>;

  /** Insert an event log entry */
  insertEvent: (
    eventType: string,
    data: Record<string, unknown>,
    meta?: { symbol?: string; exchange?: string },
  ) => Promise<void>;

  /**
   * Send a Slack alert (optional).
   * Called fire-and-forget after each successful panic close.
   * Errors are swallowed — reconciliation continues regardless.
   * Implement using sendSlackAlert(SlackEventType.RECONCILIATION_MISMATCH, details).
   */
  sendSlackAlert?: (
    eventType: string,
    details: Record<string, string | number | boolean | undefined>,
  ) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ReconciliationConfig = {
  intervalMs: 60_000,
};

// ---------------------------------------------------------------------------
// runOnce — single reconciliation cycle
// ---------------------------------------------------------------------------

/**
 * Executes a single reconciliation cycle:
 * 1. Record snapshotTime
 * 2. Fetch positions from all exchange adapters
 * 3. Fetch active tickets + pending symbols from DB
 * 4. Compare positions vs tickets
 * 5. Act on mismatches: emergencyClose (unmatched), IDLE (orphaned)
 * 6. Log results
 */
export async function runOnce(
  adapters: ReadonlyMap<Exchange, ExchangeAdapter>,
  deps: ReconciliationDeps,
): Promise<ReconciliationRunResult> {
  const startMs = Date.now();
  const snapshotTime = new Date(startMs);
  const errors: ExchangeError[] = [];
  let actionErrors = 0;

  // ---- 1. Fetch positions from all exchanges (tolerate individual failures) ----
  const allPositions: ExchangePosition[] = [];

  const fetchPromises = Array.from(adapters.entries()).map(async ([exchange, adapter]) => {
    try {
      const positions = await adapter.fetchPositions();
      return { exchange, positions, error: null };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("exchange fetch failed", { exchange, error: errorMsg });
      return { exchange, positions: null, error: errorMsg };
    }
  });

  const fetchResults = await Promise.all(fetchPromises);

  for (const result of fetchResults) {
    if (result.error !== null) {
      errors.push({ exchange: result.exchange, error: result.error });
    } else if (result.positions !== null) {
      allPositions.push(...result.positions);
    }
  }

  // ---- 2. Fetch active tickets and pending symbols ----
  const [activeTickets, pendingSymbols] = await Promise.all([
    deps.getActiveTickets(),
    deps.getPendingSymbols(),
  ]);

  // ---- 3. Compare positions vs tickets ----
  const comparison = comparePositions(allPositions, activeTickets, pendingSymbols, snapshotTime);

  // ---- 4. Act on unmatched positions (panic close) ----
  for (const { position } of comparison.unmatched) {
    const adapter = adapters.get(position.exchange);
    if (adapter === undefined) {
      log.error("no adapter for unmatched position", {
        symbol: position.symbol,
        exchange: position.exchange,
      });
      actionErrors++;
      continue;
    }

    try {
      await deps.emergencyClose({
        symbol: position.symbol,
        exchange: position.exchange,
        adapter,
        position,
      });

      await deps.insertEvent(
        "RECONCILIATION",
        {
          action: "PANIC_CLOSE",
          symbol: position.symbol,
          exchange: position.exchange,
          size: position.size.toString(),
          side: position.side,
        },
        { symbol: position.symbol, exchange: position.exchange },
      );

      // Fire-and-forget Slack alert — never blocks reconciliation
      if (deps.sendSlackAlert !== undefined) {
        deps
          .sendSlackAlert("RECONCILIATION_MISMATCH", {
            symbol: position.symbol,
            exchange: position.exchange,
            size: position.size.toString(),
            side: position.side,
            // <!channel> triggers Slack @channel mention for panic close urgency
            slackPrefix: "<!channel>",
          })
          .catch((alertErr: unknown) => {
            log.warn("sendSlackAlert failed after panic close", {
              symbol: position.symbol,
              exchange: position.exchange,
              error: alertErr instanceof Error ? alertErr.message : String(alertErr),
            });
          });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("action failed for unmatched position", {
        symbol: position.symbol,
        exchange: position.exchange,
        error: errorMsg,
      });
      actionErrors++;
    }
  }

  // ---- 5. Act on orphaned tickets (set IDLE) ----
  for (const { ticket } of comparison.orphaned) {
    try {
      await deps.setSymbolStateIdle(ticket.symbol, ticket.exchange);

      await deps.insertEvent(
        "RECONCILIATION",
        {
          action: "ORPHAN_IDLE",
          symbol: ticket.symbol,
          exchange: ticket.exchange,
          ticketId: ticket.id,
        },
        { symbol: ticket.symbol, exchange: ticket.exchange },
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("action failed for orphaned ticket", {
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        error: errorMsg,
      });
      actionErrors++;
    }
  }

  // ---- 6. Log matched results ----
  if (comparison.matched.length > 0 || comparison.unmatched.length === 0) {
    try {
      await deps.insertEvent("RECONCILIATION", {
        action: "MATCHED",
        count: comparison.matched.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("failed to log matched event", { error: errorMsg });
      actionErrors++;
    }
  }

  const durationMs = Date.now() - startMs;

  const result: ReconciliationRunResult = {
    snapshotTime,
    matched: comparison.matched.length,
    unmatched: comparison.unmatched.length,
    orphaned: comparison.orphaned.length,
    excluded: comparison.excluded.length,
    errors,
    actionErrors,
    durationMs,
  };

  log.info("reconciliation cycle complete", {
    matched: result.matched.toString(),
    unmatched: result.unmatched.toString(),
    orphaned: result.orphaned.toString(),
    excluded: result.excluded.toString(),
    exchangeErrors: errors.length.toString(),
    actionErrors: actionErrors.toString(),
    durationMs: durationMs.toString(),
  });

  return result;
}

// ---------------------------------------------------------------------------
// startReconciliation — setTimeout chain
// ---------------------------------------------------------------------------

/**
 * Starts the reconciliation worker using a setTimeout chain.
 * Runs the first cycle immediately, then schedules subsequent cycles
 * after each completes (drift-free).
 *
 * @returns A handle with a stop() method to cancel the next cycle.
 */
export function startReconciliation(
  adapters: ReadonlyMap<Exchange, ExchangeAdapter>,
  deps: ReconciliationDeps,
  config?: Partial<ReconciliationConfig>,
): ReconciliationHandle {
  const { intervalMs } = { ...DEFAULT_CONFIG, ...config };
  let stopped = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  async function cycle(): Promise<void> {
    if (stopped) return;

    try {
      await runOnce(adapters, deps);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("reconciliation cycle threw unexpected error", {
        error: errorMsg,
      });
    }

    if (!stopped) {
      timerId = setTimeout(cycle, intervalMs);
    }
  }

  // Start the first cycle immediately (via setTimeout(0) so stop() can preempt)
  timerId = setTimeout(cycle, 0);

  log.info("reconciliation worker started", {
    intervalMs: intervalMs.toString(),
  });

  return {
    stop() {
      stopped = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      log.info("reconciliation worker stopped");
    },
  };
}
