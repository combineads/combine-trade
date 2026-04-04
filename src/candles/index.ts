import { TIMEFRAMES } from "@/core/constants";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, Unsubscribe } from "@/core/ports";
import type { Timeframe } from "@/core/types";
import type { CleanupResult } from "./cleanup";
import { cleanupOldCandles } from "./cleanup";
import { CandleCollector } from "./collector";
import { GapRecovery } from "./gap-recovery";
import { type SyncOptions, syncCandles } from "./sync";
import type { CandleCloseCallback } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CandleManagerConfig = {
  symbols: Array<{ symbol: string; exchange: string }>;
  timeframes?: Timeframe[];
  adapter: ExchangeAdapter;
};

export type CandleManagerStatus = {
  syncCompleted: boolean;
  collecting: boolean;
  activeSubscriptions: number;
  lastReceivedAt: Date | null;
  lastGapRecovery: Date | null;
};

// ---------------------------------------------------------------------------
// Dependency types for constructor injection (testability)
// ---------------------------------------------------------------------------

export type CandleManagerDeps = {
  collector?: CandleCollector;
  gapRecovery?: GapRecovery;
  syncFn?: (options: SyncOptions) => Promise<unknown>;
  cleanupFn?: (options?: { batchSize?: number }) => Promise<CleanupResult[]>;
};

// ---------------------------------------------------------------------------
// CandleManager
// ---------------------------------------------------------------------------

export class CandleManager {
  private readonly collector: CandleCollector;
  private readonly gapRecovery: GapRecovery;
  private readonly syncFn: (options: SyncOptions) => Promise<unknown>;
  private readonly cleanupFn: (options?: { batchSize?: number }) => Promise<CleanupResult[]>;
  private _syncCompleted = false;
  private _collecting = false;
  private _lastGapRecovery: Date | null = null;
  private readonly log = createLogger("candles");

  constructor(deps?: CandleManagerDeps) {
    this.collector = deps?.collector ?? new CandleCollector();
    this.gapRecovery = deps?.gapRecovery ?? new GapRecovery();
    this.syncFn = deps?.syncFn ?? syncCandles;
    this.cleanupFn = deps?.cleanupFn ?? cleanupOldCandles;
  }

  async start(config: CandleManagerConfig): Promise<void> {
    const symbols = config.symbols.map((s) => s.symbol);
    const timeframes = config.timeframes ?? ([...TIMEFRAMES] as unknown as Timeframe[]);

    // Step 1: Sync historical data
    try {
      await this.syncFn({
        symbols: config.symbols,
        timeframes,
        adapter: config.adapter,
      });
      this._syncCompleted = true;
      this.log.info("sync_complete");
    } catch (err) {
      this.log.error("sync_failed", { details: { error: String(err) } });
      // Continue even if sync fails -- collector can still gather real-time data
    }

    // Step 2: Start real-time collector
    await this.collector.start(symbols, timeframes, config.adapter);
    this._collecting = true;
    this.log.info("collector_started");

    // Step 3: Register gap recovery on reconnect
    this.collector.onReconnect(async () => {
      this.log.info("reconnect_detected_starting_gap_recovery");
      try {
        await this.gapRecovery.recoverAll(config.symbols, timeframes, config.adapter);
        this._lastGapRecovery = new Date();
        this.log.info("gap_recovery_complete");
      } catch (err) {
        this.log.error("gap_recovery_failed", { details: { error: String(err) } });
      }
    });
  }

  async stop(): Promise<void> {
    await this.collector.stop();
    this._collecting = false;
    this.log.info("collector_stopped");
  }

  getStatus(): CandleManagerStatus {
    const collectorStatus = this.collector.getStatus();
    return {
      syncCompleted: this._syncCompleted,
      collecting: this._collecting,
      activeSubscriptions: collectorStatus.activeSubscriptions,
      lastReceivedAt: collectorStatus.lastReceivedAt,
      lastGapRecovery: this._lastGapRecovery,
    };
  }

  onCandleClose(callback: CandleCloseCallback): Unsubscribe {
    return this.collector.onCandleClose(callback);
  }

  async runCleanup(): Promise<CleanupResult[]> {
    return this.cleanupFn();
  }
}

// ---------------------------------------------------------------------------
// Barrel re-exports for direct access to sub-modules
// ---------------------------------------------------------------------------

export { type CleanupResult, cleanupOldCandles } from "./cleanup.ts";
export { CandleCollector, type CollectorStatus } from "./collector.ts";
export { type CandleGap, detectGaps, getTimeframeDurationMs } from "./gap-detection.ts";
export { GapRecovery, type RecoveryResult } from "./gap-recovery.ts";
export {
  buildDailyUrl,
  buildMonthlyUrl,
  downloadCandles,
  fetchCandlesViaREST,
  mapTimeframe,
  type NewCandle,
  parseCSVRow,
} from "./history-loader.ts";
export { bulkUpsertCandles, getCandles, getLatestCandleTime } from "./repository.ts";
export { type SyncOptions, type SyncResult, syncCandles } from "./sync.ts";
export type { CandleCloseCallback } from "./types.ts";
