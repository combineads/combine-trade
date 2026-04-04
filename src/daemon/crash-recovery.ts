/**
 * Crash recovery — runs once at daemon startup to reconcile exchange positions
 * against DB tickets and take corrective action on any mismatches caused by
 * an unclean shutdown.
 *
 * Business rules:
 * 1. Fetch positions from ALL exchanges (tolerate individual failures).
 * 2. Get active tickets + pending symbols from DB.
 * 3. Call comparePositions() to classify each position/ticket.
 * 4. Matched positions — check if SL order exists; re-register if missing.
 * 5. Unmatched positions — call emergencyClose().
 * 6. Orphaned tickets — setSymbolStateIdle().
 * 7. Restore loss counters from SymbolState.
 * 8. Insert EventLog CRASH_RECOVERY + Slack alert.
 *
 * Layer: L9 (daemon) — may import any lower layer.
 */

import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { DailyBias, Exchange, WatchSession } from "@/core/types";
import type { EmergencyCloseParams } from "@/orders/executor";
import type { ReconciliationResult, TicketSnapshot } from "@/reconciliation/comparator";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("crash-recovery");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a crash recovery run */
export type CrashRecoveryResult = {
  matched: number;
  unmatched: number;
  orphaned: number;
  slReRegistered: number;
  watchSessionsRestored: number;
  watchSessionsInvalidated: number;
  errors: string[];
  durationMs: number;
};

/**
 * Dependency injection interface for crash recovery.
 * All external side-effects are injected so the function is fully testable.
 */
export type CrashRecoveryDeps = {
  /** Exchange adapters keyed by exchange name */
  adapters: Map<Exchange, ExchangeAdapter>;

  /** Fetch active tickets (state != 'CLOSED') from DB */
  getActiveTickets: () => Promise<TicketSnapshot[]>;

  /** Fetch set of "symbol:exchange" keys with pending orders */
  getPendingSymbols: () => Promise<Set<string>>;

  /**
   * Compare exchange positions against DB tickets.
   * Signature matches reconciliation/comparator.ts comparePositions.
   */
  comparePositions: (
    exchangePositions: readonly ExchangePosition[],
    activeTickets: readonly TicketSnapshot[],
    pendingSymbols: ReadonlySet<string>,
    snapshotTime: Date,
  ) => ReconciliationResult;

  /**
   * Execute emergency close for an unmatched position.
   * Signature matches orders/executor.ts EmergencyCloseParams.
   */
  emergencyClose: (params: EmergencyCloseParams) => Promise<void>;

  /** Set symbol_state.fsm_state to IDLE for an orphaned ticket */
  setSymbolStateIdle: (symbol: string, exchange: Exchange) => Promise<void>;

  /**
   * Check if a stop-loss order currently exists on the exchange for
   * a given (symbol, exchange) pair.
   */
  checkSlOnExchange: (
    adapter: ExchangeAdapter,
    symbol: string,
    exchange: Exchange,
  ) => Promise<boolean>;

  /**
   * Re-register a stop-loss order on the exchange for a matched position
   * whose SL was found to be missing.
   */
  reRegisterSl: (
    adapter: ExchangeAdapter,
    symbol: string,
    exchange: Exchange,
    ticket: TicketSnapshot,
  ) => Promise<void>;

  /**
   * Restore in-memory loss counters from persistent SymbolState rows.
   * Called once after positions are reconciled.
   */
  restoreLossCounters: () => Promise<void>;

  /** Insert an event log entry */
  insertEvent: (
    type: string,
    data: Record<string, unknown>,
    meta?: { symbol?: string; exchange?: string },
  ) => Promise<void>;

  /** Fetch all active (non-invalidated) WatchSessions from DB */
  getActiveWatchSessions: () => Promise<WatchSession[]>;

  /**
   * Fetch the current daily bias for a (symbol, exchange) pair.
   * Returns null if no bias row exists yet.
   */
  getSymbolDailyBias: (symbol: string, exchange: string) => Promise<DailyBias | null>;

  /**
   * Mark a WatchSession as invalidated.
   * Called for sessions that fail bias-match or age checks during recovery.
   */
  invalidateWatchSession: (id: string, reason: string) => Promise<void>;

  /** Send a Slack alert (fire-and-forget — never throws) */
  sendSlackAlert: (details: Record<string, string | number | boolean | undefined>) => Promise<void>;
};

// ---------------------------------------------------------------------------
// recoverFromCrash
// ---------------------------------------------------------------------------

/**
 * Executes the crash recovery sequence on daemon startup.
 *
 * Returns a CrashRecoveryResult summarising what was found and corrected.
 * Never throws — all errors are captured in result.errors.
 */
