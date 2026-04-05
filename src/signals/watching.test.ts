/**
 * watching.ts unit tests — T-19-003 + T-19-004
 *
 * T-19-003: SQUEEZE_BREAKOUT path now reachable via bandwidthHistory
 *   calcAllIndicators() now populates bandwidthHistory and passes it to detectSqueeze(),
 *   enabling indicators.squeeze === "expansion" → SQUEEZE_BREAKOUT detection.
 *
 * T-19-004: S/R 겹침 ≥ 2 레벨 카운트 (PRD §7.4 L240)
 *   detectSRConfluence() must count independent S/R levels:
 *     daily_open, prev_day_high, prev_day_low, MA20, MA60, MA120
 *   A level counts when: |close - level| < ATR14 × 0.3
 *   SR_CONFLUENCE triggers when ≥ 2 levels pass.
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { Candle } from "@/core/types";
import { calcAllIndicators } from "@/indicators/index";
import type { AllIndicators } from "@/indicators/types";
import { detectWatching, type SRSymbolState } from "@/signals/watching";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build candles designed to produce "expansion" squeeze state via calcAllIndicators().
 *
 * 38 candles with gentle close oscillation (99/100.5/101), then a final candle
 * at close=200. The current BB20 window spans the final explosive candle, making
 * its standard deviation — and bandwidth — spike well above the historical average
 * → detectSqueeze returns "expansion".
 */
function makeExpansionCandleSeries(): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < 38; i++) {
    const close = i % 3 === 0 ? 99 : i % 3 === 1 ? 100.5 : 101;
    const closeStr = close.toString();
    candles.push({
      id: `c${i}`,
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      open_time: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
      open: d(closeStr),
      high: d((close * 1.001).toString()),
      low: d((close * 0.999).toString()),
      close: d(closeStr),
      volume: d("100"),
      is_closed: true,
      created_at: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
    });
  }
  // Last candle: close far from the cluster → bandwidth spike
  candles.push({
    id: "c38",
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date(Date.UTC(2024, 0, 1, 0, 38 * 5)),
    open: d("200"),
    high: d("210"),
    low: d("190"),
    close: d("200"),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date(Date.UTC(2024, 0, 1, 0, 38 * 5)),
  });
  return candles;
}

function makeCandle(close: string): Candle {
  return {
    id: "test",
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "1H",
    open_time: new Date("2024-01-01T12:00:00Z"),
    open: d(close),
    high: d(close),
    low: d(close),
    close: d(close),
    volume: d("100"),
    is_closed: true,
    created_at: new Date("2024-01-01T12:00:00Z"),
  };
}

/**
 * Builds AllIndicators with the specified values.
 * BB20 and BB4 defaults set far from close so BB4_TOUCH / SQUEEZE don't fire.
 */
function makeIndicators(overrides: {
  sma20?: string;
  sma60?: string;
  sma120?: string;
  atr14?: string | null;
  squeeze?: "squeeze" | "expansion" | "normal";
}): AllIndicators {
  // BB bands: put close (100) safely inside normal range to avoid other detections
  return {
    bb20: {
      upper: d("110"),
      middle: d("100"),
      lower: d("90"),
      bandwidth: d("0.2"),
      percentB: d("0.5"),
    },
    bb4: {
      upper: d("105"),
      middle: d("100"),
      lower: d("95"),
      bandwidth: d("0.1"),
      percentB: d("0.5"),
    },
    bb4_1h: null,
    sma20: overrides.sma20 != null ? d(overrides.sma20) : null,
    prevSma20: null,
    sma20_5m: null,
    sma20History: [],
    sma60: overrides.sma60 != null ? d(overrides.sma60) : null,
    sma120: overrides.sma120 != null ? d(overrides.sma120) : null,
    ema20: null,
    ema60: null,
    ema120: null,
    rsi14: null,
    rsiHistory: [],
    atr14:
      overrides.atr14 !== undefined
        ? overrides.atr14 != null
          ? d(overrides.atr14)
          : null
        : d("10"),
    squeeze: overrides.squeeze ?? "normal",
    bandwidthHistory: [],
  };
}

// ---------------------------------------------------------------------------
// detectSRConfluence via detectWatching — S/R level count tests
// ---------------------------------------------------------------------------

