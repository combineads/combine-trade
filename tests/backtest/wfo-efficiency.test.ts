import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { FullMetrics } from "../../src/backtest/metrics";
import type { ParamSet, ParamSpace } from "../../src/backtest/param-search";
import type { WfoConfig, WfoDeps, WfoResult, WfoWindowResult } from "../../src/backtest/wfo";
import { runWfo } from "../../src/backtest/wfo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal FullMetrics with a given expectancy value. */
function makeMetrics(expectancy: string): FullMetrics {
  return {
    totalTrades: d("10"),
    wins: d("6"),
    losses: d("4"),
    winRate: d("0.6"),
    expectancy: d(expectancy),
    maxDrawdown: d("-0.5"),
    maxDrawdownPct: d("-0.1"),
    sharpeRatio: d("1.2"),
    profitFactor: d("1.5"),
    avgHoldDuration: 3600,
    maxConsecutiveWins: d("3"),
    maxConsecutiveLosses: d("2"),
  };
}

const PARAM_SPACES: ParamSpace[] = [
  { group: "KNN", code: "top_k", min: 1, max: 3, step: 1 },
];

const BEST_PARAMS: ParamSet = { top_k: 3 };

/** Build a WfoConfig spanning exactly 2 rolling windows. */
function makeTwoWindowConfig(): WfoConfig {
  return {
    isMonths: 6,
    oosMonths: 2,
    rollMonths: 1,
    totalStartDate: new Date(Date.UTC(2022, 0, 1)), // 2022-01-01
    totalEndDate: new Date(Date.UTC(2022, 9, 1)),   // 2022-10-01
  };
}

// ---------------------------------------------------------------------------
// Happy-path: 2 windows, IS [1.5, 2.0], OOS [0.9, 1.2]
// ---------------------------------------------------------------------------

describe("runWfo — 2 windows, valid IS expectancy", () => {
  // IS expectancy 1.5 → OOS 0.9 → efficiency 0.6
  // IS expectancy 2.0 → OOS 1.2 → efficiency 0.6
  // overall efficiency = (0.6 + 0.6) / 2 = 0.6

  function buildDeps(isExpectancies: string[], oosExpectancies: string[]): WfoDeps {
    let windowIdx = 0;

    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const searchParams = async (
      _runBacktest: (params: ParamSet) => Promise<FullMetrics>,
      _spaces: ParamSpace[],
    ): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      const metrics = makeMetrics(isExpectancies[windowIdx] ?? "0");
      return [{ params: BEST_PARAMS, metrics }];
    };

    const runBacktest = async (
      _window: { start: Date; end: Date },
      _params: ParamSet,
    ): Promise<FullMetrics> => {
      const metrics = makeMetrics(oosExpectancies[windowIdx] ?? "0");
      windowIdx += 1;
      return metrics;
    };

    return { generateWindows, searchParams, runBacktest };
  }

  it("returns 2 WfoWindowResult entries", async () => {
    const deps = buildDeps(["1.5", "2.0"], ["0.9", "1.2"]);
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);
    expect(result.windows).toHaveLength(2);
  });

  it("window[0] efficiency is 0.6 (0.9 / 1.5)", async () => {
    const deps = buildDeps(["1.5", "2.0"], ["0.9", "1.2"]);
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);
    const w0 = result.windows[0]!;
    expect(w0.efficiency.toFixed(4)).toBe(d("0.9").dividedBy(d("1.5")).toFixed(4));
  });

  it("window[1] efficiency is 0.6 (1.2 / 2.0)", async () => {
    const deps = buildDeps(["1.5", "2.0"], ["0.9", "1.2"]);
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);
    const w1 = result.windows[1]!;
    expect(w1.efficiency.toFixed(4)).toBe(d("1.2").dividedBy(d("2.0")).toFixed(4));
  });

  it("overall efficiency is 0.6", async () => {
    const deps = buildDeps(["1.5", "2.0"], ["0.9", "1.2"]);
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);
    expect(result.overallEfficiency.toFixed(4)).toBe(d("0.6").toFixed(4));
  });

  it("bestParams is set from the best IS window (highest IS expectancy)", async () => {
    const deps = buildDeps(["1.5", "2.0"], ["0.9", "1.2"]);
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);
    expect(result.bestParams).not.toBeNull();
    expect(result.bestParams).toEqual(BEST_PARAMS);
  });

  it("each window carries isMetrics, oosMetrics, bestParams", async () => {
    const deps = buildDeps(["1.5", "2.0"], ["0.9", "1.2"]);
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);
    for (const w of result.windows) {
      expect(w).toHaveProperty("window");
      expect(w).toHaveProperty("isMetrics");
      expect(w).toHaveProperty("oosMetrics");
      expect(w).toHaveProperty("bestParams");
      expect(w).toHaveProperty("efficiency");
    }
  });
});

