/**
 * Tests for T-19-002: ma20_slope 3봉 기울기, rsi_extreme_count 14봉 히스토리, BB width=0 0.5
 */

import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import type { Candle } from "@/core/types";
import type { AllIndicators } from "@/indicators/types";
import { extractStrategyFeatures } from "./strategy-features";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(close: number): Candle {
  return {
    id: "test",
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date(),
    open: new Decimal(close),
    high: new Decimal(close + 10),
    low: new Decimal(close - 10),
    close: new Decimal(close),
    volume: new Decimal(100),
    is_closed: true,
    created_at: new Date(),
  };
}

function makeIndicators(overrides: Partial<AllIndicators> = {}): AllIndicators {
  const base: AllIndicators = {
    bb20: null,
    bb4: null,
    bb4_1h: null,
    sma20: new Decimal(100),
    prevSma20: new Decimal(99),
    sma20_5m: null,
    sma20History: [],
    sma60: null,
    sma120: null,
    ema20: null,
    ema60: null,
    ema120: null,
    rsi14: new Decimal(50),
    rsiHistory: [],
    atr14: null,
    squeeze: "normal",
    bandwidthHistory: [],
  };
  return { ...base, ...overrides };
}

function makeBb20(lower: number, upper: number, close: number) {
  const lowerD = new Decimal(lower);
  const upperD = new Decimal(upper);
  const middleD = lowerD.plus(upperD).dividedBy(2);
  const bandwidth = upper === lower ? new Decimal(0) : upperD.minus(lowerD).dividedBy(middleD);
  const percentB =
    upper === lower
      ? new Decimal(0.5)
      : new Decimal(close).minus(lowerD).dividedBy(upperD.minus(lowerD));
  return { upper: upperD, middle: middleD, lower: lowerD, bandwidth, percentB };
}

// ---------------------------------------------------------------------------
// [3] ma20_slope — 3봉 기울기 (PRD §7.8 L276)
// ---------------------------------------------------------------------------

describe("extractStrategyFeatures — [3] ma20_slope", () => {
  it("sma20History=[100,101,102,103] → slope = (103-100)/100 = 0.03", () => {
    const indicators = makeIndicators({
      sma20: new Decimal(103),
      prevSma20: new Decimal(102),
      sma20History: [new Decimal(100), new Decimal(101), new Decimal(102), new Decimal(103)],
    });
    const result = extractStrategyFeatures(makeCandle(103), [], indicators);
    expect(result[3]).toBeCloseTo(0.03, 10);
  });

  it("sma20History.length < 4 → falls back to prevSma20 (1-bar slope)", () => {
    // sma20=103, prevSma20=100 → slope = (103-100)/100 = 0.03
    const indicators = makeIndicators({
      sma20: new Decimal(103),
      prevSma20: new Decimal(100),
      sma20History: [new Decimal(102), new Decimal(103)], // only 2 elements
    });
    const result = extractStrategyFeatures(makeCandle(103), [], indicators);
    expect(result[3]).toBeCloseTo(0.03, 10);
  });

  it("sma20History[0] = 0 → output[3] = 0.0 (denominator guard)", () => {
    const indicators = makeIndicators({
      sma20: new Decimal(103),
      prevSma20: new Decimal(100),
      sma20History: [new Decimal(0), new Decimal(101), new Decimal(102), new Decimal(103)],
    });
    const result = extractStrategyFeatures(makeCandle(103), [], indicators);
    expect(result[3]).toBe(0.0);
  });

  it("sma20History=[] and prevSma20 available → falls back to prevSma20", () => {
    // sma20=110, prevSma20=100 → slope = 0.1
    const indicators = makeIndicators({
      sma20: new Decimal(110),
      prevSma20: new Decimal(100),
      sma20History: [],
    });
    const result = extractStrategyFeatures(makeCandle(110), [], indicators);
    expect(result[3]).toBeCloseTo(0.1, 10);
  });
});

// ---------------------------------------------------------------------------
// [7] rsi_extreme_count — 14봉 히스토리 카운트 (PRD §7.8 D-002)
// ---------------------------------------------------------------------------

