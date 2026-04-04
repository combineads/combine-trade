import type { Timeframe } from "@/core/types";
import { getPool } from "@/db/pool";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CandleGap = {
  from: Date;
  to: Date;
  expectedCount: number;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the duration of one candle in milliseconds for the given timeframe.
 */
export function getTimeframeDurationMs(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1D":
      return 86_400_000;
    case "1H":
      return 3_600_000;
    case "5M":
      return 300_000;
    case "1M":
      return 60_000;
  }
}

/**
 * Detects gaps in candle data for a given symbol/exchange/timeframe within a
 * date range. Uses a lightweight SQL query (open_time only, not full rows) for
 * efficiency.
 *
 * Gap detection:
 *   - Consecutive candles with a time difference > 1.5x the timeframe duration
 *     are considered a gap.
 *   - Adjacent gaps are merged into a single gap with combined expectedCount.
 *   - If no candles exist in the range, one gap covering the full range is
 *     returned.
 */
export async function detectGaps(
  symbol: string,
  exchange: string,
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<CandleGap[]> {
  const pool = getPool();
  const durationMs = getTimeframeDurationMs(timeframe);
  const threshold = durationMs * 1.5;

  // Lightweight query — only open_time column
  const rows = await pool`
    SELECT open_time FROM candles
    WHERE symbol = ${symbol}
      AND exchange = ${exchange}
      AND timeframe = ${timeframe}
      AND open_time >= ${from.toISOString()}::timestamptz
      AND open_time <= ${to.toISOString()}::timestamptz
    ORDER BY open_time ASC
  `;

  // No candles at all → entire range is a gap
  if (rows.length === 0) {
    const totalMs = to.getTime() - from.getTime();
    const expectedCount = Math.max(1, Math.round(totalMs / durationMs));
    return [{ from, to, expectedCount }];
  }

  const gaps: CandleGap[] = [];

  // Convert raw SQL results to timestamps (postgres.js may return Date or string)
  const timestamps = rows.map((r) => {
    const ot = r.open_time;
    return ot instanceof Date ? ot.getTime() : new Date(ot as string).getTime();
  });

  // Detect gaps between consecutive candles
  for (let i = 0; i < timestamps.length - 1; i++) {
    const currTime = timestamps[i] as number;
    const nextTime = timestamps[i + 1] as number;
    const diff = nextTime - currTime;

    if (diff > threshold) {
      // Gap starts one duration after the current candle
      const gapFrom = new Date(currTime + durationMs);
      // Gap ends one duration before the next candle
      const gapTo = new Date(nextTime - durationMs);
      const expectedCount = Math.round((diff - durationMs) / durationMs);

      gaps.push({ from: gapFrom, to: gapTo, expectedCount });
    }
  }

  // Merge adjacent gaps (gaps where one ends and the next begins immediately)
  if (gaps.length <= 1) {
    return gaps;
  }

  const merged: CandleGap[] = [gaps[0] as CandleGap];

  for (let i = 1; i < gaps.length; i++) {
    const prev = merged[merged.length - 1] as CandleGap;
    const curr = gaps[i] as CandleGap;

    // Adjacent if the gap between them is within the threshold
    const distBetween = curr.from.getTime() - prev.to.getTime();
    if (distBetween <= threshold) {
      prev.to = curr.to;
      prev.expectedCount += curr.expectedCount;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}