// ---------------------------------------------------------------------------
// IS expectancy = 0 → skip that window
// ---------------------------------------------------------------------------

describe("runWfo — IS expectancy = 0 for one window", () => {
  // Window 0: IS=0 → skip
  // Window 1: IS=2.0, OOS=1.2 → efficiency=0.6
  // overall = 0.6 (only 1 valid window)

  function buildDeps(): WfoDeps {
    const isExpectancies = ["0", "2.0"];
    const oosExpectancies = ["1.2"]; // only window 1 reaches OOS phase
    let isCallCount = 0;
    let oosCallCount = 0;

    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const searchParams = async (
      _runBacktest: (params: ParamSet) => Promise<FullMetrics>,
      _spaces: ParamSpace[],
    ): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      const idx = isCallCount;
      isCallCount += 1;
      return [{ params: BEST_PARAMS, metrics: makeMetrics(isExpectancies[idx] ?? "0") }];
    };

    const runBacktest = async (
      _window: { start: Date; end: Date },
      _params: ParamSet,
    ): Promise<FullMetrics> => {
      const metrics = makeMetrics(oosExpectancies[oosCallCount] ?? "0");
      oosCallCount += 1;
      return metrics;
    };

    return { generateWindows, searchParams, runBacktest };
  }

  it("only 1 window in result (the zero-IS window is skipped)", async () => {
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, buildDeps());
    expect(result.windows).toHaveLength(1);
  });

  it("overall efficiency = efficiency of the single valid window", async () => {
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, buildDeps());
    const expected = d("1.2").dividedBy(d("2.0"));
    expect(result.overallEfficiency.toFixed(4)).toBe(expected.toFixed(4));
  });
});

// ---------------------------------------------------------------------------
// All windows IS expectancy ≤ 0 → overall efficiency = 0
// ---------------------------------------------------------------------------

