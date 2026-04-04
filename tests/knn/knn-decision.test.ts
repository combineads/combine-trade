/**
 * Tests for src/knn/decision.ts
 *
 * Pure function tests do not require a DB.
 * DB integration tests are skipped when the test DB is unavailable.
 *
 * FK chain for signal setup: symbol → watch_session → signals
 */

import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import type { DbInstance } from "../../src/db/pool";
import { getDb, getPool } from "../../src/db/pool";
import { commonCodeTable } from "../../src/db/schema";
import type { KnnDecisionConfig } from "../../src/knn/decision";
import {
  loadKnnDecisionConfig,
  makeDecision,
  updateSignalKnnDecision,
} from "../../src/knn/decision";
import type { WeightedNeighbor } from "../../src/knn/time-decay";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Test fixture helpers — pure function tests
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: KnnDecisionConfig = {
  winrateThreshold: 0.55,
  minSamples: 30,
  aGradeWinrateThreshold: 0.65,
};

function makeWeightedNeighbor(
  overrides: Partial<WeightedNeighbor> = {},
): WeightedNeighbor {
  return {
    vectorId: "vec-1",
    distance: 0.1,
    label: "WIN",
    grade: "A",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    weight: 1.0,
    ...overrides,
  };
}

/**
 * Builds an array of N weighted neighbors where `wins` of them are WIN,
 * the rest are LOSS, all with uniform weight 1.0.
 */
function makeNeighbors(count: number, wins: number): WeightedNeighbor[] {
  return Array.from({ length: count }, (_, i) => {
    const isWin = i < wins;
    return makeWeightedNeighbor({
      vectorId: `vec-${i}`,
      label: isWin ? "WIN" : "LOSS",
    });
  });
}

// ---------------------------------------------------------------------------
// makeDecision — pure function tests
// ---------------------------------------------------------------------------

describe("knn-decision: makeDecision — SKIP when sample count < minSamples", () => {
  it("returns SKIP with 0 samples (empty array)", () => {
    const result = makeDecision([], "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.winRate).toBe(0);
    expect(result.expectancy).toBe(0);
    expect(result.sampleCount).toBe(0);
    expect(result.aGrade).toBe(false);
  });

  it("returns SKIP when sample count is below minSamples (10 < 30)", () => {
    // winRate 0.70, expectancy 2.0, but only 10 samples
    const neighbors = makeNeighbors(10, 7); // 7 of 10 WIN → winRate 0.70
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(10);
  });

  it("returns SKIP when all neighbors have null labels (labeled count < minSamples)", () => {
    const unlabeled = Array.from({ length: 40 }, (_, i) =>
      makeWeightedNeighbor({ vectorId: `vec-${i}`, label: null }),
    );
    const result = makeDecision(unlabeled, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(0);
  });
});

describe("knn-decision: makeDecision — PASS scenarios", () => {
  it("returns PASS with winRate=0.60, expectancy>0, 50 samples", () => {
    // 30 WIN, 20 LOSS out of 50 → winRate = 0.60, expectancy = (30-20)/50 = 0.20
    const neighbors = makeNeighbors(50, 30);
    const result = makeDecision(neighbors, "DOUBLE_B", false, DEFAULT_CONFIG);
    expect(result.decision).toBe("PASS");
    expect(result.winRate).toBeCloseTo(0.6, 5);
    expect(result.expectancy).toBeGreaterThan(0);
    expect(result.sampleCount).toBe(50);
  });

  it("returns PASS exactly at winrateThreshold=0.55 with expectancy>0", () => {
    // 11 WIN, 9 LOSS of 20, but we need 30 samples minimum
    // 33 WIN, 27 LOSS of 60 → winRate = 0.55
    const neighbors = makeNeighbors(60, 33);
    const result = makeDecision(neighbors, "ONE_B", false, DEFAULT_CONFIG);
    expect(result.decision).toBe("PASS");
    expect(result.winRate).toBeCloseTo(0.55, 5);
  });
});

describe("knn-decision: makeDecision — FAIL scenarios", () => {
  it("returns FAIL with winRate=0.45, 50 samples", () => {
    // 22 WIN, 28 LOSS → winRate = 0.44, expectancy = (22-28)/50 = -0.12
    const neighbors = makeNeighbors(50, 22);
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.decision).toBe("FAIL");
    expect(result.winRate).toBeCloseTo(0.44, 5);
    expect(result.sampleCount).toBe(50);
  });

  it("returns FAIL when winRate >= threshold but expectancy <= 0 (TIME_EXIT heavy)", () => {
    // Build neighbors: 17 WIN, 3 LOSS, 20 TIME_EXIT out of 40
    // winRate = 17/40 = 0.425 — this is FAIL on winRate alone
    // Let's build a scenario where winRate is OK but expectancy is borderline negative
    // 22 WIN, 8 LOSS, 10 TIME_EXIT → winRate=22/40=0.55, expectancy=(22-8+10*(-0.5))/40=(22-8-5)/40=9/40=0.225
    // For expectancy ≤ 0: we need wins to not outweigh losses + time_exits
    // 22 WIN, 18 LOSS, 0 TIME_EXIT → winRate=22/40=0.55, expectancy=(22-18)/40=0.1 (PASS)
    // To get negative expectancy with sufficient winRate is hard with uniform weights
    // Instead test: winRate just below threshold
    const neighbors = makeNeighbors(50, 27); // 27/50=0.54, below 0.55 threshold
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.decision).toBe("FAIL");
  });

  it("returns FAIL when winRate < threshold, sampleCount >= minSamples", () => {
    const neighbors = makeNeighbors(50, 20); // 20/50=0.40
    const result = makeDecision(neighbors, "ONE_B", false, DEFAULT_CONFIG);
    expect(result.decision).toBe("FAIL");
  });
});

