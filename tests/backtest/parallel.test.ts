import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { BacktestTrade } from "../../src/backtest/engine";
import { calcFullMetrics } from "../../src/backtest/metrics";
import type { FullMetrics } from "../../src/backtest/metrics";
import type { ParamSet, ParamResult } from "../../src/backtest/param-search";
import { ParallelSearchManager } from "../../src/backtest/parallel";

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
 * Creates a mock runBacktest that returns deterministic metrics based on the
 * params. The expectancy is proportional to the "value" param if present,
 * otherwise uses "a" + "b".
 */
function makeMockBacktest(
  expectancyFn: (params: ParamSet) => number,
): (params: ParamSet) => Promise<FullMetrics> {
  return async (params: ParamSet): Promise<FullMetrics> => {
    const exp = Math.max(0.01, Math.abs(expectancyFn(params)));
    const winPnl = String(exp);
    const lossPnl = String(exp * 0.1);
    const trades: BacktestTrade[] = [
      makeTrade(winPnl, "WIN"),
      makeTrade(winPnl, "WIN"),
      makeTrade("-" + lossPnl, "LOSS"),
    ];
    return calcFullMetrics(trades);
  };
}

/** Build N combinations with a "value" param equal to the index */
function makeCombinations(n: number): ParamSet[] {
  return Array.from({ length: n }, (_, i) => ({ value: i + 1 }));
}

// ---------------------------------------------------------------------------
// ParallelSearchManager — basic contract
// ---------------------------------------------------------------------------