describe("detectWatching — SR_CONFLUENCE (T-19-004)", () => {
  // close = 100, ATR = 10, threshold = 10 * 0.3 = 3
  // MA20 = 101 → |100 - 101| = 1 < 3 ✓
  // MA60 = 102 → |100 - 102| = 2 < 3 ✓
  // Both pass → count = 2 → SR_CONFLUENCE

  it("returns SR_CONFLUENCE when close is near MA20 and MA60 (both within ATR×0.3)", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "101", sma60: "102", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result).not.toBeNull();
    expect(result?.detectionType).toBe("SR_CONFLUENCE");
  });

  // close = 100, ATR = 10, threshold = 3
  // MA20 = 101 → |100 - 101| = 1 < 3 ✓
  // MA60 = 110 → |100 - 110| = 10 >= 3 ✗
  // MA120 = 200 → |100 - 200| = 100 >= 3 ✗
  // count = 1 → null

  it("returns null when only MA20 is close (one level only)", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "101", sma60: "110", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    // Should not be SR_CONFLUENCE (may be BB4_TOUCH or SQUEEZE_BREAKOUT; but close=100 is inside bands)
    // Since close=100 is between BB4 [95,105] but NOT touching/crossing BB4 bands,
    // BB4_TOUCH requires lte(close, bb4Lower=95) or gte(close, bb4Upper=105), so no BB4_TOUCH.
    // No squeeze expansion, so no SQUEEZE_BREAKOUT.
    // SR_CONFLUENCE count = 1 → null
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
    // Either null or some other type
    if (result !== null) {
      expect(["BB4_TOUCH", "SQUEEZE_BREAKOUT"]).toContain(result.detectionType);
    }
  });

  // close = 100, ATR = 10, threshold = 3
  // daily_open = 101 → |100 - 101| = 1 < 3 ✓
  // MA120 = 102 → |100 - 102| = 2 < 3 ✓
  // MA20 = 200 → far ✗
  // MA60 = 200 → far ✗
  // count = 2 → SR_CONFLUENCE

  it("returns SR_CONFLUENCE when close is near daily_open and MA120", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "200", sma60: "200", sma120: "102", atr14: "10" });
    const symbolState: SRSymbolState = { daily_open: d("101") };
    const result = detectWatching(candle, indicators, "NEUTRAL", symbolState);
    expect(result).not.toBeNull();
    expect(result?.detectionType).toBe("SR_CONFLUENCE");
  });

  it("returns null when atr14 is null (fail-safe)", () => {
    const candle = makeCandle("100");
    // All levels close to 100 but atr14 is null → cannot determine threshold
    const indicators = makeIndicators({ sma20: "101", sma60: "102", sma120: "103", atr14: null });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
    // May match BB4_TOUCH or return null — SR_CONFLUENCE must not fire
    if (result !== null) {
      expect(["BB4_TOUCH", "SQUEEZE_BREAKOUT"]).toContain(result.detectionType);
    }
  });

  // close = 100, ATR = 10, threshold = 3
  // MA20 = 200 → far ✗, MA60 = 200 → far ✗, MA120 = 200 → far ✗
  // count = 0 → null

  it("returns null when close is not near any levels", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "200", sma60: "200", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
  });

  // Direction: levels-average above close → SHORT (resistance)
  // close = 100, ATR = 10, threshold = 3 (strict <)
  // MA20 = 101 → |100 - 101| = 1 < 3 ✓
  // MA60 = 102 → |100 - 102| = 2 < 3 ✓
  // avg = 101.5 > 100 → SHORT

  it("direction = SHORT when nearby levels average is above close (resistance)", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "101", sma60: "102", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result?.detectionType).toBe("SR_CONFLUENCE");
    expect(result?.direction).toBe("SHORT");
  });

  // Direction: levels-average below close → LONG (support)
  // close = 100, ATR = 10, threshold = 3 (strict <)
  // MA20 = 99 → |100 - 99| = 1 < 3 ✓
  // MA60 = 98 → |100 - 98| = 2 < 3 ✓
  // avg = 98.5 < 100 → LONG

  it("direction = LONG when nearby levels average is below close (support)", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "99", sma60: "98", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result?.detectionType).toBe("SR_CONFLUENCE");
    expect(result?.direction).toBe("LONG");
  });

  // Bias filter: LONG_ONLY + SHORT direction → null
  // close = 100, ATR = 10, threshold = 3
  // MA20 = 101 → |100 - 101| = 1 < 3 ✓
  // MA60 = 102 → |100 - 102| = 2 < 3 ✓
  // avg = 101.5 > 100 → SHORT → LONG_ONLY blocks it
  it("returns null when bias=LONG_ONLY and SR_CONFLUENCE direction=SHORT", () => {
    const candle = makeCandle("100");
    // levels above close → SHORT
    const indicators = makeIndicators({ sma20: "101", sma60: "102", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "LONG_ONLY");
    // SR_CONFLUENCE SHORT blocked; BB4_TOUCH also checks direction; close=100 inside bands
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
  });

  // prev_day_high and prev_day_low are used when provided
  // close = 100, ATR = 10, threshold = 3
  // prev_day_high = 101 → |100 - 101| = 1 < 3 ✓
  // prev_day_low = 98 → |100 - 98| = 2 < 3 ✓
  // MA20 far, MA60 far, MA120 far
  // count = 2 → SR_CONFLUENCE

  it("includes prev_day_high and prev_day_low as levels when provided in symbolState", () => {
    const candle = makeCandle("100");
    const indicators = makeIndicators({ sma20: "200", sma60: "200", sma120: "200", atr14: "10" });
    const symbolState: SRSymbolState = {
      prev_day_high: d("101"),
      prev_day_low: d("98"),
    };
    const result = detectWatching(candle, indicators, "NEUTRAL", symbolState);
    // prev_day_high=101 (above close=100) and prev_day_low=98 (below close=100)
    // avg = (101+98)/2 = 99.5 < 100 → LONG
    expect(result).not.toBeNull();
    expect(result?.detectionType).toBe("SR_CONFLUENCE");
  });

  // Without symbolState, only MA levels are used
  it("uses only MA levels (no daily_open/prev_day) when symbolState is not provided", () => {
    const candle = makeCandle("100");
    // Only sma20 near → count=1 → not SR_CONFLUENCE
    const indicators = makeIndicators({ sma20: "101", sma60: "200", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
  });
});

// ---------------------------------------------------------------------------
// Evaluation order: SQUEEZE_BREAKOUT → SR_CONFLUENCE → BB4_TOUCH
// ---------------------------------------------------------------------------

describe("detectWatching — evaluation order preserved", () => {
  it("SQUEEZE_BREAKOUT fires before SR_CONFLUENCE when both conditions met", () => {
    // close breaks above BB20 upper → SQUEEZE_BREAKOUT LONG
    // also sma20/sma60 near close → but SQUEEZE evaluated first
    const candle: Candle = {
      id: "test",
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "1H",
      open_time: new Date("2024-01-01T12:00:00Z"),
      open: d("111"),
      high: d("112"),
      low: d("100"),
      close: d("111"), // above bb20Upper=110
      volume: d("100"),
      is_closed: true,
      created_at: new Date("2024-01-01T12:00:00Z"),
    };
    const indicators: AllIndicators = {
      bb20: {
        upper: d("110"),
        middle: d("100"),
        lower: d("90"),
        bandwidth: d("0.2"),
        percentB: d("0.6"),
      },
      bb4: {
        upper: d("105"),
        middle: d("100"),
        lower: d("95"),
        bandwidth: d("0.1"),
        percentB: d("0.6"),
      },
      bb4_1h: null,
      sma20: d("111"), // very close to close
      prevSma20: null,
      sma20_5m: null,
      sma20History: [],
      sma60: d("111"), // very close to close
      sma120: null,
      ema20: null,
      ema60: null,
      ema120: null,
      rsi14: null,
      rsiHistory: [],
      atr14: d("10"),
      squeeze: "expansion", // enables squeeze breakout
      bandwidthHistory: [],
    };
    const result = detectWatching(candle, indicators, "NEUTRAL");
    // close=111 > bb20Upper=110, squeeze=expansion → SQUEEZE_BREAKOUT
    // upper wick ratio = (high=112 - close=111)/(112-100) = 1/12 < 0.5 → passes wick filter
    expect(result?.detectionType).toBe("SQUEEZE_BREAKOUT");
  });

  it("BB4_TOUCH still works when detectWatching is called without symbolState", () => {
    // close touches BB4 lower → BB4_TOUCH LONG
    const candle: Candle = {
      id: "test",
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "1H",
      open_time: new Date("2024-01-01T12:00:00Z"),
      open: d("95"),
      high: d("100"),
      low: d("94"),
      close: d("95"), // lte bb4Lower=95
      volume: d("100"),
      is_closed: true,
      created_at: new Date("2024-01-01T12:00:00Z"),
    };
    const indicators = makeIndicators({ sma20: "200", sma60: "200", sma120: "200", atr14: "10" });
    const result = detectWatching(candle, indicators, "NEUTRAL");
    expect(result?.detectionType).toBe("BB4_TOUCH");
    expect(result?.direction).toBe("LONG");
  });
});

// ---------------------------------------------------------------------------
// T-19-003: SQUEEZE_BREAKOUT reachability via calcAllIndicators bandwidthHistory
// ---------------------------------------------------------------------------

describe("detectWatching — SQUEEZE_BREAKOUT reachable (T-19-003)", () => {
  it("calcAllIndicators with expansion candles produces squeeze=expansion, enabling SQUEEZE_BREAKOUT LONG", () => {
    // Build indicators from a realistic candle series that produces expansion state
    const candles = makeExpansionCandleSeries();
    const indicators = calcAllIndicators(candles);

    // Pre-condition: bandwidthHistory must be populated and squeeze must be expansion
    expect(indicators.bandwidthHistory.length).toBeGreaterThan(1);
    expect(indicators.squeeze).toBe("expansion");
    expect(indicators.bb20).not.toBeNull();

    // biome-ignore lint/style/noNonNullAssertion: checked above
    const bb20Upper = indicators.bb20!.upper;

    // Craft a candle that breaks above BB20 upper with minimal upper wick
    // upper wick ratio = (high - close) / (high - low) < 0.5
    const close = bb20Upper.times("1.05");
    const high = close.times("1.002"); // tiny wick above close
    const low = bb20Upper.times("0.99"); // well below close

    const breakoutCandle: Candle = {
      id: "squeeze-breakout",
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      open_time: new Date(),
      open: d(close.toString()),
      high: d(high.toString()),
      low: d(low.toString()),
      close: d(close.toString()),
      volume: d("1000"),
      is_closed: true,
      created_at: new Date(),
    };

    const result = detectWatching(breakoutCandle, indicators, "LONG_ONLY");
    expect(result).not.toBeNull();
    expect(result?.detectionType).toBe("SQUEEZE_BREAKOUT");
    expect(result?.direction).toBe("LONG");
  });

  it("calcAllIndicators with only 20 candles → squeeze=normal → SQUEEZE_BREAKOUT cannot fire", () => {
    // 20 candles → single BB20 value → detectSqueeze returns 'normal'
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      symbol: "BTC/USDT",
      exchange: "binance" as const,
      timeframe: "5M" as const,
      open_time: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
      open: d((i + 1).toString()),
      high: d(((i + 1) * 1.001).toString()),
      low: d(((i + 1) * 0.999).toString()),
      close: d((i + 1).toString()),
      volume: d("100"),
      is_closed: true,
      created_at: new Date(Date.UTC(2024, 0, 1, 0, i * 5)),
    }));
    const indicators = calcAllIndicators(candles);

    expect(indicators.squeeze).toBe("normal");
    expect(indicators.bb20).not.toBeNull();

    // biome-ignore lint/style/noNonNullAssertion: checked above
    const bb20Upper = indicators.bb20!.upper;
    const close = bb20Upper.times("1.05");

    const candle: Candle = {
      id: "no-squeeze-breakout",
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "5M",
      open_time: new Date(),
      open: d(close.toString()),
      high: d(close.times("1.002").toString()),
      low: d(bb20Upper.times("0.99").toString()),
      close: d(close.toString()),
      volume: d("1000"),
      is_closed: true,
      created_at: new Date(),
    };

    const result = detectWatching(candle, indicators, "LONG_ONLY");
    // SQUEEZE_BREAKOUT must not fire when squeeze is 'normal'
    if (result !== null) {
      expect(result.detectionType).not.toBe("SQUEEZE_BREAKOUT");
    }
  });
});