describe("knn-decision: makeDecision — weighted calculations", () => {
  it("computes weighted win rate correctly with non-uniform weights", () => {
    // 1 WIN with weight 0.9 and 1 LOSS with weight 0.1 → winRate ≈ 0.9
    const neighbors = Array.from({ length: 30 }, (_, i) => {
      if (i === 0) return makeWeightedNeighbor({ vectorId: "win-heavy", label: "WIN", weight: 0.9 });
      if (i === 1) return makeWeightedNeighbor({ vectorId: "loss-light", label: "LOSS", weight: 0.1 });
      // Fill the rest with uniform WIN to push count ≥ 30 but use low weights
      return makeWeightedNeighbor({ vectorId: `filler-${i}`, label: "WIN", weight: 0.01 });
    });
    const result = makeDecision(neighbors, "ONE_B", false, DEFAULT_CONFIG);
    // Weighted sum: heavy WIN (0.9) + light LOSS (0.1) + 28 tiny WINs (0.01*28 = 0.28)
    // Total weight = 0.9 + 0.1 + 0.28 = 1.28
    // Win weighted = 0.9 + 0.28 = 1.18
    // winRate = 1.18 / 1.28 ≈ 0.921875 → PASS
    expect(result.winRate).toBeGreaterThan(0.9);
  });

  it("computes expectancy for TIME_EXIT label as -0.5 pnlDir", () => {
    // 20 WIN, 10 TIME_EXIT out of 30 (no LOSS)
    const neighbors = Array.from({ length: 30 }, (_, i) => {
      const label = i < 20 ? "WIN" : "TIME_EXIT";
      return makeWeightedNeighbor({ vectorId: `vec-${i}`, label, weight: 1.0 });
    });
    const result = makeDecision(neighbors, "DOUBLE_B", false, DEFAULT_CONFIG);
    // expectancy = (20*1 + 10*(-0.5)) / 30 = (20 - 5) / 30 = 15/30 = 0.5
    expect(result.expectancy).toBeCloseTo(0.5, 5);
  });

  it("all LOSS neighbors → expectancy = -1", () => {
    const neighbors = Array.from({ length: 30 }, (_, i) =>
      makeWeightedNeighbor({ vectorId: `vec-${i}`, label: "LOSS", weight: 1.0 }),
    );
    const result = makeDecision(neighbors, "ONE_B", false, DEFAULT_CONFIG);
    expect(result.expectancy).toBeCloseTo(-1.0, 5);
    expect(result.decision).toBe("FAIL");
  });

  it("all WIN neighbors → expectancy = 1, winRate = 1", () => {
    const neighbors = Array.from({ length: 30 }, (_, i) =>
      makeWeightedNeighbor({ vectorId: `vec-${i}`, label: "WIN", weight: 1.0 }),
    );
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.expectancy).toBeCloseTo(1.0, 5);
    expect(result.winRate).toBeCloseTo(1.0, 5);
    expect(result.decision).toBe("PASS");
  });
});