describe("ParallelSearchManager", () => {
  it("threads=2 with 10 combinations → 10 results returned", async () => {
    const mockBacktest = makeMockBacktest((p) => p["value"] ?? 1);
    const manager = new ParallelSearchManager({
      threads: 2,
      runBacktest: mockBacktest,
    });
    const combos = makeCombinations(10);
    const results = await manager.run(combos);
    expect(results).toHaveLength(10);
  });

  it("each result contains params and metrics", async () => {
    const mockBacktest = makeMockBacktest(() => 1);
    const manager = new ParallelSearchManager({
      threads: 2,
      runBacktest: mockBacktest,
    });
    const combos = makeCombinations(3);
    const results = await manager.run(combos);
    for (const r of results) {
      expect(r).toHaveProperty("params");
      expect(r).toHaveProperty("metrics");
      expect(r.metrics).toHaveProperty("expectancy");
    }
  });

  it("empty combinations → 0 results", async () => {
    const mockBacktest = makeMockBacktest(() => 1);
    const manager = new ParallelSearchManager({
      threads: 2,
      runBacktest: mockBacktest,
    });
    const results = await manager.run([]);
    expect(results).toHaveLength(0);
  });

  it("threads=1 runs sequentially and returns all results", async () => {
    const callOrder: number[] = [];
    const runBacktest = async (params: ParamSet): Promise<FullMetrics> => {
      callOrder.push(params["value"] ?? -1);
      return calcFullMetrics([makeTrade("1", "WIN"), makeTrade("-0.5", "LOSS")]);
    };
    const manager = new ParallelSearchManager({ threads: 1, runBacktest });
    const combos = makeCombinations(5);
    const results = await manager.run(combos);
    expect(results).toHaveLength(5);
    // With threads=1 each combo is processed one at a time in order
    expect(callOrder).toEqual([1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// Error handling / retry
// ---------------------------------------------------------------------------

describe("ParallelSearchManager error handling", () => {
  it("failing combination is skipped, successful ones returned", async () => {
    // Combination with value=3 will fail both attempts
    let callCount = 0;
    const runBacktest = async (params: ParamSet): Promise<FullMetrics> => {
      callCount++;
      if (params["value"] === 3) {
        throw new Error("simulated failure");
      }
      return calcFullMetrics([makeTrade("1", "WIN"), makeTrade("-0.5", "LOSS")]);
    };

    const manager = new ParallelSearchManager({ threads: 2, runBacktest });
    const combos = makeCombinations(5); // values 1..5
    const results = await manager.run(combos);

    // value=3 fails and is skipped → 4 results returned
    expect(results).toHaveLength(4);
    const returnedValues = results.map((r) => r.params["value"]);
    expect(returnedValues).not.toContain(3);
  });

  it("failing combination is retried once before being skipped", async () => {
    const callCountPerValue: Record<number, number> = {};
    const runBacktest = async (params: ParamSet): Promise<FullMetrics> => {
      const v = params["value"] ?? -1;
      callCountPerValue[v] = (callCountPerValue[v] ?? 0) + 1;
      if (v === 2) {
        throw new Error("always fails");
      }
      return calcFullMetrics([makeTrade("1", "WIN"), makeTrade("-0.5", "LOSS")]);
    };

    const manager = new ParallelSearchManager({ threads: 1, runBacktest });
    const combos = [{ value: 1 }, { value: 2 }, { value: 3 }];
    const results = await manager.run(combos);

    // value=2 should be called exactly twice (1 initial + 1 retry)
    expect(callCountPerValue[2]).toBe(2);
    // Skipped, so only 2 results
    expect(results).toHaveLength(2);
  });

  it("other combinations complete normally when one fails", async () => {
    const runBacktest = async (params: ParamSet): Promise<FullMetrics> => {
      if (params["value"] === 1) throw new Error("boom");
      const v = params["value"] ?? 1;
      return calcFullMetrics([
        makeTrade(String(v), "WIN"),
        makeTrade("-0.5", "LOSS"),
      ]);
    };

    const manager = new ParallelSearchManager({ threads: 3, runBacktest });
    const combos = makeCombinations(6);
    const results = await manager.run(combos);

    expect(results).toHaveLength(5);
    const values = results.map((r) => r.params["value"]).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(values).toEqual([2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// Deterministic results
// ---------------------------------------------------------------------------

describe("ParallelSearchManager determinism", () => {
  it("parallel results contain same params as sequential for deterministic backtest", async () => {
    const mockBacktest = makeMockBacktest((p) => p["value"] ?? 1);

    // Sequential (threads=1)
    const seqManager = new ParallelSearchManager({ threads: 1, runBacktest: mockBacktest });
    const combos = makeCombinations(8);
    const seqResults = await seqManager.run(combos);

    // Parallel (threads=4)
    const parManager = new ParallelSearchManager({ threads: 4, runBacktest: mockBacktest });
    const parResults = await parManager.run(combos);

    expect(parResults).toHaveLength(seqResults.length);

    // Sort both by value param before comparing
    const sortByValue = (a: ParamResult, b: ParamResult) =>
      (a.params["value"] ?? 0) - (b.params["value"] ?? 0);

    const sortedSeq = [...seqResults].sort(sortByValue);
    const sortedPar = [...parResults].sort(sortByValue);

    for (let i = 0; i < sortedSeq.length; i++) {
      const s = sortedSeq[i];
      const p = sortedPar[i];
      if (s === undefined || p === undefined) continue;
      expect(p.params).toEqual(s.params);
      expect(p.metrics.expectancy.toNumber()).toBeCloseTo(
        s.metrics.expectancy.toNumber(),
        6,
      );
    }
  });

  it("best params (highest expectancy) match between parallel and sequential", async () => {
    const mockBacktest = makeMockBacktest((p) => p["value"] ?? 1);
    const combos = makeCombinations(10);

    const seqManager = new ParallelSearchManager({ threads: 1, runBacktest: mockBacktest });
    const parManager = new ParallelSearchManager({ threads: 3, runBacktest: mockBacktest });

    const seqResults = await seqManager.run(combos);
    const parResults = await parManager.run(combos);

    // Sort by expectancy DESC to find best
    const byExpDesc = (a: ParamResult, b: ParamResult) =>
      b.metrics.expectancy.toNumber() - a.metrics.expectancy.toNumber();

    const seqBest = [...seqResults].sort(byExpDesc)[0];
    const parBest = [...parResults].sort(byExpDesc)[0];

    expect(seqBest).toBeDefined();
    expect(parBest).toBeDefined();
    if (seqBest !== undefined && parBest !== undefined) {
      expect(parBest.params).toEqual(seqBest.params);
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback behavior
// ---------------------------------------------------------------------------

describe("ParallelSearchManager fallback", () => {
  it("threads=1 produces correct results without concurrency", async () => {
    const mockBacktest = makeMockBacktest((p) => p["value"] ?? 1);
    const manager = new ParallelSearchManager({ threads: 1, runBacktest: mockBacktest });
    const combos = makeCombinations(5);
    const results = await manager.run(combos);
    expect(results).toHaveLength(5);
  });

  it("large thread count (> combinations) still returns all results", async () => {
    const mockBacktest = makeMockBacktest((p) => p["value"] ?? 1);
    const manager = new ParallelSearchManager({ threads: 100, runBacktest: mockBacktest });
    const combos = makeCombinations(3);
    const results = await manager.run(combos);
    expect(results).toHaveLength(3);
  });
});
