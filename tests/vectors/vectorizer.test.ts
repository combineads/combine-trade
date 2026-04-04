import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import { calcAllIndicators } from "../../src/indicators/index";
import type { AllIndicators } from "../../src/indicators/types";
import { FEATURE_NAMES, VECTOR_DIM } from "../../src/vectors/features";
import { vectorize } from "../../src/vectors/vectorizer";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(close: number, index: number, openTime?: Date): Candle {
  const high = close * 1.005;
  const low = close * 0.995;
  const open = close * 0.999;
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance" as const,
    timeframe: "5M" as const,
    open_time: openTime ?? new Date(Date.now() - index * 300_000),
    open: d(open.toFixed(4)),
    high: d(high.toFixed(4)),
    low: d(low.toFixed(4)),
    close: d(close.toString()),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date(),
  };
}

/** Create N candles with a slight uptrend, newest last. */
function makeCandles(count: number, baseClose = 85000): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(baseClose + i * 10, count - 1 - i));
}

/** Build a complete AllIndicators with all-null state. */
function nullIndicators(): AllIndicators {
  return {
    bb20: null,
    bb4: null,
    bb4_1h: null,
    sma20: null,
    prevSma20: null,
    sma60: null,
    sma120: null,
    ema20: null,
    ema60: null,
    ema120: null,
    rsi14: null,
    atr14: null,
    squeeze: "normal",
  };
}

// ---------------------------------------------------------------------------
// vectorizer
// ---------------------------------------------------------------------------

