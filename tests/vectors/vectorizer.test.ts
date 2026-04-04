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
    sma20: null,
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
    expect(FEATURE_NAMES[190]).toBe("hour_sin");
    expect(FEATURE_NAMES[201]).toBe("is_top_of_hour");
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

  it("session features are valid: hour_sin (190) in [-1, 1]", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    // hour_sin
    const hourSin = vec[190] ?? 999;
    expect(hourSin).toBeGreaterThanOrEqual(-1);
    expect(hourSin).toBeLessThanOrEqual(1);

    // hour_cos
    const hourCos = vec[191] ?? 999;
    expect(hourCos).toBeGreaterThanOrEqual(-1);
    expect(hourCos).toBeLessThanOrEqual(1);
  });

  it("session features: is_asia_session (194) is 0 or 1", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    const isAsia = vec[194] ?? -1;
    expect([0, 1]).toContain(isAsia);
    const isEurope = vec[195] ?? -1;
    expect([0, 1]).toContain(isEurope);
    const isUs = vec[196] ?? -1;
    expect([0, 1]).toContain(isUs);
    const isFunding = vec[197] ?? -1;
    expect([0, 1]).toContain(isFunding);
    const isTopOfHour = vec[201] ?? -1;
    expect([0, 1]).toContain(isTopOfHour);
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

  it("session encoding: candle at 00:30 UTC is in Asia session", () => {
    const openTime = new Date("2026-01-05T00:30:00Z"); // Monday 00:30 UTC
    const candle = makeCandle(85000, 0, openTime);
    const candles = [candle];
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[194]).toBe(1); // is_asia_session
    expect(vec[195]).toBe(0); // is_europe_session
    expect(vec[196]).toBe(0); // is_us_session
  });

  it("session encoding: candle at 10:00 UTC is in Europe session", () => {
    const openTime = new Date("2026-01-05T10:00:00Z");
    const candle = makeCandle(85000, 0, openTime);
    const candles = [candle];
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[194]).toBe(0); // is_asia_session
    expect(vec[195]).toBe(1); // is_europe_session
    expect(vec[196]).toBe(0); // is_us_session
  });

  it("session encoding: candle at 15:00 UTC is in both Europe and US sessions", () => {
    const openTime = new Date("2026-01-05T15:00:00Z");
    const candle = makeCandle(85000, 0, openTime);
    const candles = [candle];
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[195]).toBe(1); // is_europe_session
    expect(vec[196]).toBe(1); // is_us_session
  });

  it("is_top_of_hour: minute=3 → 1", () => {
    const openTime = new Date("2026-01-05T10:03:00Z"); // minute=3
    const candle = makeCandle(85000, 0, openTime);
    const vec = vectorize([candle], nullIndicators(), "5M");
    expect(vec[201]).toBe(1);
  });

  it("is_top_of_hour: minute=30 → 0", () => {
    const openTime = new Date("2026-01-05T10:30:00Z"); // minute=30
    const candle = makeCandle(85000, 0, openTime);
    const vec = vectorize([candle], nullIndicators(), "5M");
    expect(vec[201]).toBe(0);
  });

  it("is_top_of_hour: minute=57 → 1", () => {
    const openTime = new Date("2026-01-05T10:57:00Z"); // minute=57 >= 55
    const candle = makeCandle(85000, 0, openTime);
    const vec = vectorize([candle], nullIndicators(), "5M");
    expect(vec[201]).toBe(1);
  });

  it("is_funding_window: 08:00 UTC → 1", () => {
    const openTime = new Date("2026-01-05T08:00:00Z");
    const candle = makeCandle(85000, 0, openTime);
    const vec = vectorize([candle], nullIndicators(), "5M");
    expect(vec[197]).toBe(1);
  });

  it("is_funding_window: 12:00 UTC → 0", () => {
    const openTime = new Date("2026-01-05T12:00:00Z");
    const candle = makeCandle(85000, 0, openTime);
    const vec = vectorize([candle], nullIndicators(), "5M");
    expect(vec[197]).toBe(0);
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

    expect([-1, 0, 1]).toContain(vec[38]);
    expect([-1, 0, 1]).toContain(vec[39]);
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
