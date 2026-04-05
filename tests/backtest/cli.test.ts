import { describe, expect, it } from "bun:test";
import { parseArgs, saveBacktestResult } from "../../src/backtest/cli";
import type { DbInstance } from "../../src/db/pool";

// ---------------------------------------------------------------------------
// parseArgs — pure function tests (no DB, no side effects)
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("parses valid args with required options", () => {
    const result = parseArgs([
      "--symbol",
      "BTCUSDT",
      "--start",
      "2024-01-01",
      "--end",
      "2024-06-01",
    ]);
    expect(result.symbol).toBe("BTCUSDT");
    expect(result.exchange).toBe("binance");
    expect(result.start).toEqual(new Date("2024-01-01T00:00:00Z"));
    expect(result.end).toEqual(new Date("2024-06-01T00:00:00Z"));
    expect(result.mode).toBe("backtest");
    expect(result.threads).toBeGreaterThanOrEqual(1);
  });

  it("uses default exchange=binance when not provided", () => {
    const result = parseArgs([
      "--symbol",
      "ETHUSDT",
      "--start",
      "2024-01-01",
      "--end",
      "2024-06-01",
    ]);
    expect(result.exchange).toBe("binance");
  });

  it("uses default mode=backtest when not provided", () => {
    const result = parseArgs([
      "--symbol",
      "BTCUSDT",
      "--start",
      "2024-01-01",
      "--end",
      "2024-06-01",
    ]);
    expect(result.mode).toBe("backtest");
  });

  it("accepts explicit exchange", () => {
    const result = parseArgs([
      "--symbol",
      "BTCUSDT",
      "--exchange",
      "okx",
      "--start",
      "2024-01-01",
      "--end",
      "2024-06-01",
    ]);
    expect(result.exchange).toBe("okx");
  });

  it("accepts mode=wfo", () => {
    const result = parseArgs([
      "--symbol",
      "BTCUSDT",
      "--start",
      "2021-01-01",
      "--end",
      "2024-01-01",
      "--mode",
      "wfo",
    ]);
    expect(result.mode).toBe("wfo");
  });

  it("accepts explicit threads", () => {
    const result = parseArgs([
      "--symbol",
      "BTCUSDT",
      "--start",
      "2024-01-01",
      "--end",
      "2024-06-01",
      "--threads",
      "4",
    ]);
    expect(result.threads).toBe(4);
  });

  it("throws 'symbol is required' when --symbol is missing", () => {
    expect(() => parseArgs([])).toThrow("symbol is required");
  });

  it("throws about date format when --start is invalid", () => {
    expect(() =>
      parseArgs(["--symbol", "X", "--start", "invalid"]),
    ).toThrow(/invalid date format/i);
  });

  it("throws about date format when --end is invalid", () => {
    expect(() =>
      parseArgs(["--symbol", "X", "--start", "2024-01-01", "--end", "not-a-date"]),
    ).toThrow(/invalid date format/i);
  });

  it("throws 'start must be before end' when start >= end", () => {
    expect(() =>
      parseArgs([
        "--symbol",
        "X",
        "--start",
        "2024-06-01",
        "--end",
        "2024-01-01",
      ]),
    ).toThrow("start must be before end");
  });

  it("throws 'start must be before end' when start equals end", () => {
    expect(() =>
      parseArgs([
        "--symbol",
        "X",
        "--start",
        "2024-01-01",
        "--end",
        "2024-01-01",
      ]),
    ).toThrow("start must be before end");
  });

  it("throws about mode when mode is invalid", () => {
    expect(() =>
      parseArgs([
        "--mode",
        "invalid",
        "--symbol",
        "X",
        "--start",
        "2024-01-01",
        "--end",
        "2024-06-01",
      ]),
    ).toThrow(/mode must be backtest or wfo/i);
  });

  it("throws 'threads must be >= 1' when threads=0", () => {
    expect(() =>
      parseArgs([
        "--threads",
        "0",
        "--symbol",
        "X",
        "--start",
        "2024-01-01",
        "--end",
        "2024-06-01",
      ]),
    ).toThrow("threads must be >= 1");
  });

  it("throws 'threads must be >= 1' when threads is negative", () => {
    expect(() =>
      parseArgs([
        "--threads",
        "-2",
        "--symbol",
        "X",
        "--start",
        "2024-01-01",
        "--end",
        "2024-06-01",
      ]),
    ).toThrow("threads must be >= 1");
  });
});

