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
  aGradeWinrateThreshold: 0.5,
  aGradeMinSamples: 20,
  commissionPct: 0.0008,
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
    const result = makeDecision([], false, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.winRate).toBe(0);
    expect(result.expectancy).toBe(0);
    expect(result.sampleCount).toBe(0);
    expect(result.aGrade).toBe(false);
  });

  it("returns SKIP when sample count is below minSamples (10 < 30, isAGrade=false)", () => {
    // winRate 0.70, but only 10 samples — below DEFAULT_MIN_SAMPLES=30 (비A급 기준)
    const neighbors = makeNeighbors(10, 7); // 7 of 10 WIN → winRate 0.70
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(10);
  });

  it("returns SKIP when all neighbors have null labels (labeled count < minSamples)", () => {
    const unlabeled = Array.from({ length: 40 }, (_, i) =>
      makeWeightedNeighbor({ vectorId: `vec-${i}`, label: null }),
    );
    const result = makeDecision(unlabeled, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(0);
  });
});

describe("knn-decision: makeDecision — PASS scenarios", () => {
  it("returns PASS with winRate=0.60, expectancy>0, 50 samples (isAGrade=false)", () => {
    // 30 WIN, 20 LOSS out of 50 → winRate = 0.60, expectancy = (30-20)/50 = 0.20
    const neighbors = makeNeighbors(50, 30);
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("PASS");
    expect(result.winRate).toBeCloseTo(0.6, 5);
    expect(result.expectancy).toBeGreaterThan(0);
    expect(result.sampleCount).toBe(50);
  });

  it("returns PASS exactly at winrateThreshold=0.55 with expectancy>0 (isAGrade=false)", () => {
    // 33 WIN, 27 LOSS of 60 → winRate = 0.55
    const neighbors = makeNeighbors(60, 33);
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("PASS");
    expect(result.winRate).toBeCloseTo(0.55, 5);
  });
});

describe("knn-decision: makeDecision — FAIL scenarios", () => {
  it("returns FAIL with winRate=0.45, 50 samples (isAGrade=false)", () => {
    // 22 WIN, 28 LOSS → winRate = 0.44, expectancy = (22-28)/50 = -0.12
    const neighbors = makeNeighbors(50, 22);
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("FAIL");
    expect(result.winRate).toBeCloseTo(0.44, 5);
    expect(result.sampleCount).toBe(50);
  });

  it("returns FAIL when winRate just below threshold (isAGrade=false)", () => {
    // 27/50=0.54, below 0.55 threshold
    const neighbors = makeNeighbors(50, 27);
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("FAIL");
  });

  it("returns FAIL when winRate < threshold, sampleCount >= minSamples (isAGrade=false)", () => {
    const neighbors = makeNeighbors(50, 20); // 20/50=0.40
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
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
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    // Weighted sum: heavy WIN (0.9) + light LOSS (0.1) + 28 tiny WINs (0.01*28 = 0.28)
    // Total weight = 0.9 + 0.1 + 0.28 = 1.28
    // Win weighted = 0.9 + 0.28 = 1.18
    // winRate = 1.18 / 1.28 ≈ 0.921875 → PASS
    expect(result.winRate).toBeGreaterThan(0.9);
  });

  it("computes expectancy for TIME_EXIT label as -0.5 pnlDir, returns net expectancy after fee", () => {
    // 20 WIN, 10 TIME_EXIT out of 30 (no LOSS)
    const neighbors = Array.from({ length: 30 }, (_, i) => {
      const label = i < 20 ? "WIN" : "TIME_EXIT";
      return makeWeightedNeighbor({ vectorId: `vec-${i}`, label, weight: 1.0 });
    });
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    // raw_expectancy = (20*1 + 10*(-0.5)) / 30 = 15/30 = 0.5
    // net_expectancy = 0.5 - 0.0008 = 0.4992
    expect(result.expectancy).toBeCloseTo(0.4992, 4);
  });

  it("all LOSS neighbors → net expectancy = -1.0008", () => {
    const neighbors = Array.from({ length: 30 }, (_, i) =>
      makeWeightedNeighbor({ vectorId: `vec-${i}`, label: "LOSS", weight: 1.0 }),
    );
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    // raw = -1.0, net = -1.0 - 0.0008 = -1.0008
    expect(result.expectancy).toBeCloseTo(-1.0008, 4);
    expect(result.decision).toBe("FAIL");
  });

  it("all WIN neighbors → net expectancy = 0.9992, winRate = 1", () => {
    const neighbors = Array.from({ length: 30 }, (_, i) =>
      makeWeightedNeighbor({ vectorId: `vec-${i}`, label: "WIN", weight: 1.0 }),
    );
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    // raw = 1.0, net = 1.0 - 0.0008 = 0.9992
    expect(result.expectancy).toBeCloseTo(0.9992, 4);
    expect(result.winRate).toBeCloseTo(1.0, 5);
    expect(result.decision).toBe("PASS");
  });
});