describe("extractStrategyFeatures — [7] rsi_extreme_count", () => {
  it("rsiHistory with 5 extremes out of 14 → output[7] = 5/14", () => {
    // 80>70 ✓, 25<30 ✓, 70.1>70 ✓, 28<30 ✓, 72>70 ✓ — rest are in normal range
    // Exact scenario from task (recount: 5 extremes, not 4 as task comment states)
    const rsiHistory = [80, 25, 50, 55, 70.1, 45, 60, 35, 50, 65, 28, 55, 72, 40];
    const indicators = makeIndicators({
      rsi14: new Decimal(40),
      rsiHistory,
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[7]).toBeCloseTo(5 / 14, 10);
  });

  it("rsiHistory=[] → output[7] = 0.0", () => {
    const indicators = makeIndicators({
      rsi14: new Decimal(50),
      rsiHistory: [],
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[7]).toBe(0.0);
  });

  it("rsiHistory=[50,55,60] with no extremes → output[7] = 0.0", () => {
    const indicators = makeIndicators({
      rsi14: new Decimal(60),
      rsiHistory: [50, 55, 60],
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[7]).toBe(0.0);
  });

  it("rsiHistory with 3 explicit extremes out of 14 → 3/14", () => {
    // 3 extremes: 75, 20, 80 — rest are in normal range
    const rsiHistory = [75, 20, 50, 55, 65, 45, 60, 55, 50, 65, 55, 55, 80, 40];
    // 75>70 ✓, 20<30 ✓, 80>70 ✓ = 3 extremes / 14
    const indicators = makeIndicators({
      rsi14: new Decimal(40),
      rsiHistory,
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[7]).toBeCloseTo(3 / 14, 10);
  });

  it("rsiHistory with all extremes → output[7] = 1.0", () => {
    const rsiHistory = [80, 20, 85, 15, 90, 10, 71, 29, 80, 20, 85, 15, 90, 10];
    const indicators = makeIndicators({
      rsi14: new Decimal(10),
      rsiHistory,
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[7]).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// [8] breakout_intensity — BB width=0 → 0.5 (PRD §7.8 D-003)
// ---------------------------------------------------------------------------

describe("extractStrategyFeatures — [8] breakout_intensity", () => {
  it("BB width=0 (upper=lower) → output[8] = 0.5", () => {
    const indicators = makeIndicators({
      bb20: makeBb20(100, 100, 100),
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[8]).toBe(0.5);
  });

  it("close inside BB band (width>0) → output[8] = 0.0", () => {
    // close=100, lower=90, upper=110 → inside band
    const indicators = makeIndicators({
      bb20: makeBb20(90, 110, 100),
    });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[8]).toBe(0.0);
  });

  it("close above BB upper (width>0) → output[8] > 0.0", () => {
    // close=120, lower=90, upper=110 → above upper
    const indicators = makeIndicators({
      bb20: makeBb20(90, 110, 120),
    });
    const result = extractStrategyFeatures(makeCandle(120), [], indicators);
    expect(result[8]).toBeGreaterThan(0.0);
    // intensity = (120-110) / (110-90) = 10/20 = 0.5
    expect(result[8]).toBeCloseTo(0.5, 10);
  });

  it("close below BB lower (width>0) → output[8] > 0.0", () => {
    // close=80, lower=90, upper=110 → below lower
    const indicators = makeIndicators({
      bb20: makeBb20(90, 110, 80),
    });
    const result = extractStrategyFeatures(makeCandle(80), [], indicators);
    expect(result[8]).toBeGreaterThan(0.0);
    // intensity = (90-80) / (110-90) = 10/20 = 0.5
    expect(result[8]).toBeCloseTo(0.5, 10);
  });

  it("bb20=null → output[8] = 0.0 (null guard)", () => {
    const indicators = makeIndicators({ bb20: null });
    const result = extractStrategyFeatures(makeCandle(100), [], indicators);
    expect(result[8]).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Output array length
// ---------------------------------------------------------------------------

describe("extractStrategyFeatures — output shape", () => {
  it("returns array of length 12", () => {
    const result = extractStrategyFeatures(makeCandle(100), [], makeIndicators());
    expect(result.length).toBe(12);
  });
});
