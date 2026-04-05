/**
 * T-19-003: calcAllIndicators() bandwidthHistory expansion tests
 *
 * Tests that calcAllIndicators() populates bandwidthHistory (last 20 BB20 bandwidth
 * values) and passes the full series to detectSqueeze(), enabling SQUEEZE_BREAKOUT
 * detection in the WatchSession pipeline.
 *
 * Array convention: chronological order — index 0 = oldest, last index = newest (current).
 *
 * NOTE on squeeze/expansion test data design:
 *   BB20 bandwidth = (upper - lower) / middle, derived from standard deviation of closes.
 *   To test expansion: history must have small-but-nonzero bandwidth (gentle oscillation
 *   in closes), then the last window must include a close far from the prior mean (large
 *   stddev → wide BB → high bandwidth). All-zero history is rejected by detectSqueeze
 *   (isZero guard → "normal"), so closes must have some variation.
 *   To test squeeze: history must have high bandwidth (close prices vary widely across
 *   windows), then the current window has identical closes (zero or near-zero stddev).
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { Candle } from "@/core/types";
import { calcAllIndicators } from "@/indicators/index";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(close: number, i: number, opts: { high?: number; low?: number } = {}): Candle {
  const high = opts.high ?? close * 1.001;
  const low = opts.low ?? close * 0.999;
  return {
    id: `c${i}`,
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
    open: d(close.toString()),
    high: d(high.toString()),
    low: d(low.toString()),
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

/**
 * Build candles designed to produce "expansion" squeeze state.
 *
 * Phase 1 (candles 0..37, 38 candles): gentle close oscillation (99, 100.5, 101)
 * so BB20 has a small-but-nonzero bandwidth in all prior windows.
 *
 * Phase 2 (candle 38, last candle): close=200, far from prior 100 cluster.
 * This makes the current BB20 window (candles 19..38) include a big outlier,
 * causing the standard deviation — and thus bandwidth — to spike well above
 * the 19 prior windows' average × 1.5 threshold → "expansion".
 *
 * Total candles: 39 → 39-20+1=20 BB20 windows → bandwidthHistory.length === 20.
 */
function makeExpansionCandles(): Candle[] {
  const candles: Candle[] = [];
  // 38 candles with gentle oscillation: close alternates 99 / 100.5 / 101
  for (let i = 0; i < 38; i++) {
    const close = i % 3 === 0 ? 99 : i % 3 === 1 ? 100.5 : 101;
    candles.push(makeCandle(close, i));
  }
  // Last candle: close far from the cluster → massive bandwidth spike
  candles.push(makeCandle(200, 38, { high: 210, low: 190 }));
  return candles;
}

/**
 * Build candles designed to produce "squeeze" squeeze state.
 *
 * Phase 1 (candles 0..19, 20 candles): alternating close 80 / 120.
 * Phase 2 (candles 20..39, 20 candles): all close=100 (zero stddev).
 *
 * The oldest windows (i=19..1) each span some of the alternating 80/120 candles,
 * giving high bandwidth. The current window (i=0, candles[20..39]) has all
 * identical closes → stddev ≈ 0 → bandwidth ≈ 0 → "squeeze".
 */
function makeSqueezeCandles(): Candle[] {
  const candles: Candle[] = [];
  // First 20 candles: alternating 80/120 (high close variance)
  for (let i = 0; i < 20; i++) {
    const close = i % 2 === 0 ? 80 : 120;
    candles.push(makeCandle(close, i));
  }
  // Next 20 candles: all flat at 100 (zero close variance in current window)
  for (let i = 20; i < 40; i++) {
    candles.push(makeCandle(100, i));
  }
  return candles;
}

// ---------------------------------------------------------------------------
// bandwidthHistory length tests
// ---------------------------------------------------------------------------

