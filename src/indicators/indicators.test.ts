/**
 * T-19-001: AllIndicators sma20History / rsiHistory expansion tests
 *
 * Tests that calcAllIndicators() populates sma20History (last 4 SMA20 values)
 * and rsiHistory (last 14 RSI values) from candle history.
 *
 * Array convention: chronological order — index 0 = oldest, last index = newest (current).
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { Candle } from "@/core/types";
import { calcAllIndicators } from "@/indicators/index";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(close: number, i: number): Candle {
  return {
    id: `c${i}`,
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
    open: d(close.toString()),
    high: d((close * 1.001).toString()),
    low: d((close * 0.999).toString()),
    close: d(close.toString()),
    volume: d("100"),
    is_closed: true,
    created_at: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
  };
}

/** Build N candles with monotonically increasing close prices (1, 2, ..., N). */
function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => makeCandle(i + 1, i));
}

// ---------------------------------------------------------------------------
// sma20History tests
// ---------------------------------------------------------------------------

describe("calcAllIndicators() — sma20History", () => {
  it("30 candles → sma20History has exactly 4 elements", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    expect(result.sma20History.length).toBe(4);
  });

  it("30 candles → sma20History[3] (last element) equals current sma20 value", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    // last element is the current (most recent) SMA20
    const last = result.sma20History[result.sma20History.length - 1];
    expect(result.sma20).not.toBeNull();
    expect(last?.toNumber()).toBeCloseTo(result.sma20?.toNumber() ?? 0, 8);
  });

  it("30 candles → sma20History[0] (first element) equals sma20 from 3 bars ago", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    // Compute SMA20 on candles[0..26] (3 bars ago) to get the expected value
    const candlesMinus3 = candles.slice(0, 27);
    const resultMinus3 = calcAllIndicators(candlesMinus3);
    expect(resultMinus3.sma20).not.toBeNull();
    expect(result.sma20History[0]?.toNumber()).toBeCloseTo(resultMinus3.sma20?.toNumber() ?? 0, 8);
  });

  it("22 candles (SMA20 series yields 3 values) → sma20History.length === 3", () => {
    // 22 candles → calcSMASeries produces 3 values (22 - 20 + 1 = 3)
    const candles = makeCandles(22);
    const result = calcAllIndicators(candles);
    expect(result.sma20History.length).toBe(3);
  });

  it("1000 candles → sma20History.length capped at 4", () => {
    const candles = makeCandles(1000);
    const result = calcAllIndicators(candles);
    expect(result.sma20History.length).toBe(4);
  });

  it("30 candles → prevSma20 unchanged (equals sma20Series[n-2])", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    // prevSma20 should equal the second-to-last element of sma20History
    // (since sma20History ends at current sma20, one before is sma20Series[n-2])
    const secondToLast = result.sma20History[result.sma20History.length - 2];
    expect(result.prevSma20?.toNumber()).toBeCloseTo(secondToLast?.toNumber() ?? 0, 8);
  });
});

// ---------------------------------------------------------------------------
// rsiHistory tests
// ---------------------------------------------------------------------------

describe("calcAllIndicators() — rsiHistory", () => {
  it("30 candles → rsiHistory has exactly 14 elements", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    expect(result.rsiHistory.length).toBe(14);
  });

  it("30 candles → rsiHistory[13] (last element) ≈ rsi14.toNumber()", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    const last = result.rsiHistory[result.rsiHistory.length - 1];
    expect(result.rsi14).not.toBeNull();
    expect(last).toBeCloseTo(result.rsi14?.toNumber() ?? 0, 8);
  });

  it("14 candles (RSI series empty) → rsiHistory.length === 0", () => {
    // RSI period=14 requires at least 15 candles
    const candles = makeCandles(14);
    const result = calcAllIndicators(candles);
    expect(result.rsiHistory.length).toBe(0);
  });

  it("1000 candles → rsiHistory.length capped at 14", () => {
    const candles = makeCandles(1000);
    const result = calcAllIndicators(candles);
    expect(result.rsiHistory.length).toBe(14);
  });

  it("rsiHistory values are numbers (not Decimal)", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    for (const v of result.rsiHistory) {
      expect(typeof v).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level and backward-compat tests
// ---------------------------------------------------------------------------

describe("AllIndicators type — backward compat", () => {
  it("result has sma20History field", () => {
    const result = calcAllIndicators(makeCandles(30));
    expect("sma20History" in result).toBe(true);
    expect(Array.isArray(result.sma20History)).toBe(true);
  });

  it("result has rsiHistory field", () => {
    const result = calcAllIndicators(makeCandles(30));
    expect("rsiHistory" in result).toBe(true);
    expect(Array.isArray(result.rsiHistory)).toBe(true);
  });

  it("existing prevSma20 field is still present and unaffected", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    // prevSma20 must still exist (not removed)
    expect("prevSma20" in result).toBe(true);
    expect(result.prevSma20).not.toBeNull();
  });
});
