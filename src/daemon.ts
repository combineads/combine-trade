/**
 * Daemon entry-point skeleton.
 *
 * Orchestrates the startup sequence:
 *   1. initDb()           — establish DB connection
 *   2. loadAllConfig()    — load CommonCode config into memory cache
 *   3. CandleManager.start() — history sync + WebSocket collection
 *   4. onCandleClose()    — register candle-close callback (currently just logs)
 *   5. startReconciliation() — 60 s reconciliation worker
 *   6. SIGTERM / SIGINT   — graceful shutdown
 *
 * Layer: L9 — may import any lower layer.
 */

import type { CandleManager, CandleManagerConfig } from "@/candles/index";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type { Candle, Exchange, Timeframe } from "@/core/types";
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
   * Factory that starts the reconciliation worker (injectable for tests).
   * Signature matches startReconciliation from @/reconciliation/worker.
   */
  startReconciliation: (
    adapters: ReadonlyMap<Exchange, ExchangeAdapter>,
    deps: ReconciliationDeps,
    config?: { intervalMs?: number },
  ) => ReconciliationHandle;
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
    startReconciliation,
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

  // ---- Step 3: Start CandleManager (history sync + WebSocket) ----
  await candleManager.start(candleManagerConfig);
  log.info("candle_manager_started");

  // ---- Step 4: Register candle-close callback ----
  candleManager.onCandleClose((candle: Candle, timeframe: Timeframe) => {
    log.info("candle_close", {
      symbol: candle.symbol,
      exchange: candle.exchange,
      details: { timeframe },
    });
  });

  // ---- Step 5: Start reconciliation worker (60 s interval) ----
  const reconciliation: ReconciliationHandle = startReconciliation(adapters, reconciliationDeps, {
    intervalMs: 60_000,
  });
  log.info("reconciliation_started");

  // ---- Build stop() ----
  async function stop(): Promise<void> {
    if (shutting_down) {
      log.info("shutdown_already_in_progress");
      return;
    }
    shutting_down = true;

    log.info("daemon_stopping");

    await candleManager.stop();
    log.info("candle_manager_stopped");

    reconciliation.stop();
    log.info("reconciliation_stopped");

    log.info("daemon_shutdown_complete");
  }

  // ---- Step 6: Signal handlers ----
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
