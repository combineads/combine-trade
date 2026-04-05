import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { BacktestTrade } from "../../src/backtest/engine";
import { calcFullMetrics } from "../../src/backtest/metrics";
import type { FullMetrics } from "../../src/backtest/metrics";
import {
  assertTunableParams,
  generateGridCombinations,
  generateRandomCombinations,
  runParameterSearch,
  TUNABLE_PARAM_WHITELIST,
} from "../../src/backtest/param-search";
import type { ParamSpace, ParamSet, ParamResult } from "../../src/backtest/param-search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(pnl: string, result: "WIN" | "LOSS"): BacktestTrade {
  return {
    direction: "LONG",
    entryPrice: d("40000"),
    exitPrice: result === "WIN" ? d("40100") : d("39900"),
    size: d("0.1"),
    pnl: d(pnl),
    pnlPct: d(result === "WIN" ? "0.01" : "-0.01"),
    holdDurationSec: 3600,
    result,
    openedAt: new Date("2024-01-01T00:00:00Z"),
    closedAt: new Date("2024-01-01T01:00:00Z"),
  };
}

/**
 * Returns a mock runBacktest callback.
 * The expectancy of the returned metrics is scaled by params["value"] if present,
 * or by params["a"] + params["b"] otherwise — so different param combos yield
 * different, deterministic expectancy values for sort-order testing.
 */
function makeMockBacktest(
  expectancyFn: (params: ParamSet) => number,
): (params: ParamSet) => Promise<FullMetrics> {
  return async (params: ParamSet): Promise<FullMetrics> => {
    const exp = expectancyFn(params);
    // Build 2 WIN trades and 1 LOSS trade so expectancy is positive
    // and parameterisable via PnL amounts.
    const winPnl = String(Math.max(0.01, Math.abs(exp)));
    const lossPnl = String(Math.max(0.01, Math.abs(exp) * 0.1));
    const trades: BacktestTrade[] = [
      makeTrade(winPnl, "WIN"),
      makeTrade(winPnl, "WIN"),
      makeTrade("-" + lossPnl, "LOSS"),
    ];
    return calcFullMetrics(trades);
  };
}

// ---------------------------------------------------------------------------
// generateGridCombinations
// ---------------------------------------------------------------------------

