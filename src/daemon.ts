/**
 * Daemon entry-point.
 *
 * Orchestrates the startup sequence:
 *   1. initDb()           — establish DB connection
 *   2. loadAllConfig()    — load CommonCode config into memory cache
 *   3. recoverFromCrash() — reconcile positions/tickets after unclean shutdown
 *   4. CandleManager.start() — history sync + WebSocket collection
 *   5. onCandleClose()    — register candle-close callback (routes to pipeline)
 *   6. startReconciliation() — 60 s reconciliation worker
 *   7. apiServer.start()  — HTTP API + static file serving (if provided)
 *   8. SIGTERM / SIGINT   — graceful shutdown
 *
 * Layer: L9 — may import any lower layer.
 */

import type { ApiServerHandle } from "@/api/types";
import type { CandleManager, CandleManagerConfig } from "@/candles/index";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type { Candle, Exchange, Timeframe } from "@/core/types";
import type { CrashRecoveryDeps, CrashRecoveryResult } from "@/daemon/crash-recovery";
import type { ActiveSymbol, PipelineDeps } from "@/daemon/pipeline";
import { handleCandleClose } from "@/daemon/pipeline";
import { gracefulShutdown, type ShutdownDeps } from "@/daemon/shutdown";
import type { ReconciliationDeps, ReconciliationHandle } from "@/reconciliation/worker";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("daemon");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Dependency injection interface — every external resource is injectable so
 * the daemon can be unit-tested without a real DB or exchange connection.
 */
export type DaemonDeps = {
  /** CandleManager instance (injectable for tests) */
  candleManager: Pick<CandleManager, "start" | "stop" | "onCandleClose" | "getStatus">;

  /** Exchange adapters keyed by exchange name */
  adapters: ReadonlyMap<Exchange, ExchangeAdapter>;

  /** Reconciliation worker dependency bag */
  reconciliationDeps: ReconciliationDeps;

  /** Config passed to CandleManager.start() */
  candleManagerConfig: CandleManagerConfig;

  /** DB initialiser (injectable for tests) */
  initDb: () => Promise<void>;

  /** Config loader (injectable for tests) */
  loadAllConfig: () => Promise<void>;

  /**
   * Crash recovery function called once at startup after loadAllConfig.
   * Signature matches recoverFromCrash from @/daemon/crash-recovery.
   */
  recoverFromCrash: (deps: CrashRecoveryDeps) => Promise<CrashRecoveryResult>;

  /** Crash recovery dependency bag (injectable for tests) */
  crashRecoveryDeps: CrashRecoveryDeps;

  /**
   * Factory that starts the reconciliation worker (injectable for tests).
   * Signature matches startReconciliation from @/reconciliation/worker.
   */
  startReconciliation: (
    adapters: ReadonlyMap<Exchange, ExchangeAdapter>,
    deps: ReconciliationDeps,
    config?: { intervalMs?: number },
  ) => ReconciliationHandle;

  /**
   * Pipeline dependency bag injected into handleCandleClose on every
   * candle-close event. Enables full DI for the trading pipeline.
   */
  pipelineDeps: PipelineDeps;

  /**
   * List of active trading symbols. Candle-close events are only processed
   * for symbols present in this list.
   */
  activeSymbols: ReadonlyArray<ActiveSymbol>;

  /**
   * Shutdown dependency bag — passed to gracefulShutdown() when stop() is called.
   * If omitted, a minimal shutdown (candleManager.stop + reconciliation.stop only)
   * is performed for backward compatibility.
   */
  shutdownDeps?: ShutdownDeps;

  /**
   * API server handle (optional). When provided, the daemon starts the HTTP
   * server after reconciliation and stops it during shutdown.
   * Backward compatible — omit to skip API server entirely.
   */
  apiServer?: ApiServerHandle;
};

/**
 * Handle returned by startDaemon — call stop() for graceful shutdown.
 */
export type DaemonHandle = {
  stop(): Promise<void>;
};

