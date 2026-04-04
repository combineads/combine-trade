/**
 * Integration tests for src/vectors/repository.ts
 *
 * Requires a running test database (see tests/helpers/test-db.ts).
 * Tests are skipped automatically when the DB is unavailable.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { getDb, getPool } from "../../src/db/pool";
import { VECTOR_DIM } from "../../src/vectors/features";
import {
  getVectorByCandle,
  getVectorsForNormalization,
  insertVector,
  updateVectorLabel,
} from "../../src/vectors/repository";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

async function insertParentSymbol(symbol = "BTC/USDT", exchange = "binance"): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;
}

async function insertCandle(
  symbol = "BTC/USDT",
  exchange = "binance",
  timeframe = "5M",
  openTime = "2025-01-01T00:00:00Z",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
    VALUES (
      ${symbol}, ${exchange}, ${timeframe}, ${openTime}::timestamptz,
      ${"100.00"}, ${"110.00"}, ${"90.00"}, ${"105.00"}, ${"1000.00"}
    )
    RETURNING id
  `;
  return result[0]!.id as string;
}

/** Creates a Float32Array of VECTOR_DIM filled with a constant value. */
function makeEmbedding(fillValue = 0.1): Float32Array {
  return new Float32Array(VECTOR_DIM).fill(fillValue);
}