describe("knn-decision: makeDecision — A-grade (isAGrade pass-through)", () => {
  it("isAGrade=true + PASS → aGrade=true (pass-through)", () => {
    // 35 WIN, 15 LOSS of 50 → winRate = 0.70 (A급 기준 0.50 충족, A급 min_samples=20 충족)
    const neighbors = makeNeighbors(50, 35);
    const result = makeDecision(neighbors, true, DEFAULT_CONFIG);
    expect(result.aGrade).toBe(true);
    expect(result.decision).toBe("PASS");
  });

  it("isAGrade=false + PASS → aGrade=false (pass-through)", () => {
    const neighbors = makeNeighbors(50, 35); // winRate=0.70
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.aGrade).toBe(false);
    expect(result.decision).toBe("PASS");
  });

  it("isAGrade=true + FAIL → aGrade=true (pass-through, even on FAIL)", () => {
    // winRate=0.44 → A급 완화 기준(0.50)도 미달 → FAIL
    // 22 WIN, 28 LOSS of 50
    const neighbors = makeNeighbors(50, 22);
    const result = makeDecision(neighbors, true, DEFAULT_CONFIG);
    // A급 완화 winrate=0.50 기준에도 0.44는 미달 → FAIL
    expect(result.decision).toBe("FAIL");
    expect(result.aGrade).toBe(true); // pass-through: isAGrade=true는 유지됨
  });

  it("isAGrade=false + FAIL → aGrade=false (pass-through)", () => {
    const neighbors = makeNeighbors(50, 22); // winRate=0.44
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("FAIL");
    expect(result.aGrade).toBe(false);
  });

  it("isAGrade=true + SKIP (insufficient samples) → aGrade=false", () => {
    // 10 샘플은 A급 완화 기준 20에도 미달 → SKIP
    const neighbors = makeNeighbors(10, 8);
    const result = makeDecision(neighbors, true, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.aGrade).toBe(false); // SKIP은 항상 aGrade=false
  });

  it("isAGrade=true: 25 샘플은 A급 기준(20)은 통과, 비A급 기준(30)은 미달", () => {
    // 25 샘플: A급 완화 기준 min_samples=20 통과
    const neighbors = makeNeighbors(25, 15); // winRate=0.60 >= 0.50
    const result = makeDecision(neighbors, true, DEFAULT_CONFIG);
    expect(result.decision).toBe("PASS"); // A급 기준으로 PASS
    expect(result.sampleCount).toBe(25);

    // 같은 25 샘플을 비A급 기준으로는 SKIP
    const resultNonA = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(resultNonA.decision).toBe("SKIP"); // 비A급 min_samples=30 미달
  });
});

describe("knn-decision: commissionPct default", () => {
  it("DEFAULT_CONFIG.commissionPct === 0.0008 (기본값 유지)", () => {
    expect(DEFAULT_CONFIG.commissionPct).toBe(0.0008);
  });
});

describe("knn-decision: makeDecision — fee deduction", () => {
  it("net_expectancy = raw - 0.0008; raw=0.002 → net=0.0012 → PASS", () => {
    // Need winRate >= 0.55 too
    // Using custom config with lower minSamples for simplicity
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 5,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 5,
      commissionPct: 0.0008,
    };
    // 4 WIN, 1 LOSS → winRate=0.80, raw_expectancy=(4-1)/5=0.6, net=0.6-0.0008>0 → PASS
    const neighbors = makeNeighbors(5, 4);
    const result = makeDecision(neighbors, false, config);
    expect(result.decision).toBe("PASS");
    // Verify expectancy is net (0.6 - 0.0008 = 0.5992)
    expect(result.expectancy).toBeCloseTo(0.5992, 4);
  });

  it("expectancy returned equals raw - commissionPct", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 5,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 5,
      commissionPct: 0.0008,
    };
    // 3 WIN, 2 LOSS → raw=(3-2)/5=0.2, net=0.1992, winRate=0.6
    const neighbors = makeNeighbors(5, 3);
    const result = makeDecision(neighbors, false, config);
    expect(result.expectancy).toBeCloseTo(0.2 - config.commissionPct, 5);
    expect(result.decision).toBe("PASS");
  });

  it("net expectancy ≤ 0 → FAIL", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 5,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 5,
      commissionPct: 0.0008,
    };
    // all LOSS → raw=-1, net=-1.0008
    const allLossNeighbors = makeNeighbors(5, 0);
    const result = makeDecision(allLossNeighbors, false, config);
    expect(result.expectancy).toBeLessThanOrEqual(0);
    expect(result.decision).toBe("FAIL");
  });

  it("비A급: 15 samples → SKIP (minSamples=30 미달)", () => {
    const neighbors = makeNeighbors(15, 12); // 80% win but only 15 samples
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(15);
  });

  it("비A급: 29 samples → SKIP (minSamples=30 미달)", () => {
    const neighbors = makeNeighbors(29, 20);
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(29);
  });

  it("비A급: 30 samples → not SKIP (minSamples=30 정확히 충족)", () => {
    const neighbors = makeNeighbors(30, 21); // 21/30=0.70 winRate
    const result = makeDecision(neighbors, false, DEFAULT_CONFIG);
    expect(result.decision).not.toBe("SKIP");
    expect(result.sampleCount).toBe(30);
  });
});