// ---------------------------------------------------------------------------
// startDaemon
// ---------------------------------------------------------------------------

/**
 * Starts the daemon, wiring up all subsystems in the required order.
 * Returns a handle whose stop() method shuts everything down gracefully.
 */
export async function startDaemon(deps: DaemonDeps): Promise<DaemonHandle> {
  const {
    candleManager,
    adapters,
    reconciliationDeps,
    candleManagerConfig,
    initDb,
    loadAllConfig,
    recoverFromCrash,
    crashRecoveryDeps,
    startReconciliation,
    pipelineDeps,
    activeSymbols,
  } = deps;

  // Duplicate-shutdown guard
  let shutting_down = false;

  // ---- Step 1: DB connection ----
  log.info("daemon_starting");
  await initDb();
  log.info("db_ready");

  // ---- Step 2: Load config ----
  await loadAllConfig();
  log.info("config_loaded");

  // ---- Step 3: Crash recovery — reconcile positions/tickets after unclean shutdown ----
  const recoveryResult = await recoverFromCrash(crashRecoveryDeps);
  log.info("crash_recovery_done", {
    details: {
      matched: recoveryResult.matched,
      unmatched: recoveryResult.unmatched,
      orphaned: recoveryResult.orphaned,
      slReRegistered: recoveryResult.slReRegistered,
      errors: recoveryResult.errors.length,
    },
  });

  // ---- Step 4: Start CandleManager (history sync + WebSocket) ----
  await candleManager.start(candleManagerConfig);
  log.info("candle_manager_started");

  // ---- Step 5: Register candle-close callback (routes to trading pipeline) ----
  candleManager.onCandleClose((candle: Candle, timeframe: Timeframe) => {
    log.info("candle_close", {
      symbol: candle.symbol,
      exchange: candle.exchange,
      details: { timeframe },
    });

    // Delegate to the pipeline orchestrator. Fire-and-forget — errors are
    // caught and logged inside handleCandleClose; they must never propagate
    // up to the CandleManager subscription loop.
    handleCandleClose(candle, timeframe, activeSymbols, pipelineDeps).catch((err: unknown) => {
      log.error("pipeline_unhandled_error", {
        symbol: candle.symbol,
        exchange: candle.exchange,
        details: { timeframe, error: String(err) },
      });
    });
  });

  // ---- Step 6: Start reconciliation worker (60 s interval) ----
  const reconciliation: ReconciliationHandle = startReconciliation(adapters, reconciliationDeps, {
    intervalMs: 60_000,
  });
  log.info("reconciliation_started");

  // ---- Step 7: Start API server (if provided) ----
  if (deps.apiServer !== undefined) {
    await deps.apiServer.start();
    log.info("api_server_started");
  }

  // ---- Build stop() ----
  async function stop(): Promise<void> {
    if (shutting_down) {
      log.info("shutdown_already_in_progress");
      return;
    }
    shutting_down = true;

    log.info("daemon_stopping");

    // Stop API server first (stop accepting new requests)
    if (deps.apiServer !== undefined) {
      await deps.apiServer.stop();
      log.info("api_server_stopped");
    }

    if (deps.shutdownDeps !== undefined) {
      // Use enhanced graceful shutdown with order cancellation, DB pool close, Slack alert
      await gracefulShutdown({
        ...deps.shutdownDeps,
        candleManager,
        reconciliationHandle: reconciliation,
      });
    } else {
      // Minimal fallback: stop candle manager + reconciliation only
      await candleManager.stop();
      log.info("candle_manager_stopped");

      reconciliation.stop();
      log.info("reconciliation_stopped");
    }

    log.info("daemon_shutdown_complete");
  }

  // ---- Step 8: Signal handlers ----
  const onSignal = () => {
    stop().catch((err: unknown) => {
      log.error("stop_failed", { details: { error: String(err) } });
    });
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  log.info("daemon_started");

  return { stop };
}
