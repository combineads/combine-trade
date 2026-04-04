/**
 * Integration test: verifies that all EP-02 indicator exports are accessible
 * via the @/indicators path alias and that types are importable.
 *
 * This file does not test behaviour — it tests wiring.
 * A compile error here means an export is missing or an alias is broken.
 */
import { describe, expect, it } from "bun:test";

import {
  ATR_DEFAULT_PERIOD,
  RSI_DEFAULT_PERIOD,
  calcATR,
  calcATRSeries,
  calcAllIndicators,
  calcBB,
  calcBB20,
  calcBB4,
  calcEMA,
  calcEMASeries,
  calcRSI,
  calcRSISeries,
  calcSMA,
  calcSMASeries,
  candlesToCloses,
  detectSqueeze,
} from "@/indicators";

import type { AllIndicators, BollingerResult, SqueezeState } from "@/indicators";

import { d } from "@/core/decimal";
import type { Candle } from "@/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(close: number, i: number): Candle {
  const high = close * 1.005;
  const low = close * 0.995;
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance" as const,
    timeframe: "5M" as const,
    open_time: new Date(Date.now() - i * 300_000),
    open: d(close.toString()),
    high: d(high.toFixed(2)),
    low: d(low.toFixed(2)),
    close: d(close.toString()),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date(),
  };
}

function makeCandles(count: number, baseClose = 50000): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    makeCandle(baseClose + i * 10, i),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration/indicators-imports — function exports", () => {
  it("all indicator functions are importable from @/indicators", () => {
    expect(typeof calcBB20).toBe("function");
    expect(typeof calcBB4).toBe("function");
    expect(typeof calcBB).toBe("function");
    expect(typeof candlesToCloses).toBe("function");
    expect(typeof calcSMA).toBe("function");
    expect(typeof calcSMASeries).toBe("function");
    expect(typeof calcEMA).toBe("function");
    expect(typeof calcEMASeries).toBe("function");
    expect(typeof calcRSI).toBe("function");
    expect(typeof calcRSISeries).toBe("function");
    expect(typeof calcATR).toBe("function");
    expect(typeof calcATRSeries).toBe("function");
    expect(typeof detectSqueeze).toBe("function");
    expect(typeof calcAllIndicators).toBe("function");
  });

  it("constant exports are importable from @/indicators", () => {
    expect(typeof RSI_DEFAULT_PERIOD).toBe("number");
    expect(typeof ATR_DEFAULT_PERIOD).toBe("number");
    expect(RSI_DEFAULT_PERIOD).toBe(14);
    expect(ATR_DEFAULT_PERIOD).toBe(14);
  });
});

describe("integration/indicators-imports — type exports", () => {
  it("BollingerResult type is usable", () => {
    const _result: BollingerResult | null = null;
    expect(_result).toBeNull();
  });

  it("SqueezeState type accepts all valid values", () => {
    const s1: SqueezeState = "squeeze";
    const s2: SqueezeState = "expansion";
    const s3: SqueezeState = "normal";
    expect(s1).toBe("squeeze");
    expect(s2).toBe("expansion");
    expect(s3).toBe("normal");
  });

  it("AllIndicators type has all expected fields", () => {
    const allNull: AllIndicators = {
      bb20: null,
      bb4: null,
      bb4_1h: null,
      sma20: null,
      sma60: null,
      sma120: null,
      ema20: null,
      ema60: null,
      ema120: null,
      rsi14: null,
      atr14: null,
      prevSma20: null,
      squeeze: "normal",
    };
    expect(allNull.squeeze).toBe("normal");
    expect(allNull.bb20).toBeNull();
  });
});

describe("integration/indicators-imports — callable functions", () => {
  it("calcBB20 and calcBB4 return non-null for sufficient candles", () => {
    const candles = makeCandles(20);
    const bb20 = calcBB20(candles);
    const bb4 = calcBB4(candles);
    expect(bb20).not.toBeNull();
    expect(bb4).not.toBeNull();
  });

  it("calcBB is callable with a custom period and stddev", () => {
    const candles = makeCandles(30);
    const closes = candlesToCloses(candles);
    const currentClose = closes[closes.length - 1] ?? 0;
    const result = calcBB(closes, 20, 2, currentClose);
    expect(result).not.toBeNull();
  });

  it("candlesToCloses returns a number array", () => {
    const candles = makeCandles(5);
    const closes = candlesToCloses(candles);
    expect(Array.isArray(closes)).toBe(true);
    expect(closes.length).toBe(5);
    expect(typeof closes[0]).toBe("number");
  });

  it("calcSMA and calcSMASeries are callable", () => {
    const closes = [1, 2, 3, 4, 5].map((n) => n * 10000);
    const sma = calcSMA(closes, 3);
    const series = calcSMASeries(closes, 3);
    expect(sma).not.toBeNull();
    expect(Array.isArray(series)).toBe(true);
  });

  it("calcEMA and calcEMASeries are callable", () => {
    const closes = [1, 2, 3, 4, 5].map((n) => n * 10000);
    const ema = calcEMA(closes, 3);
    const series = calcEMASeries(closes, 3);
    expect(ema).not.toBeNull();
    expect(Array.isArray(series)).toBe(true);
  });

  it("calcRSI and calcRSISeries are callable", () => {
    const candles = makeCandles(30);
    const closes = candlesToCloses(candles);
    const rsi = calcRSI(closes);
    const series = calcRSISeries(closes);
    expect(rsi).not.toBeNull();
    expect(Array.isArray(series)).toBe(true);
  });

  it("calcATR and calcATRSeries are callable", () => {
    const candles = makeCandles(30);
    const highs = candles.map((c) => c.high.toNumber());
    const lows = candles.map((c) => c.low.toNumber());
    const closes = candlesToCloses(candles);
    const atr = calcATR(highs, lows, closes);
    const series = calcATRSeries(highs, lows, closes);
    expect(atr).not.toBeNull();
    expect(Array.isArray(series)).toBe(true);
  });

  it("detectSqueeze is callable and returns a SqueezeState", () => {
    const state = detectSqueeze([d("0.01"), d("0.02"), d("0.015")]);
    expect(["squeeze", "expansion", "normal"]).toContain(state);
  });

  it("calcAllIndicators returns AllIndicators with all keys", () => {
    const candles = makeCandles(120);
    const result = calcAllIndicators(candles);
    const expectedKeys: (keyof AllIndicators)[] = [
      "bb20",
      "bb4",
      "sma20",
      "sma60",
      "sma120",
      "ema20",
      "ema60",
      "ema120",
      "rsi14",
      "atr14",
      "squeeze",
    ];
    for (const key of expectedKeys) {
      expect(key in result).toBe(true);
    }
    expect(result.bb20).not.toBeNull();
    expect(result.rsi14).not.toBeNull();
    expect(result.atr14).not.toBeNull();
    expect(["squeeze", "expansion", "normal"]).toContain(result.squeeze);
  });
});
