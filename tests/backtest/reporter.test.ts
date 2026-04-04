import { describe, expect, it, spyOn } from "bun:test";
import { d } from "../../src/core/decimal";
import type { BacktestConfig } from "../../src/backtest/engine";
import type { FullMetrics } from "../../src/backtest/metrics";
import type { BacktestTrade } from "../../src/backtest/engine";
import { printReport, saveReport } from "../../src/backtest/reporter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(): BacktestConfig {
  return {
    symbol: "BTCUSDT",
    exchange: "binance",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-06-01T00:00:00Z"),
  };
}

function makeMetrics(): FullMetrics {
  return {
    totalTrades: d("100"),
    wins: d("55"),
    losses: d("45"),
    winRate: d("0.55"),
    expectancy: d("12.5"),
    maxDrawdown: d("-500"),
    maxDrawdownPct: d("-0.15"),
    sharpeRatio: d("1.23"),
    profitFactor: d("1.8"),
    avgHoldDuration: 7200,
    maxConsecutiveWins: d("8"),
    maxConsecutiveLosses: d("5"),
  };
}

function makeTrades(): BacktestTrade[] {
  return [];
}

// ---------------------------------------------------------------------------
// printReport
// ---------------------------------------------------------------------------

describe("printReport", () => {
  it("outputs a table containing 총 거래 (total trades) label", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    printReport(makeConfig(), makeMetrics(), makeTrades());

    spy.mockRestore();

    const output = logs.join("\n");
    expect(output).toContain("총 거래");
  });

  it("outputs a table containing 승률 (win rate) label", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    printReport(makeConfig(), makeMetrics(), makeTrades());

    spy.mockRestore();

    const output = logs.join("\n");
    expect(output).toContain("승률");
  });

  it("outputs a table containing 기대값 (expectancy) label", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    printReport(makeConfig(), makeMetrics(), makeTrades());

    spy.mockRestore();

    const output = logs.join("\n");
    expect(output).toContain("기대값");
  });

  it("outputs a table containing MDD label", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    printReport(makeConfig(), makeMetrics(), makeTrades());

    spy.mockRestore();

    const output = logs.join("\n");
    expect(output).toContain("MDD");
  });

  it("outputs the symbol from config", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    printReport(makeConfig(), makeMetrics(), makeTrades());

    spy.mockRestore();

    const output = logs.join("\n");
    expect(output).toContain("BTCUSDT");
  });

  it("outputs metric values", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    printReport(makeConfig(), makeMetrics(), makeTrades());

    spy.mockRestore();

    const output = logs.join("\n");
    // totalTrades = 100
    expect(output).toContain("100");
    // winRate 55% (0.55 * 100)
    expect(output).toContain("55");
  });
});

// ---------------------------------------------------------------------------
// saveReport
// ---------------------------------------------------------------------------

describe("saveReport", () => {
  it("calls the insert function exactly once", async () => {
    const insertedValues: unknown[] = [];
    const mockDb = {
      insert: async (_values: unknown) => {
        insertedValues.push(_values);
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    expect(insertedValues).toHaveLength(1);
  });

  it("inserts a row with run_type BACKTEST", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    expect(captured).not.toBeNull();
    expect((captured as Record<string, unknown>).run_type).toBe("BACKTEST");
  });

  it("inserts a row with correct symbol and exchange", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    const row = captured as Record<string, unknown>;
    expect(row.symbol).toBe("BTCUSDT");
    expect(row.exchange).toBe("binance");
  });

  it("inserts a row with correct start_date and end_date", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    const row = captured as Record<string, unknown>;
    expect(row.start_date).toEqual(new Date("2024-01-01T00:00:00Z"));
    expect(row.end_date).toEqual(new Date("2024-06-01T00:00:00Z"));
  });

  it("config_snapshot contains symbol, startDate, endDate", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    const row = captured as Record<string, unknown>;
    const snapshot = row.config_snapshot as Record<string, unknown>;
    expect(snapshot).toBeDefined();
    expect(snapshot.symbol).toBe("BTCUSDT");
    expect(snapshot.startDate).toBeDefined();
    expect(snapshot.endDate).toBeDefined();
  });

  it("results contains winRate and expectancy keys", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    const row = captured as Record<string, unknown>;
    const results = row.results as Record<string, unknown>;
    expect(results).toBeDefined();
    expect("winRate" in results).toBe(true);
    expect("expectancy" in results).toBe(true);
  });

  it("results contains all required FullMetrics fields", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    const row = captured as Record<string, unknown>;
    const results = row.results as Record<string, unknown>;
    expect("totalTrades" in results).toBe(true);
    expect("winRate" in results).toBe(true);
    expect("expectancy" in results).toBe(true);
    expect("maxDrawdown" in results).toBe(true);
    expect("sharpeRatio" in results).toBe(true);
    expect("profitFactor" in results).toBe(true);
  });

  it("Decimal values in results are serialized as numbers", async () => {
    let captured: unknown = null;
    const mockDb = {
      insert: async (values: Record<string, unknown>) => {
        captured = values;
      },
    };

    await saveReport(mockDb, makeConfig(), makeMetrics());

    const row = captured as Record<string, unknown>;
    const results = row.results as Record<string, unknown>;
    // winRate should be a plain number (0.55), not a Decimal object
    expect(typeof results.winRate).toBe("number");
    expect(results.winRate).toBe(0.55);
    // expectancy should be a plain number (12.5)
    expect(typeof results.expectancy).toBe("number");
    expect(results.expectancy).toBe(12.5);
    // totalTrades should be 100
    expect(results.totalTrades).toBe(100);
  });
});