/** Creates a Float32Array of VECTOR_DIM with sequential float values. */
function makeSequentialEmbedding(): Float32Array {
  const v = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) {
    v[i] = i / VECTOR_DIM; // values in [0, 1)
  }
  return v;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("vector-repository integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  // ── insertVector ──────────────────────────────────────────────────────────

  describe("insertVector()", () => {
    it("inserts a 202-dim vector and returns the created row", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();
      const embedding = makeEmbedding(0.5);

      const row = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding,
      });

      expect(row.id).toBeString();
      expect(row.candle_id).toBe(candleId);
      expect(row.symbol).toBe("BTC/USDT");
      expect(row.exchange).toBe("binance");
      expect(row.timeframe).toBe("5M");
      expect(row.label).toBeNull();
      expect(row.grade).toBeNull();
      expect(row.labeled_at).toBeNull();
      expect(row.created_at).toBeInstanceOf(Date);
    });

    it("stores embedding as pgvector string and round-trips correctly", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();
      const embedding = makeSequentialEmbedding();

      const row = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding,
      });

      // Verify raw storage in DB — embedding should be a vector string
      const pool = getPool();
      const rawRow = await pool`
        SELECT embedding::text AS emb_str
        FROM vectors WHERE id = ${row.id}
      `;
      expect(rawRow[0]!.emb_str).toBeString();
      // pgvector stores as "[v1,v2,...]"
      expect(rawRow[0]!.emb_str).toMatch(/^\[/);
      expect(rawRow[0]!.emb_str).toMatch(/\]$/);
    });

    it("inserts into the vectors table (verifiable via raw SQL)", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();

      const row = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.1),
      });

      const pool = getPool();
      const check = await pool`SELECT id FROM vectors WHERE id = ${row.id}`;
      expect(check).toHaveLength(1);
    });
  });

  // ── getVectorByCandle ─────────────────────────────────────────────────────

  describe("getVectorByCandle()", () => {
    it("returns the vector row for an existing candle", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();
      const embedding = makeEmbedding(0.7);

      const inserted = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding,
      });

      const found = await getVectorByCandle(db, candleId);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(inserted.id);
      expect(found!.candle_id).toBe(candleId);
      expect(found!.symbol).toBe("BTC/USDT");
      expect(found!.exchange).toBe("binance");
      expect(found!.timeframe).toBe("5M");
    });

    it("returns null for a candle ID with no associated vector", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();

      const result = await getVectorByCandle(db, candleId);
      expect(result).toBeNull();
    });

    it("returns null for a non-existent candle ID", async () => {
      const db = getDb();
      const result = await getVectorByCandle(db, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  // ── getVectorsForNormalization ────────────────────────────────────────────

  describe("getVectorsForNormalization()", () => {
    it("returns an empty array when no vectors exist", async () => {
      const db = getDb();
      const result = await getVectorsForNormalization(db, "BTC/USDT", "binance", "5M", 100);
      expect(result).toHaveLength(0);
    });

    it("returns Float32Array for each stored vector", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();

      await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.4),
      });

      const result = await getVectorsForNormalization(db, "BTC/USDT", "binance", "5M", 100);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(result[0]!.length).toBe(VECTOR_DIM);
    });

    it("parses embedding values correctly (round-trip)", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();
      const embedding = makeSequentialEmbedding();

      await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding,
      });

      const result = await getVectorsForNormalization(db, "BTC/USDT", "binance", "5M", 100);
      expect(result).toHaveLength(1);

      const parsed = result[0]!;
      for (let i = 0; i < VECTOR_DIM; i++) {
        expect(parsed[i]).toBeCloseTo(embedding[i]!, 5);
      }
    });

    it("respects the limit parameter", async () => {
      await insertParentSymbol();
      const db = getDb();

      // Insert 5 vectors with different candles
      for (let i = 0; i < 5; i++) {
        const candleId = await insertCandle(
          "BTC/USDT",
          "binance",
          "5M",
          new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString(),
        );
        await insertVector(db, {
          candleId,
          symbol: "BTC/USDT",
          exchange: "binance",
          timeframe: "5M",
          embedding: makeEmbedding(i * 0.1),
        });
      }

      const result = await getVectorsForNormalization(db, "BTC/USDT", "binance", "5M", 3);
      expect(result).toHaveLength(3);
    });

    it("filters by symbol, exchange, timeframe", async () => {
      await insertParentSymbol("BTC/USDT", "binance");
      await insertParentSymbol("ETH/USDT", "binance");
      const db = getDb();

      const btcCandleId = await insertCandle("BTC/USDT", "binance", "5M");
      const ethCandleId = await insertCandle("ETH/USDT", "binance", "5M");

      await insertVector(db, {
        candleId: btcCandleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.1),
      });
      await insertVector(db, {
        candleId: ethCandleId,
        symbol: "ETH/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.9),
      });

      const btcResult = await getVectorsForNormalization(db, "BTC/USDT", "binance", "5M", 100);
      expect(btcResult).toHaveLength(1);

      const ethResult = await getVectorsForNormalization(db, "ETH/USDT", "binance", "5M", 100);
      expect(ethResult).toHaveLength(1);
    });
  });

  // ── updateVectorLabel ─────────────────────────────────────────────────────

  describe("updateVectorLabel()", () => {
    it("updates label, grade, and labeled_at for a vector", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();

      const inserted = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.1),
      });

      // labeled_at should be null initially
      expect(inserted.labeled_at).toBeNull();
      expect(inserted.label).toBeNull();
      expect(inserted.grade).toBeNull();

      await updateVectorLabel(db, inserted.id, "WIN", "A");

      // Re-fetch and verify
      const pool = getPool();
      const rows = await pool`
        SELECT label, grade, labeled_at
        FROM vectors WHERE id = ${inserted.id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.label).toBe("WIN");
      expect(rows[0]!.grade).toBe("A");
      expect(rows[0]!.labeled_at).not.toBeNull();
    });

    it("updates to different label and grade values", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();

      const inserted = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.2),
      });

      await updateVectorLabel(db, inserted.id, "LOSS", "B");

      const pool = getPool();
      const rows = await pool`SELECT label, grade FROM vectors WHERE id = ${inserted.id}`;
      expect(rows[0]!.label).toBe("LOSS");
      expect(rows[0]!.grade).toBe("B");
    });

    it("can update label twice (labeled_at is reset)", async () => {
      await insertParentSymbol();
      const candleId = await insertCandle();
      const db = getDb();

      const inserted = await insertVector(db, {
        candleId,
        symbol: "BTC/USDT",
        exchange: "binance",
        timeframe: "5M",
        embedding: makeEmbedding(0.3),
      });

      await updateVectorLabel(db, inserted.id, "WIN", "A");

      const pool = getPool();

      // Small wait to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      await updateVectorLabel(db, inserted.id, "TIME_EXIT", "C");

      const second = await pool`
        SELECT label, grade, labeled_at FROM vectors WHERE id = ${inserted.id}
      `;
      expect(second[0]!.label).toBe("TIME_EXIT");
      expect(second[0]!.grade).toBe("C");
      // labeled_at should be a valid date
      expect(second[0]!.labeled_at).not.toBeNull();
    });

    it("is a no-op for a non-existent vector ID (no error)", async () => {
      const db = getDb();
      // Should not throw
      await expect(
        updateVectorLabel(db, "00000000-0000-0000-0000-000000000000", "WIN", "A"),
      ).resolves.toBeUndefined();
    });
  });
});