export async function recoverFromCrash(deps: CrashRecoveryDeps): Promise<CrashRecoveryResult> {
  const startMs = Date.now();
  const errors: string[] = [];
  let slReRegistered = 0;
  let watchSessionsRestored = 0;
  let watchSessionsInvalidated = 0;

  log.info("crash_recovery_starting");

  // ---- Step 1: Fetch positions from ALL exchanges (tolerate failures) ----
  const allPositions: ExchangePosition[] = [];

  const fetchPromises = Array.from(deps.adapters.entries()).map(async ([exchange, adapter]) => {
    try {
      const positions = await adapter.fetchPositions();
      return { exchange, positions, error: null };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("exchange_fetch_failed", { exchange, error: errorMsg });
      return { exchange, positions: null as ExchangePosition[] | null, error: errorMsg };
    }
  });

  const fetchResults = await Promise.all(fetchPromises);

  for (const result of fetchResults) {
    if (result.error !== null) {
      errors.push(`${result.exchange}: fetchPositions failed: ${result.error}`);
    } else if (result.positions !== null) {
      allPositions.push(...result.positions);
    }
  }

  // ---- Step 2: Fetch active tickets + pending symbols from DB ----
  const snapshotTime = new Date(startMs);
  const [activeTickets, pendingSymbols] = await Promise.all([
    deps.getActiveTickets(),
    deps.getPendingSymbols(),
  ]);

  // ---- Step 3: Compare positions vs tickets (reuse comparator) ----
  const comparison = deps.comparePositions(
    allPositions,
    activeTickets,
    pendingSymbols,
    snapshotTime,
  );

  // ---- Step 4: Matched positions — check SL, re-register if missing ----
  for (const { position, ticket } of comparison.matched) {
    const adapter = deps.adapters.get(position.exchange);
    if (adapter === undefined) {
      const msg = `${position.symbol}:${position.exchange}: no adapter for matched position`;
      log.error("no_adapter_for_matched_position", {
        symbol: position.symbol,
        exchange: position.exchange,
      });
      errors.push(msg);
      continue;
    }

    try {
      const slExists = await deps.checkSlOnExchange(adapter, position.symbol, position.exchange);

      if (!slExists) {
        log.warn("sl_missing_re_registering", {
          symbol: position.symbol,
          exchange: position.exchange,
          ticketId: ticket.id,
        });

        try {
          await deps.reRegisterSl(adapter, position.symbol, position.exchange, ticket);
          slReRegistered++;
          log.info("sl_re_registered", {
            symbol: position.symbol,
            exchange: position.exchange,
            ticketId: ticket.id,
          });
        } catch (slErr) {
          const slErrMsg = slErr instanceof Error ? slErr.message : String(slErr);
          const msg = `${position.symbol}:${position.exchange}: SL re-registration failed: ${slErrMsg}`;
          log.error("sl_re_registration_failed", {
            symbol: position.symbol,
            exchange: position.exchange,
            error: slErrMsg,
          });
          errors.push(msg);
        }
      }
    } catch (checkErr) {
      const checkErrMsg = checkErr instanceof Error ? checkErr.message : String(checkErr);
      const msg = `${position.symbol}:${position.exchange}: checkSlOnExchange failed: ${checkErrMsg}`;
      log.error("check_sl_failed", {
        symbol: position.symbol,
        exchange: position.exchange,
        error: checkErrMsg,
      });
      errors.push(msg);
    }
  }

  // ---- Step 5: Unmatched positions — emergency close ----
  for (const { position } of comparison.unmatched) {
    const adapter = deps.adapters.get(position.exchange);
    if (adapter === undefined) {
      const msg = `${position.symbol}:${position.exchange}: no adapter for unmatched position`;
      log.error("no_adapter_for_unmatched_position", {
        symbol: position.symbol,
        exchange: position.exchange,
      });
      errors.push(msg);
      continue;
    }

    try {
      await deps.emergencyClose({
        adapter,
        symbol: position.symbol,
        exchange: position.exchange,
        size: position.size,
        direction: position.side,
        intentId: crypto.randomUUID(),
      });

      log.warn("emergency_close_executed", {
        symbol: position.symbol,
        exchange: position.exchange,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const msg = `${position.symbol}:${position.exchange}: emergencyClose failed: ${errorMsg}`;
      log.error("emergency_close_failed", {
        symbol: position.symbol,
        exchange: position.exchange,
        error: errorMsg,
      });
      errors.push(msg);
    }
  }

  // ---- Step 6: Orphaned tickets — set IDLE ----
  for (const { ticket } of comparison.orphaned) {
    try {
      await deps.setSymbolStateIdle(ticket.symbol, ticket.exchange);
      log.info("orphaned_ticket_idle", {
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        ticketId: ticket.id,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const msg = `${ticket.symbol}:${ticket.exchange}: setSymbolStateIdle failed: ${errorMsg}`;
      log.error("set_idle_failed", {
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        error: errorMsg,
      });
      errors.push(msg);
    }
  }

  // ---- Step 7: Restore loss counters ----
  try {
    await deps.restoreLossCounters();
    log.info("loss_counters_restored");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const msg = `restoreLossCounters failed: ${errorMsg}`;
    log.error("restore_loss_counters_failed", { error: errorMsg });
    errors.push(msg);
  }

  // ---- Step 8: WatchSession recovery ----
  const WATCH_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  try {
    const activeSessions = await deps.getActiveWatchSessions();

    for (const session of activeSessions) {
      let isValid = false;

      try {
        const bias = await deps.getSymbolDailyBias(session.symbol, session.exchange);
        const ageMs = nowMs - session.detected_at.getTime();
        const withinAge = ageMs < WATCH_SESSION_MAX_AGE_MS;

        const biasMatch =
          (session.direction === "LONG" && bias === "LONG_ONLY") ||
          (session.direction === "SHORT" && bias === "SHORT_ONLY");

        isValid = biasMatch && withinAge;
      } catch (biasErr) {
        const biasErrMsg = biasErr instanceof Error ? biasErr.message : String(biasErr);
        log.error("watch_session_bias_check_failed", {
          sessionId: session.id,
          symbol: session.symbol,
          exchange: session.exchange,
          error: biasErrMsg,
        });
        // Conservative: treat as invalid if we cannot confirm bias
        isValid = false;
      }

      if (isValid) {
        watchSessionsRestored++;
        log.info("watch_session_restored", {
          sessionId: session.id,
          symbol: session.symbol,
          exchange: session.exchange,
          direction: session.direction,
        });
        try {
          await deps.insertEvent(
            "WATCH_SESSION_RESTORED",
            { sessionId: session.id, direction: session.direction },
            { symbol: session.symbol, exchange: session.exchange },
          );
        } catch {
          // Non-critical logging failure — do not propagate
        }
      } else {
        watchSessionsInvalidated++;
        log.warn("watch_session_invalidated_crash", {
          sessionId: session.id,
          symbol: session.symbol,
          exchange: session.exchange,
          direction: session.direction,
        });
        try {
          await deps.invalidateWatchSession(session.id, "crash_recovery_stale");
        } catch (invErr) {
          const invErrMsg = invErr instanceof Error ? invErr.message : String(invErr);
          const msg = `${session.symbol}:${session.exchange}: invalidateWatchSession failed: ${invErrMsg}`;
          log.error("invalidate_watch_session_failed", {
            sessionId: session.id,
            symbol: session.symbol,
            exchange: session.exchange,
            error: invErrMsg,
          });
          errors.push(msg);
        }
        try {
          await deps.insertEvent(
            "WATCH_SESSION_INVALIDATED_CRASH",
            { sessionId: session.id, direction: session.direction, reason: "crash_recovery_stale" },
            { symbol: session.symbol, exchange: session.exchange },
          );
        } catch {
          // Non-critical logging failure — do not propagate
        }
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const msg = `getActiveWatchSessions failed: ${errorMsg}`;
    log.error("get_active_watch_sessions_failed", { error: errorMsg });
    errors.push(msg);
  }

  // ---- Step 9: EventLog + Slack alert ----
  const durationMs = Date.now() - startMs;

  const result: CrashRecoveryResult = {
    matched: comparison.matched.length,
    unmatched: comparison.unmatched.length,
    orphaned: comparison.orphaned.length,
    slReRegistered,
    watchSessionsRestored,
    watchSessionsInvalidated,
    errors,
    durationMs,
  };

  try {
    await deps.insertEvent("CRASH_RECOVERY", {
      matched: result.matched,
      unmatched: result.unmatched,
      orphaned: result.orphaned,
      slReRegistered: result.slReRegistered,
      watchSessionsRestored: result.watchSessionsRestored,
      watchSessionsInvalidated: result.watchSessionsInvalidated,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("insert_event_failed", { error: errorMsg });
    // Do not push to errors — this is a non-critical logging failure
  }

  try {
    await deps.sendSlackAlert({
      matched: result.matched,
      unmatched: result.unmatched,
      orphaned: result.orphaned,
      slReRegistered: result.slReRegistered,
      watchSessionsRestored: result.watchSessionsRestored,
      watchSessionsInvalidated: result.watchSessionsInvalidated,
      errors: result.errors.length,
      durationMs: result.durationMs,
    });
  } catch {
    // Fire-and-forget: Slack alert failure must never propagate
  }

  log.info("crash_recovery_complete", {
    matched: result.matched.toString(),
    unmatched: result.unmatched.toString(),
    orphaned: result.orphaned.toString(),
    slReRegistered: result.slReRegistered.toString(),
    watchSessionsRestored: result.watchSessionsRestored.toString(),
    watchSessionsInvalidated: result.watchSessionsInvalidated.toString(),
    errors: result.errors.length.toString(),
    durationMs: result.durationMs.toString(),
  });

  return result;
}
