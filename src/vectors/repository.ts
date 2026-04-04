/**
 * Vector repository — DB helpers for the vectors table.
 *
 * Handles pgvector string format conversion:
 *   Float32Array → "[0.1,0.2,...]"  (to store)
 *   "[0.1,0.2,...]" → Float32Array  (on read)
 *
 * All functions receive the Drizzle db instance as the first argument
 * to support dependency injection and testing.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import type { DbInstance } from "@/db/pool";
import type { VectorRow } from "@/db/schema";
import { vectorTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// pgvector format helpers
// ---------------------------------------------------------------------------

/**
 * Converts a Float32Array to pgvector string format: "[0.1,0.2,...]"
 */
function float32ToPgVector(arr: Float32Array): string {
  return `[${Array.from(arr).join(",")}]`;
}

/**
 * Parses a pgvector string "[0.1,0.2,...]" back to a Float32Array.
 * Returns an empty Float32Array if the string is null/undefined/empty.
 */
function pgVectorToFloat32(str: string | null | undefined): Float32Array {
  if (!str || str.trim() === "") {
    return new Float32Array(0);
  }
  // Strip surrounding brackets
  const inner = str.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (inner === "") {
    return new Float32Array(0);
  }
  const values = inner.split(",").map((v) => parseFloat(v.trim()));
  return new Float32Array(values);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parameters for inserting a new vector row.
 */
export interface InsertVectorParams {
  candleId: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  embedding: Float32Array;
}

/**
 * Inserts a vector into the vectors table.
 * Converts Float32Array to pgvector string format before insertion.
 *
 * @returns The created VectorRow (with all DB-generated fields populated).
 */
export async function insertVector(db: DbInstance, params: InsertVectorParams): Promise<VectorRow> {
  const embeddingStr = float32ToPgVector(params.embedding);

  const result = await db
    .insert(vectorTable)
    .values({
      candle_id: params.candleId,
      symbol: params.symbol,
      exchange: params.exchange,
      timeframe: params.timeframe,
      embedding: embeddingStr,
    })
    .returning();

  const row = result[0];
  if (!row) {
    throw new Error("insertVector: no row returned after INSERT");
  }
  return row;
}

/**
 * Retrieves a vector row by its associated candle ID.
 * Returns null if no vector exists for the given candle.
 */
export async function getVectorByCandle(
  db: DbInstance,
  candleId: string,
): Promise<VectorRow | null> {
  const result = await db
    .select()
    .from(vectorTable)
    .where(eq(vectorTable.candle_id, candleId))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Retrieves the most recent vectors for normalization parameter computation.
 * Parses the pgvector embedding string back to Float32Array for each row.
 *
 * @param symbol - Symbol filter (e.g. "BTCUSDT")
 * @param exchange - Exchange filter (e.g. "binance")
 * @param timeframe - Timeframe filter (e.g. "5M")
 * @param limit - Maximum number of rows to return (most recent first)
 * @returns Array of Float32Array embeddings, ordered most-recent-first.
 */
export async function getVectorsForNormalization(
  db: DbInstance,
  symbol: string,
  exchange: string,
  timeframe: string,
  limit: number,
): Promise<Float32Array[]> {
  const rows = await db
    .select({ embedding: vectorTable.embedding })
    .from(vectorTable)
    .where(
      and(
        eq(vectorTable.symbol, symbol),
        eq(vectorTable.exchange, exchange),
        eq(vectorTable.timeframe, timeframe),
      ),
    )
    .orderBy(desc(vectorTable.created_at))
    .limit(limit);

  return rows.map((row) => pgVectorToFloat32(row.embedding));
}

/**
 * Updates the label, grade, and labeled_at timestamp for a vector row.
 *
 * @param vectorId - UUID of the vector to update.
 * @param label - One of 'WIN', 'LOSS', 'TIME_EXIT'.
 * @param grade - One of 'A', 'B', 'C'.
 */
export async function updateVectorLabel(
  db: DbInstance,
  vectorId: string,
  label: string,
  grade: string,
): Promise<void> {
  await db
    .update(vectorTable)
    .set({
      label,
      grade,
      labeled_at: sql`now()`,
    })
    .where(eq(vectorTable.id, vectorId));
}