describe("runWfo — all windows have IS expectancy ≤ 0", () => {
  function buildDeps(): WfoDeps {
    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const searchParams = async (): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      return [{ params: BEST_PARAMS, metrics: makeMetrics("-0.5") }];
    };

    const runBacktest = async (): Promise<FullMetrics> => {
      return makeMetrics("-0.2");
    };

    return { generateWindows, searchParams, runBacktest };
  }

  it("windows array is empty (all skipped)", async () => {
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, buildDeps());
    expect(result.windows).toHaveLength(0);
  });

  it("overallEfficiency = 0", async () => {
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, buildDeps());
    expect(result.overallEfficiency.toNumber()).toBe(0);
  });

  it("bestParams = null", async () => {
    const result = await runWfo(makeTwoWindowConfig(), PARAM_SPACES, buildDeps());
    expect(result.bestParams).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DB save: parent row + child rows
// ---------------------------------------------------------------------------

describe("runWfo — saveResult dependency", () => {
  type SavedRow = {
    runType: string;
    parentId?: string;
    windowIndex?: number;
    config: unknown;
    results: unknown;
  };

  it("saves a parent WFO row and one child row per valid window", async () => {
    const savedRows: SavedRow[] = [];
    let idCounter = 100;

    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const isExpectancies = ["1.5", "2.0"];
    const oosExpectancies = ["0.9", "1.2"];
    let windowIdx = 0;

    const searchParams = async (): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      return [{ params: BEST_PARAMS, metrics: makeMetrics(isExpectancies[windowIdx] ?? "0") }];
    };

    const runBacktest = async (): Promise<FullMetrics> => {
      const m = makeMetrics(oosExpectancies[windowIdx] ?? "0");
      windowIdx += 1;
      return m;
    };

    const saveResult = async (row: SavedRow): Promise<string> => {
      savedRows.push(row);
      return String(++idCounter);
    };

    const deps: WfoDeps = { generateWindows, searchParams, runBacktest, saveResult };
    await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);

    // Expect 1 parent + 2 child rows
    expect(savedRows).toHaveLength(3);
  });

  it("parent row has runType=WFO and no parentId", async () => {
    const savedRows: SavedRow[] = [];
    let idCounter = 100;

    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const isExpectancies = ["1.5", "2.0"];
    const oosExpectancies = ["0.9", "1.2"];
    let windowIdx = 0;

    const searchParams = async (): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      return [{ params: BEST_PARAMS, metrics: makeMetrics(isExpectancies[windowIdx] ?? "0") }];
    };

    const runBacktest = async (): Promise<FullMetrics> => {
      const m = makeMetrics(oosExpectancies[windowIdx] ?? "0");
      windowIdx += 1;
      return m;
    };

    const saveResult = async (row: SavedRow): Promise<string> => {
      savedRows.push(row);
      return String(++idCounter);
    };

    const deps: WfoDeps = { generateWindows, searchParams, runBacktest, saveResult };
    await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);

    const parent = savedRows[0]!;
    expect(parent.runType).toBe("WFO");
    expect(parent.parentId).toBeUndefined();
  });

  it("child rows have runType=WFO_WINDOW, correct parentId, and windowIndex", async () => {
    const savedRows: SavedRow[] = [];
    let idCounter = 100;

    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const isExpectancies = ["1.5", "2.0"];
    const oosExpectancies = ["0.9", "1.2"];
    let windowIdx = 0;

    const searchParams = async (): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      return [{ params: BEST_PARAMS, metrics: makeMetrics(isExpectancies[windowIdx] ?? "0") }];
    };

    const runBacktest = async (): Promise<FullMetrics> => {
      const m = makeMetrics(oosExpectancies[windowIdx] ?? "0");
      windowIdx += 1;
      return m;
    };

    const saveResult = async (row: SavedRow): Promise<string> => {
      savedRows.push(row);
      return String(++idCounter);
    };

    const deps: WfoDeps = { generateWindows, searchParams, runBacktest, saveResult };
    await runWfo(makeTwoWindowConfig(), PARAM_SPACES, deps);

    const parentId = "101"; // first id issued
    const child0 = savedRows[1]!;
    const child1 = savedRows[2]!;

    expect(child0.runType).toBe("WFO_WINDOW");
    expect(child0.parentId).toBe(parentId);
    expect(child0.windowIndex).toBe(0);

    expect(child1.runType).toBe("WFO_WINDOW");
    expect(child1.parentId).toBe(parentId);
    expect(child1.windowIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Efficiency threshold interpretation
// ---------------------------------------------------------------------------

describe("runWfo — efficiency threshold interpretation", () => {
  function makeDeps(isEx: string, oosEx: string): WfoDeps {
    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    let called = false;

    const searchParams = async (): Promise<{ params: ParamSet; metrics: FullMetrics }[]> => {
      return [{ params: BEST_PARAMS, metrics: makeMetrics(isEx) }];
    };

    const runBacktest = async (): Promise<FullMetrics> => {
      const m = makeMetrics(oosEx);
      if (!called) called = true;
      return m;
    };

    return { generateWindows, searchParams, runBacktest };
  }

  it("overall efficiency > 0.5 when OOS/IS > 0.5", async () => {
    // IS=2.0, OOS=1.2 → eff=0.6 > 0.5
    // Use config with just 1 window to simplify
    const config: WfoConfig = {
      isMonths: 6,
      oosMonths: 2,
      rollMonths: 1,
      totalStartDate: new Date(Date.UTC(2022, 0, 1)),
      totalEndDate: new Date(Date.UTC(2022, 8, 1)), // exactly 1 window
    };
    const deps = makeDeps("2.0", "1.2");
    const result = await runWfo(config, PARAM_SPACES, deps);
    expect(result.overallEfficiency.greaterThan(d("0.5"))).toBe(true);
  });

  it("overall efficiency ≤ 0.5 when OOS/IS ≤ 0.5 (overfitting warning territory)", async () => {
    // IS=2.0, OOS=0.8 → eff=0.4 ≤ 0.5
    const config: WfoConfig = {
      isMonths: 6,
      oosMonths: 2,
      rollMonths: 1,
      totalStartDate: new Date(Date.UTC(2022, 0, 1)),
      totalEndDate: new Date(Date.UTC(2022, 8, 1)),
    };
    const deps = makeDeps("2.0", "0.8");
    const result = await runWfo(config, PARAM_SPACES, deps);
    expect(result.overallEfficiency.lessThanOrEqualTo(d("0.5"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Type shape verification
// ---------------------------------------------------------------------------

describe("WfoWindowResult and WfoResult types", () => {
  it("WfoWindowResult has all required fields", async () => {
    const generateWindows = (cfg: WfoConfig) => {
      const { generateWfoWindows } = require("../../src/backtest/wfo");
      return generateWfoWindows(cfg);
    };

    const deps: WfoDeps = {
      generateWindows,
      searchParams: async () => [{ params: { top_k: 3 }, metrics: makeMetrics("1.0") }],
      runBacktest: async () => makeMetrics("0.7"),
    };

    const config: WfoConfig = {
      isMonths: 6,
      oosMonths: 2,
      rollMonths: 1,
      totalStartDate: new Date(Date.UTC(2022, 0, 1)),
      totalEndDate: new Date(Date.UTC(2022, 8, 1)),
    };

    const result: WfoResult = await runWfo(config, PARAM_SPACES, deps);

    expect(result).toHaveProperty("windows");
    expect(result).toHaveProperty("overallEfficiency");
    expect(result).toHaveProperty("bestParams");

    if (result.windows.length > 0) {
      const w: WfoWindowResult = result.windows[0]!;
      expect(w).toHaveProperty("window");
      expect(w).toHaveProperty("isMetrics");
      expect(w).toHaveProperty("oosMetrics");
      expect(w).toHaveProperty("bestParams");
      expect(w).toHaveProperty("efficiency");
    }
  });
});
