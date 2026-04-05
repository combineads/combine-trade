/**
 * Integration tests for src/knn/engine.ts
 *
 * Requires a running test database (see tests/helpers/test-db.ts).
 * Tests are skipped automatically when the DB is unavailable.
 *
 * FK chain: symbol → candles → vectors
 *
 * NOTE: Pool is closed by test process exit to avoid cross-file conflicts
 * (same pattern as time-decay.test.ts).
 */

import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import type { DbInstance } from "../../src/db/pool";
import { getDb, getPool } from "../../src/db/pool";
import { commonCodeTable } from "../../src/db/schema";
import { loadKnnConfig, searchKnn } from "../../src/knn/engine";
import { VECTOR_DIM } from "../../src/vectors/feature-spec";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

async function insertSymbol(symbol = "BTC/USDT", exchange = "binance"): Promise<void> {
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

/**
 * Inserts a vector row with an optional label/grade.
 * Returns the inserted vector ID.
 */
async function insertVector(
  candleId: string,
  symbol: string,
  exchange: string,
  timeframe: string,
  embedding: Float32Array,
  label?: string | null,
  grade?: string | null,
): Promise<string> {
  const pool = getPool();
  const embStr = `[${Array.from(embedding).join(",")}]`;
  const result = await pool`
    INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding, label, grade)
    VALUES (
      ${candleId}, ${symbol}, ${exchange}, ${timeframe},
      ${embStr}::vector,
      ${label ?? null},
      ${grade ?? null}
    )
    RETURNING id
  `;
  return result[0]!.id as string;
}

/** Creates a Float32Array filled with a constant. */
function makeEmbedding(fillValue = 0.1): Float32Array {
  return new Float32Array(VECTOR_DIM).fill(fillValue);
}

/**
 * Creates an embedding that is a unit vector along a single dimension.
 * Used to ensure cosine/L2 distance comparisons are predictable.
 */
function makeUnitEmbedding(hotDim: number): Float32Array {
  const v = new Float32Array(VECTOR_DIM).fill(0);
  v[hotDim] = 1.0;
  return v;
}

// ---------------------------------------------------------------------------
// DB availability check
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

// ---------------------------------------------------------------------------
// Shared DB lifecycle — single init for the whole file
// ---------------------------------------------------------------------------

let db: DbInstance;

if (dbAvailable) {
  beforeAll(async () => {
    await initTestDb();
    db = getDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  // Pool is closed by test process exit to avoid cross-file conflicts
}

// ---------------------------------------------------------------------------
// loadKnnConfig — DB integration tests
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("knn-engine: loadKnnConfig — DB integration", () => {
  it("returns default config when CommonCode KNN rows are absent", async () => {
    const config = await loadKnnConfig(db);
    expect(config).toEqual({ topK: 50, distanceMetric: "cosine" });
  });

  it("reads top_k from CommonCode KNN group", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "top_k",
      value: 30,
      is_active: true,
    });
    const config = await loadKnnConfig(db);
    expect(config.topK).toBe(30);
    expect(config.distanceMetric).toBe("cosine");
  });

  it("reads distance_metric 'l2' from CommonCode KNN group", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "distance_metric",
      value: "l2",
      is_active: true,
    });
    const config = await loadKnnConfig(db);
    expect(config.distanceMetric).toBe("l2");
    expect(config.topK).toBe(50);
  });

  it("reads both top_k and distance_metric together", async () => {
    await db.insert(commonCodeTable).values([
      { group_code: "KNN", code: "top_k", value: 20, is_active: true },
      { group_code: "KNN", code: "distance_metric", value: "l2", is_active: true },
    ]);
    const config = await loadKnnConfig(db);
    expect(config).toEqual({ topK: 20, distanceMetric: "l2" });
  });

  it("falls back to default when top_k row is inactive", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "top_k",
      value: 10,
      is_active: false,
    });
    const config = await loadKnnConfig(db);
    expect(config.topK).toBe(50);
  });

  it("falls back to default when top_k value is not a positive number", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "top_k",
      value: "bad",
      is_active: true,
    });
    const config = await loadKnnConfig(db);
    expect(config.topK).toBe(50);
  });

  it("falls back to default for unknown distance_metric value", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "distance_metric",
      value: "manhattan",
      is_active: true,
    });
    const config = await loadKnnConfig(db);
    expect(config.distanceMetric).toBe("cosine");
  });
});

