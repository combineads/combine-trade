import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { checkSafety, updateSignalSafety } from "@/signals/safety-gate";
import { getDb, getPool } from "@/db/pool";
import type { AllIndicators } from "@/indicators/types";
import type { Candle, DailyBias, VectorTimeframe } from "@/core/types";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: new Decimal("50000"),
    high: new Decimal("51000"),
    low: new Decimal("49000"),
    close: new Decimal("50200"),
    volume: new Decimal("100"),
    is_closed: true,
    created_at: new Date("2024-01-01T00:05:00Z"),
    ...overrides,
  };
}

function makeIndicators(overrides: Partial<AllIndicators> = {}): AllIndicators {
  return {
    bb20: {
      upper: new Decimal("52000"),
      middle: new Decimal("50000"),
      lower: new Decimal("48000"),
      bandwidth: new Decimal("0.08"),
      percentB: new Decimal("0.5"),
    },
    bb4: {
      upper: new Decimal("51000"),
      middle: new Decimal("50000"),
      lower: new Decimal("49500"),
      bandwidth: new Decimal("0.03"),
      percentB: new Decimal("0.5"),
    },
    bb4_1h: null,
    sma20: new Decimal("50000"),
    prevSma20: new Decimal("49900"),
    sma20_5m: null,
    sma60: new Decimal("49500"),
    sma120: new Decimal("49000"),
    ema20: new Decimal("50100"),
    ema60: new Decimal("49600"),
    ema120: new Decimal("49100"),
    rsi14: new Decimal("50"),
    atr14: new Decimal("400"),
    squeeze: "normal",
    ...overrides,
  };
}

function makeSignal(
  overrides: { direction?: "LONG" | "SHORT"; timeframe?: VectorTimeframe } = {},
) {
  return {
    direction: "LONG" as const,
    timeframe: "5M" as VectorTimeframe,
    ...overrides,
  };
}