describe("calcAllIndicators() — bandwidthHistory length", () => {
  it("30 candles → bandwidthHistory.length === 11 (30-20+1 windows)", () => {
    // With 30 candles: 30 - 20 + 1 = 11 BB20 windows → bandwidthHistory.length === 11
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    expect(result.bandwidthHistory.length).toBe(11);
  });

  it("39 candles → bandwidthHistory.length === 20 (capped at 20)", () => {
    // 39 candles → 39 - 20 + 1 = 20 BB20 windows → exactly 20
    const candles = makeCandles(39);
    const result = calcAllIndicators(candles);
    expect(result.bandwidthHistory.length).toBe(20);
  });

  it("50 candles → bandwidthHistory.length === 20 (capped at 20)", () => {
    const candles = makeCandles(50);
    const result = calcAllIndicators(candles);
    expect(result.bandwidthHistory.length).toBe(20);
  });

  it("22 candles → bandwidthHistory.length === 3 (22-20+1)", () => {
    // 22 candles → 22 - 20 + 1 = 3 BB20 windows
    const candles = makeCandles(22);
    const result = calcAllIndicators(candles);
    expect(result.bandwidthHistory.length).toBe(3);
    expect(result.bandwidthHistory.length).toBeLessThan(20);
  });

  it("exactly 20 candles → bandwidthHistory.length === 1 (single BB20 value)", () => {
    const candles = makeCandles(20);
    const result = calcAllIndicators(candles);
    expect(result.bandwidthHistory.length).toBe(1);
  });

  it("fewer than 20 candles (bb20 is null) → bandwidthHistory is empty array", () => {
    const candles = makeCandles(5);
    const result = calcAllIndicators(candles);
    expect(result.bandwidthHistory).toEqual([]);
  });

  it("0 candles → bandwidthHistory is empty array", () => {
    const result = calcAllIndicators([]);
    expect(result.bandwidthHistory).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bandwidthHistory last element equals current bb20.bandwidth
// ---------------------------------------------------------------------------

describe("calcAllIndicators() — bandwidthHistory last element", () => {
  it("last element of bandwidthHistory equals current bb20.bandwidth", () => {
    const candles = makeCandles(30);
    const result = calcAllIndicators(candles);
    expect(result.bb20).not.toBeNull();
    const lastBw = result.bandwidthHistory[result.bandwidthHistory.length - 1];
    expect(lastBw).not.toBeUndefined();
    // Should match current bb20.bandwidth (same calculation)
    expect(lastBw?.toNumber()).toBeCloseTo(result.bb20?.bandwidth.toNumber() ?? 0, 8);
  });
});

// ---------------------------------------------------------------------------
// squeeze detection with bandwidthHistory
// ---------------------------------------------------------------------------

describe("calcAllIndicators() — squeeze detection", () => {
  it("single bandwidth value (20 candles) → squeeze === 'normal' (existing behavior preserved)", () => {
    // Exactly 20 candles → only 1 BB20 window → detectSqueeze returns 'normal'
    const candles = makeCandles(20);
    const result = calcAllIndicators(candles);
    expect(result.squeeze).toBe("normal");
  });

  it("fewer than 20 candles → squeeze === 'normal' (no bb20, empty history)", () => {
    const candles = makeCandles(10);
    const result = calcAllIndicators(candles);
    expect(result.squeeze).toBe("normal");
  });

  it("narrow bandwidth history then sudden expansion → squeeze === 'expansion'", () => {
    // 39 candles: 38 with gentle oscillation (nonzero bandwidth), last with close=200 (spike)
    const candles = makeExpansionCandles();
    const result = calcAllIndicators(candles);
    expect(result.squeeze).toBe("expansion");
  });

  it("wide bandwidth history then sudden squeeze → squeeze === 'squeeze'", () => {
    // 40 candles: first 20 alternating 80/120 (wide BB), last 20 all=100 (zero bandwidth)
    const candles = makeSqueezeCandles();
    const result = calcAllIndicators(candles);
    expect(result.squeeze).toBe("squeeze");
  });
});

// ---------------------------------------------------------------------------
// Type-level and backward-compat tests
// ---------------------------------------------------------------------------

describe("AllIndicators type — bandwidthHistory", () => {
  it("result has bandwidthHistory field", () => {
    const result = calcAllIndicators(makeCandles(30));
    expect("bandwidthHistory" in result).toBe(true);
    expect(Array.isArray(result.bandwidthHistory)).toBe(true);
  });

  it("bandwidthHistory values are Decimal instances", () => {
    const result = calcAllIndicators(makeCandles(30));
    for (const v of result.bandwidthHistory) {
      // Decimal.js instances have a .toNumber() method
      expect(typeof v.toNumber()).toBe("number");
    }
  });

  it("existing fields are unaffected (additive change)", () => {
    const result = calcAllIndicators(makeCandles(30));
    expect("bb20" in result).toBe(true);
    expect("squeeze" in result).toBe(true);
    expect("sma20History" in result).toBe(true);
    expect("rsiHistory" in result).toBe(true);
    expect(result.bb20).not.toBeNull();
    expect(result.sma20History.length).toBeGreaterThan(0);
  });
});