// ---------------------------------------------------------------------------
// searchKnn — DB integration tests
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("knn-engine: searchKnn — DB integration", () => {
  // ── Basic filtering ──────────────────────────────────────────────────────

  it("returns empty array when no vectors exist", async () => {
    await insertSymbol();
    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });
    expect(result).toHaveLength(0);
  });

  it("returns empty array when only unlabeled vectors exist", async () => {
    await insertSymbol();
    const candleId = await insertCandle();
    await insertVector(candleId, "BTC/USDT", "binance", "5M", makeEmbedding(0.5), null, null);

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });
    expect(result).toHaveLength(0);
  });

  it("returns only labeled vectors (label IS NOT NULL)", async () => {
    await insertSymbol();
    // Insert 5 labeled and 5 unlabeled vectors
    for (let i = 0; i < 5; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(candleId, "BTC/USDT", "binance", "5M", makeEmbedding(i * 0.1 + 0.1), "WIN", "A");
    }
    for (let i = 5; i < 10; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(candleId, "BTC/USDT", "binance", "5M", makeEmbedding(i * 0.1), null, null);
    }

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 20,
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(5);
    for (const n of result) {
      expect(n.label).not.toBeNull();
    }
  });

  // ── Result shape ─────────────────────────────────────────────────────────

  it("returns KnnNeighbor objects with correct fields", async () => {
    await insertSymbol();
    const candleId = await insertCandle();
    const vectorId = await insertVector(
      candleId,
      "BTC/USDT",
      "binance",
      "5M",
      makeEmbedding(0.5),
      "WIN",
      "A",
    );

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 5,
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(1);
    const neighbor = result[0]!;
    expect(neighbor.vectorId).toBe(vectorId);
    expect(typeof neighbor.distance).toBe("number");
    expect(neighbor.distance).toBeGreaterThanOrEqual(0);
    expect(neighbor.label).toBe("WIN");
    expect(neighbor.grade).toBe("A");
    expect(neighbor.createdAt).toBeInstanceOf(Date);
  });

  // ── Cosine distance ordering ─────────────────────────────────────────────

  it("cosine: identical query vector returns distance ≈ 0 as first result", async () => {
    await insertSymbol();
    const queryVec = makeUnitEmbedding(0);

    // Insert an identical vector (labeled WIN) and a dissimilar one
    const c1 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(c1, "BTC/USDT", "binance", "5M", makeUnitEmbedding(0), "WIN", "A");

    const c2 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T01:00:00Z");
    await insertVector(c2, "BTC/USDT", "binance", "5M", makeUnitEmbedding(1), "LOSS", "B");

    const result = await searchKnn(db, queryVec, {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    // The identical vector should be first with ~0 distance
    expect(result[0]!.distance).toBeCloseTo(0, 4);
    expect(result[0]!.label).toBe("WIN");
  });

  it("cosine: results are sorted ascending by distance", async () => {
    await insertSymbol();

    // Insert 3 labeled vectors at varying distances from query [1,0,0,...]
    const queryVec = makeUnitEmbedding(0);
    const vectors = [
      { fill: makeUnitEmbedding(0), label: "WIN" as const },   // identical  → dist ≈ 0
      { fill: makeUnitEmbedding(1), label: "LOSS" as const },  // orthogonal → dist = 1
      { fill: makeUnitEmbedding(2), label: "WIN" as const },   // orthogonal → dist = 1
    ];

    for (let i = 0; i < vectors.length; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(candleId, "BTC/USDT", "binance", "5M", vectors[i]!.fill, vectors[i]!.label, "A");
    }

    const result = await searchKnn(db, queryVec, {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });

    expect(result.length).toBe(3);
    // First result must have the smallest distance
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.distance).toBeGreaterThanOrEqual(result[i - 1]!.distance);
    }
    // First should be the identical vector
    expect(result[0]!.distance).toBeCloseTo(0, 4);
  });

  // ── L2 distance ordering ─────────────────────────────────────────────────

  it("l2: closest vector (smallest L2 distance) is first result", async () => {
    await insertSymbol();

    const queryVec = makeEmbedding(0.5);

    // close vector: fill value 0.5 (same as query) → L2 ≈ 0
    const c1 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(c1, "BTC/USDT", "binance", "5M", makeEmbedding(0.5), "WIN", "A");

    // far vector: fill value 0.9 (farther from query)
    const c2 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T01:00:00Z");
    await insertVector(c2, "BTC/USDT", "binance", "5M", makeEmbedding(0.9), "LOSS", "B");

    const result = await searchKnn(db, queryVec, {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "l2",
    });

    expect(result.length).toBe(2);
    expect(result[0]!.distance).toBeLessThan(result[1]!.distance);
    expect(result[0]!.label).toBe("WIN");
  });

  it("l2: results are sorted ascending by distance", async () => {
    await insertSymbol();
    const queryVec = makeEmbedding(0.5);

    const fills = [0.5, 0.6, 0.8, 0.3];
    for (let i = 0; i < fills.length; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(candleId, "BTC/USDT", "binance", "5M", makeEmbedding(fills[i]!), "WIN", "A");
    }

    const result = await searchKnn(db, queryVec, {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "l2",
    });

    expect(result.length).toBe(4);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.distance).toBeGreaterThanOrEqual(result[i - 1]!.distance);
    }
  });

  // ── topK limit ────────────────────────────────────────────────────────────

  it("topK=5 returns at most 5 results even when more exist", async () => {
    await insertSymbol();

    for (let i = 0; i < 10; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(candleId, "BTC/USDT", "binance", "5M", makeEmbedding(i * 0.05), "WIN", "A");
    }

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 5,
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(5);
  });

  // ── Symbol/exchange/timeframe isolation ──────────────────────────────────

  it("does not return vectors from a different symbol", async () => {
    await insertSymbol("BTC/USDT", "binance");
    await insertSymbol("ETH/USDT", "binance");

    const btcCandleId = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(btcCandleId, "BTC/USDT", "binance", "5M", makeEmbedding(0.5), "WIN", "A");

    const ethCandleId = await insertCandle("ETH/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(ethCandleId, "ETH/USDT", "binance", "5M", makeEmbedding(0.5), "LOSS", "B");

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("WIN");
  });

  it("does not return vectors from a different timeframe", async () => {
    await insertSymbol();

    const c1 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(c1, "BTC/USDT", "binance", "5M", makeEmbedding(0.5), "WIN", "A");

    const c2 = await insertCandle("BTC/USDT", "binance", "1M", "2025-01-01T00:00:00Z");
    await insertVector(c2, "BTC/USDT", "binance", "1M", makeEmbedding(0.5), "LOSS", "B");

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("WIN");
  });

  // ── Default config fallback via DB ────────────────────────────────────────

  it("uses default topK=50 when not specified and no CommonCode row exists", async () => {
    await insertSymbol();

    // Insert 60 labeled vectors
    for (let i = 0; i < 60; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, 0, i, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(
        candleId, "BTC/USDT", "binance", "5M",
        makeEmbedding(i * 0.01),
        "WIN", "A",
      );
    }

    // Search without topK — should default to 50
    const result = await searchKnn(db, makeEmbedding(0.3), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(50);
  });

  it("uses topK from CommonCode KNN.top_k when not specified in options", async () => {
    await insertSymbol();
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "top_k",
      value: 3,
      is_active: true,
    });

    for (let i = 0; i < 10; i++) {
      const openTime = new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString();
      const candleId = await insertCandle("BTC/USDT", "binance", "5M", openTime);
      await insertVector(candleId, "BTC/USDT", "binance", "5M", makeEmbedding(i * 0.1), "WIN", "A");
    }

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      // no topK specified
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(3);
  });

  // ── minLabeledOnly flag (always filters to labeled) ────────────────────────

  it("minLabeledOnly=true still returns only labeled vectors", async () => {
    await insertSymbol();

    const c1 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(c1, "BTC/USDT", "binance", "5M", makeEmbedding(0.5), "WIN", "A");

    const c2 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T01:00:00Z");
    await insertVector(c2, "BTC/USDT", "binance", "5M", makeEmbedding(0.5), null, null);

    const result = await searchKnn(db, makeEmbedding(0.5), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
      minLabeledOnly: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("WIN");
  });

  // ── Label values preserved ────────────────────────────────────────────────

  it("returns LOSS and TIME_EXIT labels correctly", async () => {
    await insertSymbol();

    const c1 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    await insertVector(c1, "BTC/USDT", "binance", "5M", makeEmbedding(0.1), "LOSS", "B");

    const c2 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T01:00:00Z");
    await insertVector(c2, "BTC/USDT", "binance", "5M", makeEmbedding(0.2), "TIME_EXIT", "C");

    const result = await searchKnn(db, makeEmbedding(0.15), {
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      topK: 10,
      distanceMetric: "cosine",
    });

    expect(result).toHaveLength(2);
    const labels = result.map((n) => n.label);
    expect(labels).toContain("LOSS");
    expect(labels).toContain("TIME_EXIT");
  });
});