function makeSymbolState(
  overrides: {
    session_box_high?: Decimal | null;
    session_box_low?: Decimal | null;
    daily_bias?: DailyBias | null;
  } = {},
) {
  return {
    session_box_high: null,
    session_box_low: null,
    daily_bias: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter (5M threshold = 0.1)
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — 5M — LONG", () => {
  it("blocks when lower wick ratio is 0.05 (below threshold 0.1) — small wick = no momentum", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked (small wick = insufficient momentum)
    // range = 1000 (49000 to 50000)
    // lower wick = 0.05 → body bottom = 49000 + 0.05*1000 = 49050
    // open=49050, close=49200, low=49000, high=50000
    // wick=0.05 < threshold=0.1 → BLOCKED
    const candle = makeCandle({
      open: new Decimal("49050"),
      close: new Decimal("49200"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "5M" }), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("passes when lower wick ratio is 0.15 (above threshold 0.1) — large wick = sufficient momentum", () => {
    // NEW PRD rule: wick >= threshold → passes (large wick shows price rejection)
    // range = 1000, lower wick = 0.15 → body bottom = 49000 + 150 = 49150
    // open=49150, close=49300, low=49000, high=50000
    // wick=0.15 >= threshold=0.1 → PASSES
    const candle = makeCandle({
      open: new Decimal("49150"),
      close: new Decimal("49300"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "5M" }), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("passes when lower wick ratio equals threshold exactly (0.1)", () => {
    // range = 1000, body bottom = 49000 + 100 = 49100
    // lower wick = 100/1000 = 0.1 → exactly at threshold
    // NEW rule: lt(wick, threshold) — not strictly less than → PASSES at boundary
    const candle = makeCandle({
      open: new Decimal("49100"),
      close: new Decimal("49200"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "5M" }), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

describe("safety-gate — wick ratio filter — 5M — SHORT", () => {
  it("passes when upper wick ratio is 0.15 (above threshold 0.1) — large wick shows momentum", () => {
    // NEW PRD rule: wick >= threshold → passes (large wick = sufficient momentum)
    // range = 1000 (49000 to 50000)
    // upper wick = 0.15 → body top = 50000 - 150 = 49850
    // open=49700, close=49850, low=49000, high=50000
    // wick=0.15 >= threshold=0.1 → PASSES
    const candle = makeCandle({
      open: new Decimal("49700"),
      close: new Decimal("49850"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "5M" }),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("blocks when upper wick ratio is 0.05 (below threshold 0.1) — small wick = no momentum", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked (small wick = no rejection)
    // upper wick = 0.05 → body top = 50000 - 50 = 49950
    // open=49800, close=49950, low=49000, high=50000
    // wick=0.05 < threshold=0.1 → BLOCKED
    const candle = makeCandle({
      open: new Decimal("49800"),
      close: new Decimal("49950"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "5M" }),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter (1M threshold = 1.0)
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — 1M — threshold 1.0", () => {
  it("blocks when lower wick ratio is 0.7 on 1M (threshold is 1.0) — wick=0.7 < 1.0", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked
    // range = 1000, lower wick = 0.7 → body bottom = 49000 + 700 = 49700
    // wick=0.7 < threshold=1.0 → BLOCKED
    const candle = makeCandle({
      open: new Decimal("49700"),
      close: new Decimal("49800"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "1M" }), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("blocks when upper wick ratio is 0.9 on 1M SHORT (threshold is 1.0) — wick=0.9 < 1.0", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked
    // range = 1000, upper wick = 0.9 → body top = 50000 - 900 = 49100
    // open=49000, close=49100, low=49000, high=50000
    // wick=0.9 < threshold=1.0 → BLOCKED
    const candle = makeCandle({
      open: new Decimal("49000"),
      close: new Decimal("49100"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "1M" }),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter — doji
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — doji", () => {
  it("passes when candle range is zero (doji)", () => {
    const candle = makeCandle({
      open: new Decimal("50000"),
      close: new Decimal("50000"),
      low: new Decimal("50000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — box range filter (MA20-based)
//
// NEW PRD §7.6 rule: blocks when close is INSIDE center zone ("inside_box_center")
//   |close - sma20| < range_20 * 0.15  →  block ("inside_box_center")
//
// Default makeIndicators():
//   sma20 = 50000, bb20.upper = 52000, bb20.lower = 48000
//   range_20 = 4000, margin = 4000 * 0.15 = 600
//   lowerBound = 50000 - 600 = 49400
//   upperBound = 50000 + 600 = 50600
//   BLOCKED when: lowerBound < close < upperBound (strictly inside)
//   PASSES when: close <= lowerBound OR close >= upperBound (outside or on boundary)
// ---------------------------------------------------------------------------

describe("safety-gate — box range filter", () => {
  it("passes when sma20 is null (no indicator data)", () => {
    const candle = makeCandle({ close: new Decimal("60000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: null }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("passes when bb20 is null (no indicator data)", () => {
    const candle = makeCandle({ close: new Decimal("60000") });
    const result = checkSafety(
      candle,
      makeIndicators({ bb20: null }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("blocks when entry price is at MA20 midpoint (inside center zone)", () => {
    // close = sma20 = 50000 → strictly inside (49400, 50600) → BLOCKED
    const candle = makeCandle({ close: new Decimal("50000") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("inside_box_center");
  });

  it("passes when entry price is at the exact lower boundary", () => {
    // lowerBound = 50000 - 600 = 49400 → exactly on boundary (not strictly inside) → PASSES
    const candle = makeCandle({ close: new Decimal("49400") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("passes when entry price is at the exact upper boundary", () => {
    // upperBound = 50000 + 600 = 50600 → exactly on boundary (not strictly inside) → PASSES
    const candle = makeCandle({ close: new Decimal("50600") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("passes when entry price is below lower boundary", () => {
    // lowerBound = 49400, close = 49399 → outside center zone → PASSES
    const candle = makeCandle({ close: new Decimal("49399") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("passes when entry price is above upper boundary", () => {
    // upperBound = 50600, close = 50601 → outside center zone → PASSES
    const candle = makeCandle({ close: new Decimal("50601") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("uses MA20 midpoint, not session_box — session_box fields are irrelevant", () => {
    // close=49399 is outside MA20 center zone [49400, 50600]
    // session_box_high/low set to wide values — still PASSES because close is outside
    const candle = makeCandle({ close: new Decimal("49399") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({
        session_box_high: new Decimal("55000"),
        session_box_low: new Decimal("45000"),
      }),
    );
    expect(result.reasons).not.toContain("inside_box_center");
  });

  it("uses different sma20 and bb20 values correctly", () => {
    // sma20=51000, bb20.upper=53000, bb20.lower=49000 → range_20=4000, margin=600
    // center zone: (50400, 51600)
    // close=50400 → exactly on lower boundary (not strictly inside) → PASSES
    const candle = makeCandle({ close: new Decimal("50400") });
    const result = checkSafety(
      candle,
      makeIndicators({
        sma20: new Decimal("51000"),
        bb20: {
          upper: new Decimal("53000"),
          middle: new Decimal("51000"),
          lower: new Decimal("49000"),
          bandwidth: new Decimal("0.078"),
          percentB: new Decimal("0.35"),
        },
      }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("inside_box_center");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — abnormal candle filter (threshold = 2x avg_range_5)
//
// avg_range_5 = average (high - low) over last 5 candles.
// Candle is blocked only when: counter-trend (역추세/NEUTRAL) AND range > avg_range_5 × 2.0
// Trend-following (순추세): bypass regardless of candle size.
// Fewer than 5 recentCandles: bypass (null).
//
// Helper: makeRecentCandles(n, rangeSize) — creates n candles each with range=rangeSize
// ---------------------------------------------------------------------------

function makeRecentCandles(count: number, rangeSize: number): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    makeCandle({
      open: new Decimal("50000"),
      close: new Decimal("50100"),
      low: new Decimal("50000"),
      high: new Decimal(50000 + rangeSize),
      open_time: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
    }),
  );
}

describe("safety-gate — abnormal candle filter — avg_range_5", () => {
  // avg_range_5 = 400 (5 candles each with range 400)
  // threshold = 400 × 2.0 = 800

  it("역추세 + range > avg_range_5 × 2.0 → abnormal_candle", () => {
    // LONG direction, SHORT_ONLY bias → counter-trend
    // candle range = 1000 > 800 → blocked
    const candle = makeCandle({
      high: new Decimal("51000"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const recentCandles = makeRecentCandles(5, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
      recentCandles,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("abnormal_candle");
  });

  it("역추세 + range < avg_range_5 × 2.0 → null (passes)", () => {
    // LONG direction, SHORT_ONLY bias → counter-trend
    // candle range = 600 < 800 → passes
    const candle = makeCandle({
      high: new Decimal("50600"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50400"),
    });
    const recentCandles = makeRecentCandles(5, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
      recentCandles,
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("순추세 + range > avg_range_5 × 2.0 → null (bypass)", () => {
    // LONG direction, LONG_ONLY bias → trend-following → bypassed
    // candle range = 2000 >> 800 — would fail if filter applied, but bypassed
    const candle = makeCandle({
      high: new Decimal("52000"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const recentCandles = makeRecentCandles(5, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
      recentCandles,
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("5봉 미만 recentCandles → bypass (null)", () => {
    // Only 4 candles provided — not enough to compute avg_range_5 → bypass
    const candle = makeCandle({
      high: new Decimal("52000"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const recentCandles = makeRecentCandles(4, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
      recentCandles,
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("NEUTRAL bias + big candle → abnormal_candle (NEUTRAL treated as counter-trend)", () => {
    // NEUTRAL bias → conservative → filter applied
    // candle range = 1000 > avg_range_5 × 2.0 = 800 → blocked
    const candle = makeCandle({
      high: new Decimal("51000"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const recentCandles = makeRecentCandles(5, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "NEUTRAL" }),
      recentCandles,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("abnormal_candle");
  });

  it("null bias + big candle → abnormal_candle (null treated as counter-trend)", () => {
    // null bias → conservative → filter applied
    const candle = makeCandle({
      high: new Decimal("51000"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const recentCandles = makeRecentCandles(5, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: null }),
      recentCandles,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("abnormal_candle");
  });

  it("empty recentCandles (default []) → bypass", () => {
    // No recentCandles passed → checkSafety default param [] → 0 < 5 → bypass
    const candle = makeCandle({
      high: new Decimal("52000"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("range exactly at threshold (avg_range_5 × 2.0) → passes (must be strictly greater)", () => {
    // avg_range_5 = 400, threshold = 800, candle range = 800 → exactly at → pass
    const candle = makeCandle({
      high: new Decimal("50800"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50500"),
    });
    const recentCandles = makeRecentCandles(5, 400);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
      recentCandles,
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("uses only last 5 candles even when more are provided (slice(-5))", () => {
    // 10 candles: first 5 have range=2000, last 5 have range=100
    // avg_range_5 of last 5 = 100 → threshold = 200
    // candle range = 500 > 200 → abnormal
    const bigCandles = makeRecentCandles(5, 2000);
    const smallCandles = makeRecentCandles(5, 100);
    const recentCandles = [...bigCandles, ...smallCandles];
    const candle = makeCandle({
      high: new Decimal("50500"),
      low: new Decimal("50000"),
      open: new Decimal("50100"),
      close: new Decimal("50300"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
      recentCandles,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("abnormal_candle");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — 1M noise filter (PRD §7.7)
//
// Uses 5M MA20 direction (indicators.sma20_5m), NOT 1M SMA20.
// close > sma20_5m → 5M MA20 bullish; close <= sma20_5m → 5M MA20 bearish.
//
// LONG_ONLY + 5M MA20 bullish → pass
// LONG_ONLY + 5M MA20 bearish → fail ("noise_1m")
// SHORT_ONLY + 5M MA20 bearish → pass
// SHORT_ONLY + 5M MA20 bullish → fail ("noise_1m")
// NEUTRAL / null → pass
// sma20_5m null → pass (no data)
// timeframe=5M → skip entirely
// ---------------------------------------------------------------------------

describe("safety-gate — 1M noise filter — uses 5M MA20 (PRD §7.7)", () => {
  it("skips 1M filter when timeframe is 5M", () => {
    // Even with 5M MA20 bearish + LONG_ONLY bias → but 5M timeframe → skip
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when timeframe is 1M but sma20_5m is null (no 5M data)", () => {
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: null }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when timeframe is 1M but daily_bias is NEUTRAL", () => {
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "NEUTRAL" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when timeframe is 1M but daily_bias is null", () => {
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: null }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("fails when 1M + 5M MA20 bearish + LONG_ONLY bias", () => {
    // close=49000 < sma20_5m=50000 → 5M MA20 bearish; LONG_ONLY expects bullish → noise
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("noise_1m");
  });

  it("fails when 1M + 5M MA20 bullish + SHORT_ONLY bias", () => {
    // close=51000 > sma20_5m=50000 → 5M MA20 bullish; SHORT_ONLY expects bearish → noise
    const candle = makeCandle({ close: new Decimal("51000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("noise_1m");
  });

  it("passes when 1M + 5M MA20 bullish + LONG_ONLY bias", () => {
    // close=51000 > sma20_5m=50000 → 5M MA20 bullish; LONG_ONLY → aligned → pass
    const candle = makeCandle({ close: new Decimal("51000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when 1M + 5M MA20 bearish + SHORT_ONLY bias", () => {
    // close=49000 < sma20_5m=50000 → 5M MA20 bearish; SHORT_ONLY → aligned → pass
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20_5m: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("does NOT use 1M sma20 for noise filter — only sma20_5m matters", () => {
    // sma20 (1M) = 50000, sma20_5m = 48000
    // close=49000: 1M sma20 would say bearish, but 5M sma20=48000 → close > 48000 → bullish
    // LONG_ONLY + 5M MA20 bullish → pass
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000"), sma20_5m: new Decimal("48000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — combined scenarios
// ---------------------------------------------------------------------------

describe("safety-gate — combined scenarios", () => {
  it("returns passed=true and empty reasons when all conditions pass (5M)", () => {
    // Candle setup for 5M with LONG_ONLY bias (trend-following → wick filter bypassed):
    //   wick filter: LONG + LONG_ONLY bias → bypass (no wick_ratio_exceeded)
    //   Box (MA20-based): sma20=50000, range_20=4000, margin=600
    //     center zone: (49400, 50600) → close=49300 → outside → PASSES
    //   Abnormal (avg_range_5): recentCandles not passed → default [] → bypass
    //   Timeframe = 5M → skip noise filter
    const candle = makeCandle({
      open: new Decimal("49200"),
      close: new Decimal("49300"), // outside center zone (49300 <= 49400) → passes box
      low: new Decimal("49000"),
      high: new Decimal("49400"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("accumulates multiple failure reasons when multiple conditions fail", () => {
    // Candle: large range → abnormal candle (counter-trend + enough recentCandles)
    //   recentCandles: 5 candles with range=200 → avg_range_5=200, threshold=400
    //   candle range = 2000 (48000 to 50000) → 2000 > 400 → abnormal
    // Wick (5M LONG): lower wick = (body_bottom - 48000) / 2000
    //   open=49800, close=49800 → body_bottom=49800
    //   wick = (49800-48000)/2000 = 1800/2000 = 0.9 >= threshold 0.1 → PASSES wick filter
    //   (to get wick_ratio_exceeded we need wick < threshold 0.1)
    //   Let's use a small wick: open=48050, close=48100, low=48000, high=50000
    //   body_bottom=min(48050,48100)=48050; wick=(48050-48000)/2000=50/2000=0.025 < 0.1 → BLOCKED
    // Box (MA20): sma20=50000, range_20=4000, margin=600, center=(49400, 50600)
    //   close=48100 is outside center zone → PASSES box filter
    //   We need it to also be inside: use close=49600 inside (49400,50600)
    //   Let's just test wick and abnormal together to cover multiple failures.
    //   Use: open=48050, close=49500, low=48000, high=50000
    //   wick=(min(48050,49500)-48000)/2000=(48050-48000)/2000=0.025 < 0.1 → wick BLOCKED
    //   box: close=49500 strictly inside (49400,50600) → BLOCKED
    //   abnormal: range=2000 > threshold=400 → BLOCKED
    const candle = makeCandle({
      open: new Decimal("48050"),
      close: new Decimal("49500"),
      low: new Decimal("48000"),
      high: new Decimal("50000"),
    });
    const recentCandles = makeRecentCandles(5, 200);
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
      recentCandles,
    );
    expect(result.passed).toBe(false);
    // wick_ratio: wick = (48050-48000)/2000 = 0.025 < 0.1 → BLOCKED
    expect(result.reasons).toContain("wick_ratio_exceeded");
    // inside_box_center: close=49500 strictly inside (49400, 50600) → BLOCKED
    expect(result.reasons).toContain("inside_box_center");
    // abnormal: range=2000, avg_range_5=200, threshold=400 → 2000 > 400 → BLOCKED
    expect(result.reasons).toContain("abnormal_candle");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter — counter-trend bypass
//
// NEW PRD rule: lt(wick, threshold) → blocked (small wick = no momentum)
//
// Trend-following (순추세): direction matches bias → wick filter bypassed entirely
// Counter-trend (역추세): direction ≠ bias, or NEUTRAL, or null → filter applied
//
// Test candles:
//   smallLowerWickCandle: lower wick = 0.05 < threshold 0.1 → BLOCKED when filter applied
//   smallUpperWickCandle: upper wick = 0.05 < threshold 0.1 → BLOCKED when filter applied
//
// NOTE: highLowerWickCandle (wick=0.15) PASSES the new filter (wick >= threshold)
//   and is used only to verify bypass — wick check does NOT apply to trend-following.
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio — counter-trend bypass (순추세/역추세)", () => {
  // Candle with SMALL lower wick (0.05) that is blocked by 5M threshold under NEW rule
  // range=1000, body_bottom=49050; wick=(49050-49000)/1000=0.05 < threshold=0.1 → BLOCKED
  const smallLowerWickCandle = makeCandle({
    open: new Decimal("49050"),
    close: new Decimal("49300"),
    low: new Decimal("49000"),
    high: new Decimal("50000"),
  });

  // Candle with SMALL upper wick (0.05) that is blocked by 5M threshold under NEW rule
  // range=1000, body_top=49950; wick=(50000-49950)/1000=0.05 < threshold=0.1 → BLOCKED
  const smallUpperWickCandle = makeCandle({
    open: new Decimal("49700"),
    close: new Decimal("49950"),
    low: new Decimal("49000"),
    high: new Decimal("50000"),
  });

  it("LONG + LONG_ONLY bias (순추세) → bypasses wick filter even with small wick=0.05", () => {
    // Trend-following bypass: wick filter not applied regardless of wick size
    const result = checkSafety(
      smallLowerWickCandle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("SHORT + SHORT_ONLY bias (순추세) → bypasses wick filter even with small upper wick=0.05", () => {
    // Trend-following bypass: wick filter not applied regardless of wick size
    const result = checkSafety(
      smallUpperWickCandle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("LONG + SHORT_ONLY bias (역추세) → applies wick filter → wick_ratio_exceeded", () => {
    // Counter-trend: filter applied; small wick=0.05 < threshold=0.1 → BLOCKED
    const result = checkSafety(
      smallLowerWickCandle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("SHORT + LONG_ONLY bias (역추세) → applies wick filter → wick_ratio_exceeded", () => {
    // Counter-trend: filter applied; small upper wick=0.05 < threshold=0.1 → BLOCKED
    const result = checkSafety(
      smallUpperWickCandle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("LONG + NEUTRAL bias → conservative: applies wick filter → wick_ratio_exceeded", () => {
    // NEUTRAL treated conservatively: filter applied; small wick=0.05 → BLOCKED
    const result = checkSafety(
      smallLowerWickCandle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "NEUTRAL" }),
    );
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("LONG + null bias → applies wick filter → wick_ratio_exceeded", () => {
    // null bias treated conservatively: filter applied; small wick=0.05 → BLOCKED
    const result = checkSafety(
      smallLowerWickCandle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: null }),
    );
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("LONG + LONG_ONLY bias (순추세) with other filters also passing → passed=true", () => {
    // Wick filter is bypassed (순추세). Ensure remaining filters pass:
    //   Box (MA20-based): sma20=50000, range_20=4000, margin=600
    //     center zone: (49400, 50600)
    //     close=49300 ≤ 49400 → on/outside boundary → PASSES box filter
    //   Abnormal (avg_range_5): no recentCandles passed → defaults to [] → bypass
    //   large lower wick=0.15 → would pass filter anyway (>= threshold)
    //     but LONG_ONLY bias → bypass → irrelevant
    //   Noise 1M: timeframe=5M → skipped
    const outsideBoxCandle = makeCandle({
      open: new Decimal("49150"),
      close: new Decimal("49300"), // exactly on/below lower boundary 49400 → PASSES box
      low: new Decimal("49000"),
      high: new Decimal("49400"),
    });
    const result = checkSafety(
      outsideBoxCandle,
      makeIndicators(),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("safety-gate — DB integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function insertParentSymbol(symbol = "BTC/USDT", exchange = "binance"): Promise<void> {
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
    direction: "LONG" | "SHORT" = "LONG",
  ): Promise<string> {
    const pool = getPool();
    const rows = await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${direction}, NOW())
      RETURNING id
    `;
    return rows[0]!.id as string;
  }

  async function insertSignal(
    sessionId: string,
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<string> {
    const pool = getPool();
    const rows = await pool`
      INSERT INTO signals (
        symbol, exchange, watch_session_id, timeframe,
        signal_type, direction, entry_price, sl_price,
        safety_passed, a_grade
      )
      VALUES (
        ${symbol}, ${exchange}, ${sessionId}, ${"5M"},
        ${"ONE_B"}, ${"LONG"}, ${"50000"}, ${"49000"},
        ${false}, ${false}
      )
      RETURNING id
    `;
    return rows[0]!.id as string;
  }

  it("updateSignalSafety sets safety_passed=true when result.passed is true", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, { passed: true, reasons: [] });

    const pool = getPool();
    const rows = await pool`SELECT safety_passed FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.safety_passed).toBe(true);
  });

  it("updateSignalSafety does NOT insert SignalDetail when passed=true", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, { passed: true, reasons: [] });

    const pool = getPool();
    const rows = await pool`
      SELECT key FROM signal_details WHERE signal_id = ${signalId} AND key = 'safety_reject_reason'
    `;
    expect(rows.length).toBe(0);
  });

  it("updateSignalSafety sets safety_passed=false when result.passed is false", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["wick_ratio_exceeded"],
    });

    const pool = getPool();
    const rows = await pool`SELECT safety_passed FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.safety_passed).toBe(false);
  });

  it("updateSignalSafety inserts SignalDetail with safety_reject_reason when failed", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["wick_ratio_exceeded", "abnormal_candle"],
    });

    const pool = getPool();
    const rows = await pool`
      SELECT key, text_value FROM signal_details
      WHERE signal_id = ${signalId} AND key = 'safety_reject_reason'
    `;

    expect(rows.length).toBe(1);
    expect(rows[0]!.text_value).toBe("wick_ratio_exceeded, abnormal_candle");
  });

  it("updateSignalSafety is idempotent — second call updates existing detail row", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["wick_ratio_exceeded"],
    });

    // Call again with different reasons
    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["outside_box_range"],
    });

    const pool = getPool();
    const rows = await pool`
      SELECT key, text_value FROM signal_details
      WHERE signal_id = ${signalId} AND key = 'safety_reject_reason'
    `;

    // Should still be exactly 1 row (upserted)
    expect(rows.length).toBe(1);
    expect(rows[0]!.text_value).toBe("outside_box_range");
  });
});
