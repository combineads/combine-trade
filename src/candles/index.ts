export { type CleanupResult, cleanupOldCandles } from "./cleanup.ts";
export { CandleCollector, type CollectorStatus } from "./collector.ts";
export {
  type CandleGap,
  detectGaps,
  getTimeframeDurationMs,
} from "./gap-detection.ts";
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