describe("generateGridCombinations", () => {
  it("single param: min=1, max=3, step=1 → 3 combinations", () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 3, step: 1 },
    ];
    const result = generateGridCombinations(spaces);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ top_k: 1 });
    expect(result[1]).toEqual({ top_k: 2 });
    expect(result[2]).toEqual({ top_k: 3 });
  });

  it("single param: min=0, max=1, step=0.5 → 3 combinations (0, 0.5, 1)", () => {
    const spaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0, max: 1, step: 0.5 },
    ];
    const result = generateGridCombinations(spaces);
    expect(result).toHaveLength(3);
    const values = result.map((c) => c["fw_a"] ?? NaN);
    expect(values[0]).toBeCloseTo(0);
    expect(values[1]).toBeCloseTo(0.5);
    expect(values[2]).toBeCloseTo(1);
  });

  it("two params (3×4) → 12 combinations", () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "a", min: 1, max: 3, step: 1 },       // values: 1,2,3 → 3
      { group: "KNN", code: "b", min: 0, max: 3, step: 1 },       // values: 0,1,2,3 → 4
    ];
    const result = generateGridCombinations(spaces);
    expect(result).toHaveLength(12);
    // All combinations of a ∈ {1,2,3} and b ∈ {0,1,2,3}
    for (const combo of result) {
      expect(combo).toHaveProperty("a");
      expect(combo).toHaveProperty("b");
      const aVal: number = combo["a"] ?? -1;
      const bVal: number = combo["b"] ?? -1;
      expect([1, 2, 3]).toContain(aVal);
      expect([0, 1, 2, 3]).toContain(bVal);
    }
  });

  it("each combination is a unique object", () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "x", min: 1, max: 2, step: 1 },
      { group: "KNN", code: "y", min: 10, max: 20, step: 10 },
    ];
    const result = generateGridCombinations(spaces);
    expect(result).toHaveLength(4);
    const seen = new Set<string>();
    for (const combo of result) {
      const key = JSON.stringify(combo);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("ANCHOR group throws an error", () => {
    const spaces: ParamSpace[] = [
      { group: "ANCHOR", code: "bb_period", min: 20, max: 20, step: 1 },
    ];
    expect(() => generateGridCombinations(spaces)).toThrow();
  });

  it("empty spaces → single combination (empty params)", () => {
    const result = generateGridCombinations([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// generateRandomCombinations
// ---------------------------------------------------------------------------

describe("generateRandomCombinations", () => {
  it("returns exactly n combinations", () => {
    const spaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0, max: 1, step: 0.01 },
      { group: "FEATURE_WEIGHT", code: "fw_b", min: 0, max: 1, step: 0.01 },
    ];
    const result = generateRandomCombinations(spaces, 5);
    expect(result).toHaveLength(5);
  });

  it("returns exactly 0 when n=0", () => {
    const spaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0, max: 1, step: 0.01 },
    ];
    const result = generateRandomCombinations(spaces, 0);
    expect(result).toHaveLength(0);
  });

  it("values are within [min, max] for each param", () => {
    const spaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0.1, max: 0.9, step: 0.01 },
      { group: "FEATURE_WEIGHT", code: "fw_b", min: 5, max: 50, step: 1 },
    ];
    const result = generateRandomCombinations(spaces, 20);
    for (const combo of result) {
      expect(combo["fw_a"]).toBeGreaterThanOrEqual(0.1);
      expect(combo["fw_a"]).toBeLessThanOrEqual(0.9);
      expect(combo["fw_b"]).toBeGreaterThanOrEqual(5);
      expect(combo["fw_b"]).toBeLessThanOrEqual(50);
    }
  });

  it("each value is snapped to step increments", () => {
    const spaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0, max: 1, step: 0.25 },
    ];
    const result = generateRandomCombinations(spaces, 20);
    const validValues = [0, 0.25, 0.5, 0.75, 1.0];
    for (const combo of result) {
      const raw: number = combo["fw_a"] ?? -1;
      const val = Math.round(raw * 1000) / 1000;
      const isValid = validValues.some((v) => Math.abs(v - val) < 1e-9);
      expect(isValid).toBe(true);
    }
  });

  it("ANCHOR group throws an error", () => {
    const spaces: ParamSpace[] = [
      { group: "ANCHOR", code: "bb_period", min: 20, max: 20, step: 1 },
    ];
    expect(() => generateRandomCombinations(spaces, 5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// runParameterSearch
// ---------------------------------------------------------------------------

describe("runParameterSearch", () => {
  it("results are sorted by expectancy DESC", async () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 3, step: 1 },
    ];

    // Mock: expectancy proportional to top_k value (3 > 2 > 1)
    const mockBacktest = makeMockBacktest((params) => params["top_k"] ?? 1);

    const results = await runParameterSearch(mockBacktest, spaces);

    expect(results.length).toBeGreaterThan(0);
    for (let i = 0; i < results.length - 1; i++) {
      const cur = results[i];
      const nxt = results[i + 1];
      if (cur === undefined || nxt === undefined) continue;
      const current = cur.metrics.expectancy.toNumber();
      const next = nxt.metrics.expectancy.toNumber();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it("each result has params and metrics", async () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 2, step: 1 },
    ];
    const mockBacktest = makeMockBacktest(() => 1);

    const results = await runParameterSearch(mockBacktest, spaces);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result).toHaveProperty("params");
      expect(result).toHaveProperty("metrics");
      expect(result.metrics).toHaveProperty("expectancy");
      expect(result.metrics).toHaveProperty("winRate");
      expect(result.metrics).toHaveProperty("totalTrades");
    }
  });

  it("includes all grid combinations when no randomSpaces", async () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 3, step: 1 },
    ];
    const mockBacktest = makeMockBacktest((params) => params["top_k"] ?? 1);

    const results = await runParameterSearch(mockBacktest, spaces);

    // 3 grid combos — no random phase
    expect(results).toHaveLength(3);
    const topKValues = results.map((r) => r.params["top_k"] ?? -1).sort((a, b) => a - b);
    expect(topKValues).toEqual([1, 2, 3]);
  });

  it("accepts optional randomSpaces for 2-stage search", async () => {
    const gridSpaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 3, step: 1 },
    ];
    const randomSpaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0, max: 1, step: 0.1 },
    ];

    const mockBacktest = makeMockBacktest((params) => (params["top_k"] ?? 1) + (params["fw_a"] ?? 0));

    const results = await runParameterSearch(mockBacktest, gridSpaces, randomSpaces, 2);

    // Grid: 3 combos. Random: uses top 2 grid results as base, adds 1 random param each.
    // Total should be > 3 because random phase adds additional results.
    expect(results.length).toBeGreaterThan(3);

    // Still sorted by expectancy DESC
    for (let i = 0; i < results.length - 1; i++) {
      const cur = results[i];
      const nxt = results[i + 1];
      if (cur === undefined || nxt === undefined) continue;
      const current = cur.metrics.expectancy.toNumber();
      const next = nxt.metrics.expectancy.toNumber();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it("topN parameter limits how many grid results seed the random phase", async () => {
    const gridSpaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 5, step: 1 },
    ];
    const randomSpaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "fw_a", min: 0, max: 1, step: 0.1 },
    ];

    const callLog: ParamSet[] = [];
    const mockBacktest = async (params: ParamSet): Promise<FullMetrics> => {
      callLog.push({ ...params });
      return calcFullMetrics([
        makeTrade("1", "WIN"),
        makeTrade("-0.5", "LOSS"),
      ]);
    };

    await runParameterSearch(mockBacktest, gridSpaces, randomSpaces, 2);

    // Grid phase: 5 calls (top_k 1..5)
    const gridCalls = callLog.filter((p) => p["fw_a"] === undefined);
    expect(gridCalls).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// assertTunableParams — PRD §7.25 whitelist enforcement
// ---------------------------------------------------------------------------