// ---------------------------------------------------------------------------
// saveBacktestResult — DB INSERT helper
// ---------------------------------------------------------------------------

describe("saveBacktestResult", () => {
  it("calls db.insert with backtestTable and returning id", async () => {
    const fakeId = "550e8400-e29b-41d4-a716-446655440000";

    // Minimal mock that satisfies the insert().values().returning() call chain.
    const mockDb = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: fakeId }],
        }),
      }),
    } as unknown as DbInstance;

    const row = {
      run_type: "BACKTEST" as const,
      symbol: "BTCUSDT",
      exchange: "binance",
      start_date: new Date("2024-01-01T00:00:00Z"),
      end_date: new Date("2024-06-01T00:00:00Z"),
      config_snapshot: { symbol: "BTCUSDT" },
      results: { totalTrades: 0 },
    };

    const result = await saveBacktestResult(mockDb, row);
    expect(result).toBe(fakeId);
  });

  it("throws when INSERT returns no rows", async () => {
    const mockDb = {
      insert: () => ({
        values: () => ({
          returning: async () => [],
        }),
      }),
    } as unknown as DbInstance;

    const row = {
      run_type: "BACKTEST" as const,
      symbol: "BTCUSDT",
      exchange: "binance",
      start_date: new Date("2024-01-01T00:00:00Z"),
      end_date: new Date("2024-06-01T00:00:00Z"),
      config_snapshot: {},
      results: {},
    };

    await expect(saveBacktestResult(mockDb, row)).rejects.toThrow("INSERT returned no rows");
  });

  it("propagates DB errors to the caller", async () => {
    const mockDb = {
      insert: () => ({
        values: () => ({
          returning: async () => {
            throw new Error("connection refused");
          },
        }),
      }),
    } as unknown as DbInstance;

    const row = {
      run_type: "WFO" as const,
      symbol: "ETHUSDT",
      exchange: "okx",
      start_date: new Date("2024-01-01T00:00:00Z"),
      end_date: new Date("2024-06-01T00:00:00Z"),
      config_snapshot: {},
      results: {},
    };

    await expect(saveBacktestResult(mockDb, row)).rejects.toThrow("connection refused");
  });
});

// ---------------------------------------------------------------------------
// runWfo saveResult injection — verify callback is defined when db is available
// ---------------------------------------------------------------------------

describe("WFO saveResult wiring", () => {
  it("runWfo is called with saveResult defined when db is available", async () => {
    // We test indirectly: build a mock saveResult and ensure it gets called
    // by a minimal runWfo invocation.
    const { runWfo, generateWfoWindows } = await import("../../src/backtest/wfo");
    const { calcFullMetrics } = await import("../../src/backtest/metrics");

    const saveResultCalls: unknown[] = [];
    const mockSaveResult = async (arg: unknown): Promise<string> => {
      saveResultCalls.push(arg);
      return "parent-id-123";
    };

    // A WFO run that has no valid windows (IS expectancy = 0) will still call
    // saveResult once for the parent row.
    await runWfo(
      {
        isMonths: 6,
        oosMonths: 2,
        rollMonths: 1,
        totalStartDate: new Date("2024-01-01T00:00:00Z"),
        totalEndDate: new Date("2024-09-01T00:00:00Z"),
      },
      [],
      {
        generateWindows: generateWfoWindows,
        searchParams: async () => [{ params: {}, metrics: calcFullMetrics([]) }],
        runBacktest: async () => calcFullMetrics([]),
        saveResult: mockSaveResult,
      },
    );

    // saveResult must have been called at least once for the parent WFO row.
    expect(saveResultCalls.length).toBeGreaterThanOrEqual(1);

    const parentCall = saveResultCalls[0] as Record<string, unknown>;
    expect(parentCall["runType"]).toBe("WFO");
  });
});
