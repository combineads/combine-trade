import { and, desc, eq, gte, lte, max, sql } from "drizzle-orm";

import type { DbInstance } from "@/db/pool";
import type { CandleRow } from "@/db/schema";
import { candleTable } from "@/db/schema";
import type { NewCandle } from "./history-loader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// bulkUpsertCandles
// ---------------------------------------------------------------------------

/**
 * Inserts candles in bulk with ON CONFLICT DO UPDATE semantics.
 *
 * - Conflict target: (symbol, exchange, timeframe, open_time)
 * - Conditional update: only overwrites when the existing row has is_closed = false.
 *   Rows that are already closed are left untouched.
 * - Processes in batches of 1000 to avoid oversized SQL statements.
 *
 * @returns Total number of inserted or updated rows.
 */
export async function bulkUpsertCandles(db: DbInstance, candles: NewCandle[]): Promise<number> {
  if (candles.length === 0) {
    return 0;
  }

  let totalAffected = 0;

  for (let i = 0; i < candles.length; i += BATCH_SIZE) {
    const batch = candles.slice(i, i + BATCH_SIZE);

    const values = batch.map((c) => ({
      symbol: c.symbol,
      exchange: c.exchange,
      timeframe: c.timeframe,
      open_time: c.open_time,
      open: c.open.toString(),
      high: c.high.toString(),
      low: c.low.toString(),
      close: c.close.toString(),
      volume: c.volume.toString(),
      is_closed: c.is_closed,
    }));

    const result = await db
      .insert(candleTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          candleTable.symbol,
          candleTable.exchange,
          candleTable.timeframe,
          candleTable.open_time,
        ],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
          is_closed: sql`excluded.is_closed`,
        },
        where: eq(candleTable.is_closed, false),
      })
      .returning({ id: candleTable.id });

    totalAffected += result.length;
  }

  return totalAffected;
}

// ---------------------------------------------------------------------------
// getLatestCandleTime
// ---------------------------------------------------------------------------

/**
 * Returns the most recent open_time for the given (symbol, exchange, timeframe)
 * combination, or null if no candles exist.
 */
export async function getLatestCandleTime(
  db: DbInstance,
  symbol: string,
  exchange: string,
  timeframe: string,
): Promise<Date | null> {
  const result = await db
    .select({ latest: max(candleTable.open_time) })
    .from(candleTable)
    .where(
      and(
        eq(candleTable.symbol, symbol),
        eq(candleTable.exchange, exchange),
        eq(candleTable.timeframe, timeframe),
      ),
    );

  const row = result[0];
  if (!row || row.latest === null) {
    return null;
  }

  return row.latest;
}

// ---------------------------------------------------------------------------
// getCandles
// ---------------------------------------------------------------------------

/**
 * Returns candles for a (symbol, exchange, timeframe) within the given date
 * range [from, to], ordered by open_time DESC (most recent first).
 */
export async function getCandles(
  db: DbInstance,
  symbol: string,
  exchange: string,
  timeframe: string,
  from: Date,
  to: Date,
  limit?: number,
): Promise<CandleRow[]> {
  let query = db
    .select()
    .from(candleTable)
    .where(
      and(
        eq(candleTable.symbol, symbol),
        eq(candleTable.exchange, exchange),
        eq(candleTable.timeframe, timeframe),
        gte(candleTable.open_time, from),
        lte(candleTable.open_time, to),
      ),
    )
    .orderBy(desc(candleTable.open_time))
    .$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  return query;
}