describe("assertTunableParams", () => {
  it("allows all KNN.* codes", () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 3, max: 20, step: 1 },
      { group: "KNN", code: "threshold", min: 0.5, max: 0.9, step: 0.1 },
    ];
    expect(() => assertTunableParams(spaces)).not.toThrow();
  });

  it("allows all FEATURE_WEIGHT.* codes", () => {
    const spaces: ParamSpace[] = [
      { group: "FEATURE_WEIGHT", code: "w_squeeze", min: 0.1, max: 1.0, step: 0.1 },
      { group: "FEATURE_WEIGHT", code: "w_volume", min: 0.1, max: 1.0, step: 0.1 },
    ];
    expect(() => assertTunableParams(spaces)).not.toThrow();
  });

  it("allows SYMBOL_CONFIG.risk_pct", () => {
    const spaces: ParamSpace[] = [
      { group: "SYMBOL_CONFIG", code: "risk_pct", min: 0.01, max: 0.05, step: 0.005 },
    ];
    expect(() => assertTunableParams(spaces)).not.toThrow();
  });

  it("throws 'not in tunable whitelist' for SYMBOL_CONFIG.max_leverage", () => {
    const spaces: ParamSpace[] = [
      { group: "SYMBOL_CONFIG", code: "max_leverage", min: 5, max: 20, step: 1 },
    ];
    expect(() => assertTunableParams(spaces)).toThrow(/not in tunable whitelist/i);
  });

  it("throws 'not in tunable whitelist' for EXCHANGE group", () => {
    const spaces: ParamSpace[] = [
      { group: "EXCHANGE", code: "api_key", min: 0, max: 1, step: 1 },
    ];
    expect(() => assertTunableParams(spaces)).toThrow(/not in tunable whitelist/i);
  });

  it("throws for ANCHOR group (caught before rejectAnchorGroup)", () => {
    const spaces: ParamSpace[] = [
      { group: "ANCHOR", code: "bb_period", min: 20, max: 20, step: 1 },
    ];
    expect(() => assertTunableParams(spaces)).toThrow();
  });

  it("throws when a non-whitelisted space is mixed with allowed ones", () => {
    const spaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 3, max: 20, step: 1 },
      { group: "SYMBOL_CONFIG", code: "max_leverage", min: 5, max: 20, step: 1 },
    ];
    expect(() => assertTunableParams(spaces)).toThrow(/not in tunable whitelist/i);
  });

  it("passes for an empty array", () => {
    expect(() => assertTunableParams([])).not.toThrow();
  });

  it("TUNABLE_PARAM_WHITELIST is a non-empty readonly array", () => {
    expect(Array.isArray(TUNABLE_PARAM_WHITELIST)).toBe(true);
    expect(TUNABLE_PARAM_WHITELIST.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runParameterSearch — whitelist validation fires before any backtest
// ---------------------------------------------------------------------------

describe("runParameterSearch whitelist enforcement", () => {
  it("throws before running any backtest when gridSpaces contain a non-whitelisted param", async () => {
    const nonWhitelisted: ParamSpace[] = [
      { group: "POSITION", code: "max_size", min: 1, max: 10, step: 1 },
    ];
    let callCount = 0;
    const mockBacktest = async (_params: ParamSet): Promise<FullMetrics> => {
      callCount++;
      return calcFullMetrics([]);
    };

    await expect(runParameterSearch(mockBacktest, nonWhitelisted)).rejects.toThrow(
      /not in tunable whitelist/i,
    );
    expect(callCount).toBe(0);
  });

  it("throws before running any backtest when randomSpaces contain a non-whitelisted param", async () => {
    const gridSpaces: ParamSpace[] = [
      { group: "KNN", code: "top_k", min: 1, max: 2, step: 1 },
    ];
    const nonWhitelistedRandom: ParamSpace[] = [
      { group: "TIMEFRAME", code: "tf", min: 1, max: 5, step: 1 },
    ];
    let callCount = 0;
    const mockBacktest = async (_params: ParamSet): Promise<FullMetrics> => {
      callCount++;
      return calcFullMetrics([]);
    };

    await expect(
      runParameterSearch(mockBacktest, gridSpaces, nonWhitelistedRandom),
    ).rejects.toThrow(/not in tunable whitelist/i);
    expect(callCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Type shape checks (compile-time, verified at test-parse time)
// ---------------------------------------------------------------------------

describe("type shapes", () => {
  it("ParamSpace has required fields", () => {
    const space: ParamSpace = { group: "KNN", code: "top_k", min: 1, max: 20, step: 1 };
    expect(space.group).toBe("KNN");
    expect(space.code).toBe("top_k");
    expect(space.min).toBe(1);
    expect(space.max).toBe(20);
    expect(space.step).toBe(1);
  });

  it("ParamSet is a plain record of string→number", () => {
    const ps: ParamSet = { top_k: 5, max_pyramid: 3 };
    expect(ps["top_k"]).toBe(5);
  });

  it("ParamResult has params and metrics", () => {
    const metrics = calcFullMetrics([]);
    const result: ParamResult = { params: { top_k: 5 }, metrics };
    expect(result.params["top_k"]).toBe(5);
    expect(result.metrics.expectancy.toNumber()).toBe(0);
  });
});