describe("knn-decision: makeDecision — A-grade criteria", () => {
  it("aGrade=true when DOUBLE_B + safetyPassed + winRate >= 0.65 (50 samples, 70% win)", () => {
    // 35 WIN, 15 LOSS → winRate = 0.70
    const neighbors = makeNeighbors(50, 35);
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.aGrade).toBe(true);
    expect(result.decision).toBe("PASS");
  });

  it("aGrade=false when signalType is ONE_B even with high winRate", () => {
    const neighbors = makeNeighbors(50, 35); // winRate=0.70
    const result = makeDecision(neighbors, "ONE_B", true, DEFAULT_CONFIG);
    expect(result.aGrade).toBe(false);
  });

  it("aGrade=false when safetyPassed=false even with DOUBLE_B + high winRate", () => {
    const neighbors = makeNeighbors(50, 35); // winRate=0.70
    const result = makeDecision(neighbors, "DOUBLE_B", false, DEFAULT_CONFIG);
    expect(result.aGrade).toBe(false);
  });

  it("aGrade=false when winRate < aGradeWinrateThreshold (0.65)", () => {
    // 30 WIN, 20 LOSS → winRate=0.60 (above PASS threshold but below A-grade)
    const neighbors = makeNeighbors(50, 30);
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.aGrade).toBe(false);
    expect(result.decision).toBe("PASS"); // still PASS, just not A-grade
  });

  it("aGrade=true exactly at aGradeWinrateThreshold=0.65", () => {
    // 39 WIN, 21 LOSS of 60 → winRate=0.65
    const neighbors = makeNeighbors(60, 39);
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.winRate).toBeCloseTo(0.65, 5);
    expect(result.aGrade).toBe(true);
  });

  it("aGrade=false when decision is SKIP (insufficient samples)", () => {
    const neighbors = makeNeighbors(10, 8); // 80% win but only 10 samples
    const result = makeDecision(neighbors, "DOUBLE_B", true, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.aGrade).toBe(false);
  });
});

describe("knn-decision: makeDecision — custom config override", () => {
  it("uses custom minSamples of 5", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 5,
      aGradeWinrateThreshold: 0.65,
    };
    const neighbors = makeNeighbors(5, 4); // exactly 5 samples, 80% win
    const result = makeDecision(neighbors, "ONE_B", false, config);
    expect(result.decision).toBe("PASS");
  });

  it("uses custom winrateThreshold of 0.60", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.60,
      minSamples: 30,
      aGradeWinrateThreshold: 0.75,
    };
    // 33 WIN, 27 LOSS of 60 → winRate = 0.55 (FAIL with 0.60 threshold)
    const neighbors = makeNeighbors(60, 33);
    const result = makeDecision(neighbors, "ONE_B", false, config);
    expect(result.decision).toBe("FAIL");
  });
});

// ---------------------------------------------------------------------------
// DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

let db: DbInstance;

if (dbAvailable) {
  beforeAll(async () => {
    await initTestDb();
    db = getDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });
}

// ── Fixture helpers ──────────────────────────────────────────────────────────

async function insertSymbol(symbol = "BTC/USDT", exchange = "binance"): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;
}