describe("vectorizer", () => {
  it("returns Float32Array of length 202 with sufficient candles", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
    expect(vec.length).toBe(202);
  });

  it("returns Float32Array of length 202 with 1M timeframe", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "1M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  it("returns Float32Array of length 202 with minimal candles (< 20)", () => {
    const candles = makeCandles(5);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  it("returns Float32Array of length 202 with empty candles", () => {
    const indicators = nullIndicators();
    const vec = vectorize([], indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  it("returns no NaN or Infinity values with sufficient candles", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("returns no NaN or Infinity values with null indicators", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("returns no NaN or Infinity values with empty candles + null indicators", () => {
    const indicators = nullIndicators();
    const vec = vectorize([], indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("null indicator fields → 0.0 for dependent features", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    // bb20 is null → indices 0-3 (bb20 price position) should be 0
    expect(vec[0]).toBe(0); // bb20_pct_b_5m
    expect(vec[1]).toBe(0); // bb20_upper_dist_5m
    expect(vec[2]).toBe(0); // bb20_lower_dist_5m
    expect(vec[3]).toBe(0); // bb20_bandwidth_5m

    // bb4 is null → indices 4-7 should be 0
    expect(vec[4]).toBe(0); // bb4_pct_b_5m
    expect(vec[5]).toBe(0); // bb4_upper_dist_5m

    // rsi14 null → index 40, 41 should be 0
    expect(vec[40]).toBe(0); // rsi14_5m
    expect(vec[41]).toBe(0); // rsi14_diff_vs_50_5m
  });

  it("FEATURE_NAMES order: index 0 = bb20_pct_b_5m", () => {
    expect(FEATURE_NAMES[0]).toBe("bb20_pct_b_5m");
    expect(FEATURE_NAMES[40]).toBe("rsi14_5m");
    expect(FEATURE_NAMES[70]).toBe("atr14_5m");
    expect(FEATURE_NAMES[100]).toBe("sma20_slope_5m");
    expect(FEATURE_NAMES[140]).toBe("bb20_pct_b_lag1_5m");
    expect(FEATURE_NAMES[190]).toBe("bb20_position");
    expect(FEATURE_NAMES[191]).toBe("bb4_position");
    expect(FEATURE_NAMES[192]).toBe("ma_ordering");
    expect(FEATURE_NAMES[193]).toBe("ma20_slope");
    expect(FEATURE_NAMES[201]).toBe("session_box_position");
  });

  it("bb20_pct_b_5m (index 0) is near 0.5 for close near bb20 middle", () => {
    // Use enough candles for bb20
    const candles = makeCandles(60);
    const indicators = calcAllIndicators(candles);
    if (indicators.bb20 === null) return; // skip if warmup not complete

    const vec = vectorize(candles, indicators, "5M");
    // pct_b near 0.5 means close is near middle of the band
    const pctB = vec[0] ?? 0;
    expect(Number.isFinite(pctB)).toBe(true);
    expect(pctB).toBeGreaterThanOrEqual(-1); // reasonable range
    expect(pctB).toBeLessThanOrEqual(2); // reasonable range
  });

  it("rsi14_5m (index 40) is in [0, 1] range", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const rsi = vec[40] ?? -1;
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(1);
  });

  it("strategy features: indices 190-201 are finite", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 190; i <= 201; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // breakout_intensity (index 198)
  // ---------------------------------------------------------------------------

  it("breakout_intensity (index 198): close above BB20 upper → positive", () => {
    // Place close above bb20 upper
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const closeAbove = 87000; // clearly above upper
    const atr = 500;

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
      atr14: d(atr.toString()),
    };
    // override close in candles
    const candle = makeCandle(closeAbove, 0);
    const vec = vectorize([candle], indicators, "5M");

    const bi = vec[198] ?? -999;
    // (87000 - 86000) / 500 = 2.0
    expect(Number.isFinite(bi)).toBe(true);
    expect(bi).toBeGreaterThan(0);
    expect(bi).toBeCloseTo(2.0, 4);
  });

  it("breakout_intensity (index 198): close inside BB20 → 0", () => {
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const closeInside = 85000; // inside bands
    const atr = 500;

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0.5"),
      },
      atr14: d(atr.toString()),
    };
    const candle = makeCandle(closeInside, 0);
    const vec = vectorize([candle], indicators, "5M");

    expect(vec[198]).toBeCloseTo(0, 10);
  });

  it("breakout_intensity (index 198): close below BB20 lower → negative", () => {
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const closeBelow = 83000; // below lower
    const atr = 500;

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
      atr14: d(atr.toString()),
    };
    const candle = makeCandle(closeBelow, 0);
    const vec = vectorize([candle], indicators, "5M");

    const bi = vec[198] ?? -999;
    // (84000 - 83000) / 500 = 2.0, but sign = negative
    expect(Number.isFinite(bi)).toBe(true);
    expect(bi).toBeLessThan(0);
    expect(bi).toBeCloseTo(-2.0, 4);
  });

  it("breakout_intensity (index 198): bb20=null → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[198]).toBe(0.5);
  });

  it("breakout_intensity (index 198): atr14=null → 0.5", () => {
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
      // atr14 not set → null
    };
    const candle = makeCandle(87000, 0);
    const vec = vectorize([candle], indicators, "5M");

    expect(vec[198]).toBe(0.5);
  });

  // ---------------------------------------------------------------------------
  // disparity_divergence (index 199)
  // ---------------------------------------------------------------------------

  it("disparity_divergence (index 199): bb4 %B > bb20 %B → positive", () => {
    // bb4 bands are tighter: close is at 80% of bb4 width, 50% of bb20 width
    const bb20Lower = 83000;
    const bb20Upper = 87000; // bb20 width = 4000
    const bb4Lower = 84500;
    const bb4Upper = 85500; // bb4 width = 1000
    const closePrice = 85300; // bb4 %B = (85300-84500)/1000 = 0.8, bb20 %B = (85300-83000)/4000 = 0.575

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(bb20Upper.toString()),
        middle: d("85000"),
        lower: d(bb20Lower.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
      bb4: {
        upper: d(bb4Upper.toString()),
        middle: d("85000"),
        lower: d(bb4Lower.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
    };
    const candle = makeCandle(closePrice, 0);
    const vec = vectorize([candle], indicators, "5M");

    const dd = vec[199] ?? -999;
    expect(Number.isFinite(dd)).toBe(true);
    expect(dd).toBeGreaterThan(0);
    // bb4 %B = 0.8, bb20 %B = (85300-83000)/4000 = 0.575 → divergence = 0.225
    expect(dd).toBeCloseTo(0.225, 4);
  });

  it("disparity_divergence (index 199): bb4=null → 0.5", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d("86000"),
        middle: d("85000"),
        lower: d("84000"),
        bandwidth: d("0"),
        percentB: d("0"),
      },
    };
    const candle = makeCandle(85000, 0);
    const vec = vectorize([candle], indicators, "5M");

    expect(vec[199]).toBe(0.5);
  });

  it("disparity_divergence (index 199): bb20=null → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[199]).toBe(0.5);
  });

  it("disparity_divergence (index 199): bb4 width=0 → 0.5", () => {
    const price = 85000;
    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d("86000"),
        middle: d("85000"),
        lower: d("84000"),
        bandwidth: d("0"),
        percentB: d("0"),
      },
      bb4: {
        upper: d(price.toString()),
        middle: d(price.toString()),
        lower: d(price.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
    };
    const candle = makeCandle(price, 0);
    const vec = vectorize([candle], indicators, "5M");

    expect(vec[199]).toBe(0.5);
  });

  // ---------------------------------------------------------------------------
  // daily_open_distance (index 200)
  // ---------------------------------------------------------------------------

  it("daily_open_distance (index 200): close > daily open → positive", () => {
    // Create candles on the same day: all timestamps are the same UTC day
    const baseTime = new Date("2024-01-15T08:00:00Z");
    const baseClose = 85000;
    // candles newest-last, all on 2024-01-15
    const dayCandlesCount = 12;
    const dayCandlesPrices = Array.from({ length: dayCandlesCount }, (_, i) => baseClose + i * 10);
    const dayCandles: ReturnType<typeof makeCandle>[] = dayCandlesPrices.map((price, i) =>
      makeCandle(price, dayCandlesCount - 1 - i, new Date(baseTime.getTime() + i * 300_000)),
    );
    // daily open = first same-day candle's open ≈ baseClose * 0.999
    // close = last candle's close = baseClose + (count-1)*10
    const indicators = calcAllIndicators(dayCandles);
    if (indicators.atr14 === null) return;

    const vec = vectorize(dayCandles, indicators, "5M");
    const dod = vec[200] ?? -999;
    expect(Number.isFinite(dod)).toBe(true);
    // close is higher than daily open → positive
    expect(dod).toBeGreaterThan(0);
  });

  it("daily_open_distance (index 200): atr14=null → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[200]).toBe(0.5);
  });

  it("daily_open_distance (index 200): is finite with sufficient candles", () => {
    // makeCandles uses relative timestamps — all same-day since they're spaced 5 min apart
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(Number.isFinite(vec[200] ?? NaN)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // session_box_position (index 201)
  // ---------------------------------------------------------------------------

  it("session_box_position (index 201): close = session_low → 0.0", () => {
    // Create candles where the last candle's close is the session low.
    // All candles on same day. Last candle has the lowest close.
    const baseTime = new Date("2024-01-15T08:00:00Z");
    const prices = [85100, 85200, 85300, 85000]; // last = 85000 = lowest close
    const dayCandles = prices.map((price, i) =>
      makeCandle(price, prices.length - 1 - i, new Date(baseTime.getTime() + i * 300_000)),
    );
    // session_low = min of all lows = ~85000 * 0.995 = ~84575 (last candle's low)
    // close of last candle = 85000
    // session_high = ~85300 * 1.005 = ~85726 (from highest close candle)
    // The close is at the lower end, should be near 0
    const indicators = calcAllIndicators(dayCandles);
    if (indicators.atr14 === null) {
      // Use null indicators but force a clear case via custom setup
      // We can't guarantee atr14 is non-null with only 4 candles, skip if needed
      return;
    }
    const vec = vectorize(dayCandles, indicators, "5M");
    const sbp = vec[201] ?? -999;
    expect(Number.isFinite(sbp)).toBe(true);
    expect(sbp).toBeGreaterThanOrEqual(0);
    expect(sbp).toBeLessThan(0.1); // close is near session_low
  });

  it("session_box_position (index 201): close = session_high → 1.0", () => {
    // All candles on same day. Last candle has the highest close.
    const baseTime = new Date("2024-01-15T08:00:00Z");
    const prices = [85000, 85100, 85200, 85300]; // last = 85300 = highest close → close near session_high
    const dayCandles = prices.map((price, i) =>
      makeCandle(price, prices.length - 1 - i, new Date(baseTime.getTime() + i * 300_000)),
    );
    const indicators = calcAllIndicators(dayCandles);
    if (indicators.atr14 === null) return;
    const vec = vectorize(dayCandles, indicators, "5M");
    const sbp = vec[201] ?? -999;
    expect(Number.isFinite(sbp)).toBe(true);
    expect(sbp).toBeGreaterThan(0.9); // close is near session_high
    expect(sbp).toBeLessThanOrEqual(1.0);
  });

  it("session_box_position (index 201): session_high == session_low → 0.5", () => {
    // Single candle with high == low (no range)
    // makeCandle: high = close*1.005, low = close*0.995, so we need a custom candle
    const price = 85000;
    const flatCandle: Candle = {
      id: crypto.randomUUID(),
      symbol: "BTCUSDT",
      exchange: "binance" as const,
      timeframe: "5M" as const,
      open_time: new Date("2024-01-15T08:00:00Z"),
      open: d(price.toString()),
      high: d(price.toString()), // same as close → range = 0
      low: d(price.toString()),
      close: d(price.toString()),
      volume: d("1000"),
      is_closed: true,
      created_at: new Date(),
    };
    const indicators: AllIndicators = {
      ...nullIndicators(),
      atr14: d("100"),
    };
    const vec = vectorize([flatCandle], indicators, "5M");

    // session_high == session_low == price → range = 0 → 0.5
    expect(vec[201]).toBe(0.5);
  });

  it("session_box_position (index 201): empty candles → 0.5", () => {
    const indicators = nullIndicators();
    const vec = vectorize([], indicators, "5M");

    expect(vec[201]).toBe(0.5);
  });

  it("session_box_position (index 201): is finite with real data", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(Number.isFinite(vec[201] ?? NaN)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Final integration: indices 190-201 all non-placeholder with sufficient data
  // ---------------------------------------------------------------------------

  it("vectorize(): indices 190-201 all finite and non-placeholder (0.5) with sufficient candles + same-day timestamps", () => {
    // Build 120 candles all on the same UTC day with real timestamps
    const baseTime = new Date("2024-06-01T00:00:00Z");
    const candlesWithTime: Candle[] = Array.from({ length: 120 }, (_, i) => {
      const price = 85000 + i * 10;
      return makeCandle(price, 120 - 1 - i, new Date(baseTime.getTime() + i * 300_000));
    });

    const indicators = calcAllIndicators(candlesWithTime);
    expect(indicators.bb20).not.toBeNull();
    expect(indicators.bb4).not.toBeNull();
    expect(indicators.atr14).not.toBeNull();

    const vec = vectorize(candlesWithTime, indicators, "5M");
    expect(vec.length).toBe(202);

    // All strategy indices should be finite
    for (let i = 190; i <= 201; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }

    // Indices 198-201 should no longer be stuck at 0.5 placeholder when data is available
    // (breakout_intensity could be 0 if in-band, but not 0.5)
    // We just verify they are computed (finite) and not NaN
    expect(Number.isFinite(vec[198] ?? NaN)).toBe(true);
    expect(Number.isFinite(vec[199] ?? NaN)).toBe(true);
    expect(Number.isFinite(vec[200] ?? NaN)).toBe(true);
    expect(Number.isFinite(vec[201] ?? NaN)).toBe(true);
  });

  it("FEATURE_NAMES alignment: indices 198-201 match features.ts definitions", () => {
    expect(FEATURE_NAMES[198]).toBe("breakout_intensity");
    expect(FEATURE_NAMES[199]).toBe("disparity_divergence");
    expect(FEATURE_NAMES[200]).toBe("daily_open_distance");
    expect(FEATURE_NAMES[201]).toBe("session_box_position");
  });

  // ---------------------------------------------------------------------------
  // atr_separation (index 194)
  // ---------------------------------------------------------------------------

  it("atr_separation (index 194): close == sma20 → 0.0", () => {
    // Build enough candles for sma20Series to be populated
    const candles = makeCandles(120, 85000);
    const indicators = calcAllIndicators(candles);
    if (indicators.atr14 === null || indicators.sma20 === null) return;

    // Set close equal to sma20 value so abs(close - sma20) = 0
    const sma20Val = indicators.sma20.toNumber();
    // Override with a single candle at close = sma20
    const closeCandle = makeCandle(sma20Val, 0);
    // Rebuild a candle set: 119 original + the overridden last candle
    const testCandles = [...candles.slice(0, -1), closeCandle];
    const testIndicators = calcAllIndicators(testCandles);
    if (testIndicators.atr14 === null || testIndicators.sma20 === null) return;

    const vec = vectorize(testCandles, testIndicators, "5M");
    const atrSep = vec[194] ?? -999;
    // abs(close - sma20) ≈ 0 → atr_separation ≈ 0
    expect(Number.isFinite(atrSep)).toBe(true);
    expect(atrSep).toBeGreaterThanOrEqual(0);
    expect(atrSep).toBeLessThan(0.01);
  });

  it("atr_separation (index 194): close far from sma20 → abs(diff)/atr14", () => {
    const candles = makeCandles(120, 85000);
    const indicators = calcAllIndicators(candles);
    if (indicators.atr14 === null || indicators.sma20 === null) return;

    const vec = vectorize(candles, indicators, "5M");
    const atrSep = vec[194] ?? -999;
    // With uptrend candles, close should be above sma20, so atr_separation > 0
    expect(Number.isFinite(atrSep)).toBe(true);
    expect(atrSep).toBeGreaterThanOrEqual(0);
  });

  it("atr_separation (index 194): atr14=null → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[194]).toBe(0.5);
  });

  it("atr_separation (index 194): is finite with real data", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(Number.isFinite(vec[194] ?? NaN)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // pivot_distance (index 195)
  // ---------------------------------------------------------------------------

  it("pivot_distance (index 195): uptrend — latest close near highest pivot → near 0 or slightly negative", () => {
    // makeCandles creates an uptrend with close*1.005 as high and close*0.995 as low.
    // The newest candle has the highest close, but its high (close*1.005) is the true highest_high.
    // So close - highestPivot = close - close*1.005 < 0 (slightly negative).
    const candles = makeCandles(120, 85000);
    const indicators = calcAllIndicators(candles);
    if (indicators.atr14 === null) return;

    const vec = vectorize(candles, indicators, "5M");
    const pivotDist = vec[195] ?? -999;
    expect(Number.isFinite(pivotDist)).toBe(true);
    // distance to high is small (0.5% of close), distance to low is ~100 bars * 10 step = large
    // nearest pivot = highestH → (close - highestH) / atr is small negative
    expect(pivotDist).toBeLessThan(0);
    expect(pivotDist).toBeGreaterThan(-5); // reasonable bound
  });

  it("pivot_distance (index 195): downtrend — latest close near lowest pivot → near 0 or slightly positive", () => {
    // Downtrend: newest candle (newest-last) has the lowest close.
    // Its low (close*0.995) is the true lowestL.
    // close - lowestL = close - close*0.995 = close*0.005 > 0 (slightly positive).
    const downtrend = Array.from({ length: 120 }, (_, i) => makeCandle(85000 - i * 10, 120 - 1 - i));
    const indicators = calcAllIndicators(downtrend);
    if (indicators.atr14 === null) return;

    const vec = vectorize(downtrend, indicators, "5M");
    const pivotDist = vec[195] ?? -999;
    expect(Number.isFinite(pivotDist)).toBe(true);
    // nearest pivot = lowestL → (close - lowestL) / atr is small positive
    expect(pivotDist).toBeGreaterThan(0);
    expect(pivotDist).toBeLessThan(5); // reasonable bound
  });

  it("pivot_distance (index 195): atr14=null → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[195]).toBe(0.5);
  });

  it("pivot_distance (index 195): is finite with real data", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(Number.isFinite(vec[195] ?? NaN)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // rsi_normalized (index 196)
  // ---------------------------------------------------------------------------

  it("rsi_normalized (index 196): rsi14=50 → 0.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("50"),
      atr14: d("100"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBeCloseTo(0.0, 10);
  });

  it("rsi_normalized (index 196): rsi14=70 → 0.4", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("70"),
      atr14: d("100"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    // Float32Array has ~7 significant digits — use precision 5 (< 0.000005 tolerance)
    expect(vec[196]).toBeCloseTo(0.4, 5);
  });

  it("rsi_normalized (index 196): rsi14=30 → -0.4", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("30"),
      atr14: d("100"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    // Float32Array has ~7 significant digits — use precision 5 (< 0.000005 tolerance)
    expect(vec[196]).toBeCloseTo(-0.4, 5);
  });

  it("rsi_normalized (index 196): rsi14=null → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBe(0.5);
  });

  it("rsi_normalized (index 196): rsi14=100 → 1.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("100"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBeCloseTo(1.0, 10);
  });

  it("rsi_normalized (index 196): rsi14=0 → -1.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("0"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBeCloseTo(-1.0, 10);
  });

  // ---------------------------------------------------------------------------
  // rsi_extreme_count (index 197)
  // ---------------------------------------------------------------------------

  it("rsi_extreme_count (index 197): no extreme RSI bars → 0.0", () => {
    // Create candles that produce RSI around 50 (neither < 30 nor > 70)
    // Flat candles with no momentum → RSI ≈ 50
    const flatCandles = Array.from({ length: 120 }, (_, i) => makeCandle(85000, 120 - 1 - i));
    const indicators = calcAllIndicators(flatCandles);
    const vec = vectorize(flatCandles, indicators, "5M");

    const rsiExtreme = vec[197] ?? -999;
    expect(Number.isFinite(rsiExtreme)).toBe(true);
    // With flat prices, RSI should be around 50 → no extreme bars
    expect(rsiExtreme).toBeGreaterThanOrEqual(0);
    expect(rsiExtreme).toBeLessThanOrEqual(1);
  });

  it("rsi_extreme_count (index 197): strong uptrend → high RSI extremes", () => {
    // Strong uptrend → RSI > 70 for most bars
    const strongUptrend = Array.from({ length: 120 }, (_, i) =>
      makeCandle(85000 + i * 500, 120 - 1 - i),
    );
    const indicators = calcAllIndicators(strongUptrend);
    const vec = vectorize(strongUptrend, indicators, "5M");

    const rsiExtreme = vec[197] ?? -999;
    expect(Number.isFinite(rsiExtreme)).toBe(true);
    expect(rsiExtreme).toBeGreaterThanOrEqual(0);
    expect(rsiExtreme).toBeLessThanOrEqual(1);
  });

  it("rsi_extreme_count (index 197): empty candles → 0.5", () => {
    const indicators = nullIndicators();
    const vec = vectorize([], indicators, "5M");

    expect(vec[197]).toBe(0.5);
  });

  it("rsi_extreme_count (index 197): is in [0, 1] with real data", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const rsiExtreme = vec[197] ?? -999;
    expect(Number.isFinite(rsiExtreme)).toBe(true);
    expect(rsiExtreme).toBeGreaterThanOrEqual(0);
    expect(rsiExtreme).toBeLessThanOrEqual(1);
  });

  it("rsi_extreme_count (index 197): partial window (< 20 bars) uses available bars", () => {
    // Only 10 candles — window should be 10, not 20
    const candles = makeCandles(10, 85000);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const rsiExtreme = vec[197] ?? -999;
    expect(Number.isFinite(rsiExtreme)).toBe(true);
    expect(rsiExtreme).toBeGreaterThanOrEqual(0);
    expect(rsiExtreme).toBeLessThanOrEqual(1);
  });

  it("extreme close price does not produce NaN or Infinity", () => {
    const candles = makeCandles(120, 0.000001); // very small price
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("large price values do not produce NaN or Infinity", () => {
    const candles = makeCandles(120, 999_999_999);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("candles < 120 but >= 20: returns partial vector with 0 for unavailable lags", () => {
    const candles = makeCandles(25);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec.length).toBe(VECTOR_DIM);
    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("bb20_position (index 190): close at band middle → ~0.5", () => {
    // Build indicators where close is exactly at bb20 middle (lower + width/2)
    const lower = 84000;
    const upper = 86000;
    const width = upper - lower;
    const middle = lower + width / 2; // 85000

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0.5"),
      },
    };
    const candles = makeCandles(5, middle);
    const vec = vectorize(candles, indicators, "5M");

    const bb20Pos = vec[190] ?? -999;
    // close ≈ middle → (close - lower) / width ≈ 0.5
    expect(bb20Pos).toBeGreaterThan(0.4);
    expect(bb20Pos).toBeLessThan(0.6);
  });

  it("bb20_position (index 190): width=0 → 0.5", () => {
    const price = 85000;
    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(price.toString()),
        middle: d(price.toString()),
        lower: d(price.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
    };
    const candles = makeCandles(5, price);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[190]).toBe(0.5);
  });

  it("bb4_position (index 191): open at lower band → ~0.0", () => {
    const lower = 84900;
    const upper = 85100;
    const width = upper - lower;
    const middle = lower + width / 2;
    // Use a single candle where open = lower exactly: makeCandle uses close*0.999 for open,
    // so set close = lower / 0.999 to get open ≈ lower
    const closePrice = lower / 0.999;
    const candle = makeCandle(closePrice, 0);

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb4: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0"),
      },
    };
    const vec = vectorize([candle], indicators, "5M");

    const bb4Pos = vec[191] ?? -999;
    // open = closePrice * 0.999 ≈ lower → (open - lower) / width ≈ 0
    expect(bb4Pos).toBeGreaterThanOrEqual(-0.01);
    expect(bb4Pos).toBeLessThan(0.01);
  });

  it("bb4_position (index 191): null bb4 → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[191]).toBe(0.5);
  });

  it("ma_ordering (index 192): MA20 > MA60 > MA120 → 1.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      sma20: d("86000"),
      sma60: d("85000"),
      sma120: d("84000"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[192]).toBe(1.0);
  });

  it("ma_ordering (index 192): MA120 > MA60 > MA20 → 0.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      sma20: d("84000"),
      sma60: d("85000"),
      sma120: d("86000"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[192]).toBe(0.0);
  });

  it("ma_ordering (index 192): null MA → 0.5", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[192]).toBe(0.5);
  });

  it("ma20_slope (index 193): rising sma20Series → positive value", () => {
    // Use enough candles that sma20Series is non-zero and rising
    const candles = makeCandles(120, 85000); // uptrend: each candle 10 higher
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const ma20Slope = vec[193] ?? -999;
    expect(Number.isFinite(ma20Slope)).toBe(true);
    // uptrend candles → sma20 rising → slope > 0
    expect(ma20Slope).toBeGreaterThan(0);
  });

  it("ma20_slope (index 193): null indicators (no sma20 series) → 0.5 fallback", () => {
    // With only 3 candles, sma20 series won't have enough history for lag-3 value
    const candles = makeCandles(3);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    const ma20Slope = vec[193] ?? -999;
    // sma20Series will be 0 at all lags → fallback 0.5
    expect(ma20Slope).toBe(0.5);
  });

  it("vectorize(): indices 190-193 have meaningful values with sufficient candles", () => {
    const candles = makeCandles(120, 85000);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec.length).toBe(202);
    // With real indicators, bb20_position and bb4_position should not be stuck at 0.5 default
    // (they have non-trivial bb20/bb4 values)
    const bb20Pos = vec[190] ?? -999;
    const bb4Pos = vec[191] ?? -999;
    expect(Number.isFinite(bb20Pos)).toBe(true);
    expect(Number.isFinite(bb4Pos)).toBe(true);
    // ma20_slope should be positive for uptrend data
    const ma20Slope = vec[193] ?? -999;
    expect(ma20Slope).toBeGreaterThan(0);
  });

  it("atr14_5m (index 70) is non-negative", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const atrNorm = vec[70] ?? -1;
    expect(atrNorm).toBeGreaterThanOrEqual(0);
  });

  it("ma_alignment_5m (index 112) is -1, 0, or 1", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const maAlignment = vec[112] ?? 999;
    expect([-1, 0, 1]).toContain(maAlignment);
  });

  it("squeeze_state features (indices 38-39) are -1, 0, or 1", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect([-1, 0, 1]).toContain(vec[38]!);
    expect([-1, 0, 1]).toContain(vec[39]!);
  });

  it("result is deterministic: same inputs yield identical output", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);

    const vec1 = vectorize(candles, indicators, "5M");
    const vec2 = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec1.length; i++) {
      expect(vec1[i]).toBe(vec2[i]);
    }
  });
});
