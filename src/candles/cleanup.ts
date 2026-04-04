import { createLogger } from "@/core/logger";
import { getPool } from "@/db/pool";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CleanupResult = {
  timeframe: string;
  deleted: number;
  cutoffDate: Date;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 1000;
const RETENTION_MONTHS = 6;

// ─── Logger ───────────────────────────────────────────────────────────────────

const log = createLogger("candle-cleanup");

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Deletes 1M-timeframe candles older than 6 months using batched DELETEs.
 * Other timeframes (1D, 1H, 5M) are never touched.
 *
 * @param options.batchSize - Number of rows to delete per batch (default: 1000)
 * @returns Array with a single CleanupResult for the 1M timeframe
 */
export async function cleanupOldCandles(options?: {
  batchSize?: number;
}): Promise<CleanupResult[]> {
  const pool = getPool();
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);
  const cutoffIso = cutoffDate.toISOString();

  log.info("starting 1M candle cleanup", {
    cutoffDate: cutoffIso,
    batchSize,
  });

  let totalDeleted = 0;

  while (true) {
    const result = await pool`
      DELETE FROM candles
      WHERE id IN (
        SELECT id FROM candles
        WHERE timeframe = '1M' AND open_time < ${cutoffIso}::timestamptz
        LIMIT ${batchSize}
      )
    `;

    const count = result.count;
    totalDeleted += count;

    if (count === 0) break;

    log.debug("batch deleted", { count, totalDeleted });
  }

  log.info("1M candle cleanup complete", {
    totalDeleted,
    cutoffDate: cutoffIso,
  });

  return [
    {
      timeframe: "1M",
      deleted: totalDeleted,
      cutoffDate,
    },
  ];
}
