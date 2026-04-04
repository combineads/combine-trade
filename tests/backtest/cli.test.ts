import { describe, expect, it } from "bun:test";
import { parseArgs } from "../../src/backtest/cli";

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