describe("knn-decision: makeDecision — A-grade 임계값 분기 (PRD §7.9)", () => {
  it("isAGrade=true: A급 winrateThreshold=0.50 적용 — winrate=0.52 → PASS", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    };
    // 25 샘플 중 13 WIN = winrate 0.52 (A급 0.50 기준 통과, 비A급 0.55 기준 미달)
    const neighbors = makeNeighbors(25, 13);
    const result = makeDecision(neighbors, true, config);
    expect(result.decision).toBe("PASS"); // A급 완화 기준 적용
    expect(result.aGrade).toBe(true);
  });

  it("isAGrade=false: 비A급 winrateThreshold=0.55 적용 — winrate=0.52 → FAIL", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    };
    // 35 샘플 중 18 WIN = winrate ~0.514 (비A급 0.55 기준 미달)
    const neighbors = makeNeighbors(35, 18);
    const result = makeDecision(neighbors, false, config);
    expect(result.decision).toBe("FAIL"); // 비A급 엄격 기준 적용
    expect(result.aGrade).toBe(false);
  });

  it("isAGrade=true: A급 min_samples=20 적용 — 20 샘플 → SKIP하지 않음", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    };
    // 20 샘플 (A급 완화 기준 정확히 충족)
    const neighbors = makeNeighbors(20, 12); // winRate 0.60 >= 0.50
    const result = makeDecision(neighbors, true, config);
    expect(result.decision).not.toBe("SKIP");
    expect(result.sampleCount).toBe(20);
  });

  it("isAGrade=true: 19 샘플 → SKIP (A급 완화 기준 min_samples=20에도 미달)", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    };
    const neighbors = makeNeighbors(19, 15);
    const result = makeDecision(neighbors, true, config);
    expect(result.decision).toBe("SKIP");
  });
});

describe("knn-decision: makeDecision — custom config override", () => {
  it("uses custom minSamples of 5 (isAGrade=false)", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.55,
      minSamples: 5,
      aGradeWinrateThreshold: 0.65,
      aGradeMinSamples: 5,
      commissionPct: 0.0008,
    };
    const neighbors = makeNeighbors(5, 4); // exactly 5 samples, 80% win
    const result = makeDecision(neighbors, false, config);
    expect(result.decision).toBe("PASS");
  });

  it("uses custom winrateThreshold of 0.60 (isAGrade=false)", () => {
    const config: KnnDecisionConfig = {
      winrateThreshold: 0.60,
      minSamples: 30,
      aGradeWinrateThreshold: 0.75,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    };
    // 33 WIN, 27 LOSS of 60 → winRate = 0.55 (FAIL with 0.60 threshold)
    const neighbors = makeNeighbors(60, 33);
    const result = makeDecision(neighbors, false, config);
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
  _overrides: Record<string, unknown> = {},
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
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
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
    expect(config.aGradeWinrateThreshold).toBe(0.5);
    expect(config.aGradeMinSamples).toBe(20);
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

  it("reads a_grade_min_samples from CommonCode KNN group", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "KNN",
      code: "a_grade_min_samples",
      value: 15,
      is_active: true,
    });
    const config = await loadKnnDecisionConfig(db);
    expect(config.aGradeMinSamples).toBe(15);
  });

  it("reads all four thresholds together", async () => {
    await db.insert(commonCodeTable).values([
      { group_code: "KNN", code: "winrate_threshold", value: 0.58, is_active: true },
      { group_code: "KNN", code: "min_samples", value: 25, is_active: true },
      { group_code: "KNN", code: "a_grade_winrate_threshold", value: 0.72, is_active: true },
      { group_code: "KNN", code: "a_grade_min_samples", value: 15, is_active: true },
    ]);
    const config = await loadKnnDecisionConfig(db);
    expect(config.winrateThreshold).toBe(0.58);
    expect(config.minSamples).toBe(25);
    expect(config.aGradeWinrateThreshold).toBe(0.72);
    expect(config.aGradeMinSamples).toBe(15);
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

  it("floors min_samples and a_grade_min_samples to integer", async () => {
    await db.insert(commonCodeTable).values([
      { group_code: "KNN", code: "min_samples", value: 25.9, is_active: true },
      { group_code: "KNN", code: "a_grade_min_samples", value: 17.8, is_active: true },
    ]);
    const config = await loadKnnDecisionConfig(db);
    expect(config.minSamples).toBe(25);
    expect(config.aGradeMinSamples).toBe(17);
  });
});