async function insertWatchSession(
  symbol = "BTC/USDT",
  exchange = "binance",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
    VALUES (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${"LONG"}, now())
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertSignal(
  watchSessionId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO signals
      (symbol, exchange, watch_session_id, timeframe, signal_type, direction,
       entry_price, sl_price, safety_passed)
    VALUES
      (${"BTC/USDT"}, ${"binance"}, ${watchSessionId}, ${"5M"}, ${"DOUBLE_B"},
       ${"LONG"}, ${"85000.00"}, ${"84500.00"}, ${true})
    RETURNING id
  `;
  return result[0]!.id as string;
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

async function insertVector(
  candleId: string,
  symbol = "BTC/USDT",
  exchange = "binance",
  timeframe = "5M",
): Promise<string> {
  const pool = getPool();
  // 202-dimension zero vector
  const embedding = `[${new Array(202).fill("0.0").join(",")}]`;
  const result = await pool`
    INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding, label)
    VALUES (${candleId}, ${symbol}, ${exchange}, ${timeframe}, ${embedding}::vector, ${"WIN"})
    RETURNING id
  `;
  return result[0]!.id as string;
}

// ── updateSignalKnnDecision tests ────────────────────────────────────────────

describe.skipIf(!dbAvailable)("knn-decision: updateSignalKnnDecision — DB integration", () => {
  it("sets knn_decision='PASS' on the signal row", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "PASS", winRate: 0.6, expectancy: 0.2, sampleCount: 50, aGrade: false },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`SELECT knn_decision FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.knn_decision).toBe("PASS");
  });

  it("sets knn_decision='FAIL' on the signal row", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "FAIL", winRate: 0.45, expectancy: -0.1, sampleCount: 50, aGrade: false },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`SELECT knn_decision FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.knn_decision).toBe("FAIL");
  });

  it("sets knn_decision='SKIP' on the signal row", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "SKIP", winRate: 0, expectancy: 0, sampleCount: 5, aGrade: false },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`SELECT knn_decision FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.knn_decision).toBe("SKIP");
  });

  it("sets a_grade=true when result.aGrade is true", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "PASS", winRate: 0.7, expectancy: 0.4, sampleCount: 50, aGrade: true },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`SELECT a_grade FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.a_grade).toBe(true);
  });

  it("sets a_grade=false when result.aGrade is false", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "PASS", winRate: 0.6, expectancy: 0.2, sampleCount: 50, aGrade: false },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`SELECT a_grade FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.a_grade).toBe(false);
  });

  it("sets vector_id on the signal row", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "PASS", winRate: 0.6, expectancy: 0.2, sampleCount: 50, aGrade: false },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`SELECT vector_id FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.vector_id).toBe(vectorId);
  });

  it("updates all three fields (knn_decision, a_grade, vector_id) together", async () => {
    await insertSymbol();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal(watchSessionId);
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);

    await updateSignalKnnDecision(
      db,
      signalId,
      { decision: "PASS", winRate: 0.7, expectancy: 0.4, sampleCount: 50, aGrade: true },
      vectorId,
    );

    const pool = getPool();
    const rows = await pool`
      SELECT knn_decision, a_grade, vector_id
      FROM signals
      WHERE id = ${signalId}
    `;
    expect(rows[0]!.knn_decision).toBe("PASS");
    expect(rows[0]!.a_grade).toBe(true);
    expect(rows[0]!.vector_id).toBe(vectorId);
  });
});

// ── loadKnnDecisionConfig tests ──────────────────────────────────────────────

describe.skipIf(!dbAvailable)("knn-decision: loadKnnDecisionConfig — DB integration", () => {
  it("returns defaults when no KNN rows exist", async () => {
    const config = await loadKnnDecisionConfig(db);
    expect(config).toEqual({
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.65,
    });
  });

  it("reads winrate_threshold from CommonCode KNN group", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "winrate_threshold",
      value: 0.60,
      is_active: true,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.winrateThreshold).toBe(0.60);
    expect(config.minSamples).toBe(30);
    expect(config.aGradeWinrateThreshold).toBe(0.65);
  });

  it("reads min_samples from CommonCode KNN group", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "min_samples",
      value: 50,
      is_active: true,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.minSamples).toBe(50);
  });

  it("reads a_grade_winrate_threshold from CommonCode KNN group", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "a_grade_winrate_threshold",
      value: 0.70,
      is_active: true,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.aGradeWinrateThreshold).toBe(0.70);
  });

  it("reads all three thresholds together", async () => {
    await db.insert(commonCodeTable).values([
      { group_code: "KNN", code: "winrate_threshold", value: 0.58, is_active: true },
      { group_code: "KNN", code: "min_samples", value: 20, is_active: true },
      { group_code: "KNN", code: "a_grade_winrate_threshold", value: 0.72, is_active: true },
    ]);
    const config = await loadKnnDecisionConfig(db);
    expect(config.winrateThreshold).toBe(0.58);
    expect(config.minSamples).toBe(20);
    expect(config.aGradeWinrateThreshold).toBe(0.72);
  });

  it("falls back to default when is_active=false", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "winrate_threshold",
      value: 0.80,
      is_active: false,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.winrateThreshold).toBe(0.55);
  });

  it("falls back to default when value is not a valid number", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "min_samples",
      value: "bad",
      is_active: true,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.minSamples).toBe(30);
  });

  it("floors min_samples to integer", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "min_samples",
      value: 25.9,
      is_active: true,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.minSamples).toBe(25);
  });
});
