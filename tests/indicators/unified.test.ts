import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import {
  calcAllIndicators,
  calcATR,
  calcBB20,
  calcBB4,
  calcEMA,
  calcRSI,
  calcSMA,
  detectSqueeze,
} from "../../src/indicators/index";
import type { AllIndicators, BollingerResult, SqueezeState } from "../../src/indicators/index";

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

function makeCandles(count: number, baseClose = 85000): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(baseClose + i * 10, i));
}

// ---------------------------------------------------------------------------
// indicators/unified
// ---------------------------------------------------------------------------

describe("indicators/unified", () => {
  it("imports: all types are importable from @/indicators index", () => {
    // Type-level check — if this compiles the test passes.
    const _indicators: AllIndicators = {
      bb20: null,
      bb4: null,
      bb4_1h: null,
      sma20: null,
      sma20_5m: null,
      sma20History: [],
      sma60: null,
      sma120: null,
      ema20: null,
      ema60: null,
      ema120: null,
      rsi14: null,
      rsiHistory: [],
      atr14: null,
      prevSma20: null,
      squeeze: "normal",
      bandwidthHistory: [],
    };
    const _bollingerResult: BollingerResult | null = null;
    const _squeezeState: SqueezeState = "normal";
    void _indicators;
    void _bollingerResult;
    void _squeezeState;
    expect(typeof calcAllIndicators).toBe("function");
    expect(typeof calcBB20).toBe("function");
    expect(typeof calcBB4).toBe("function");
    expect(typeof calcSMA).toBe("function");
    expect(typeof calcEMA).toBe("function");
    expect(typeof calcRSI).toBe("function");
    expect(typeof calcATR).toBe("function");
    expect(typeof detectSqueeze).toBe("function");
  });

  it("120+ candles: all fields are non-null except squeeze which is SqueezeState", () => {
    const candles = makeCandles(120);
    const result = calcAllIndicators(candles);

    expect(result.bb20).not.toBeNull();
    expect(result.bb4).not.toBeNull();
    expect(result.sma20).not.toBeNull();
    expect(result.sma60).not.toBeNull();
    expect(result.sma120).not.toBeNull();
    expect(result.ema20).not.toBeNull();
    expect(result.ema60).not.toBeNull();
    expect(result.ema120).not.toBeNull();
    expect(result.rsi14).not.toBeNull();
    expect(result.atr14).not.toBeNull();
    expect(["squeeze", "expansion", "normal"]).toContain(result.squeeze);
  });

  it("5 candles: bb20 null, bb4 non-null, sma60/sma120/ema60/ema120 null", () => {
    const candles = makeCandles(5);
    const result = calcAllIndicators(candles);

    // BB20 requires 20 candles — should be null
    expect(result.bb20).toBeNull();
    // BB4 requires 4 candles — should be non-null
    expect(result.bb4).not.toBeNull();
    // MA60/120 require more data — should be null
    expect(result.sma60).toBeNull();
    expect(result.sma120).toBeNull();
    expect(result.ema60).toBeNull();
    expect(result.ema120).toBeNull();
    // squeeze is always a SqueezeState
    expect(["squeeze", "expansion", "normal"]).toContain(result.squeeze);
  });

  it("empty array: all nullable fields null, squeeze is 'normal'", () => {
    const result = calcAllIndicators([]);

    expect(result.bb20).toBeNull();
    expect(result.bb4).toBeNull();
    expect(result.sma20).toBeNull();
    expect(result.sma60).toBeNull();
    expect(result.sma120).toBeNull();
    expect(result.ema20).toBeNull();
    expect(result.ema60).toBeNull();
    expect(result.ema120).toBeNull();
    expect(result.rsi14).toBeNull();
    expect(result.atr14).toBeNull();
    expect(result.squeeze).toBe("normal");
  });

  it("results match individual function calls", () => {
    const candles = makeCandles(120);
    const closes = candles.map((c) => c.close.toNumber());
    const highs = candles.map((c) => c.high.toNumber());
    const lows = candles.map((c) => c.low.toNumber());

    const result = calcAllIndicators(candles);

    // BB
    const expectedBB20 = calcBB20(candles);
    const expectedBB4 = calcBB4(candles);
    expect(result.bb20?.upper.toString()).toBe(expectedBB20?.upper.toString());
    expect(result.bb4?.lower.toString()).toBe(expectedBB4?.lower.toString());

    // MAs
    const expectedSMA20 = calcSMA(closes, 20);
    const expectedEMA60 = calcEMA(closes, 60);
    expect(result.sma20?.toString()).toBe(expectedSMA20?.toString());
    expect(result.ema60?.toString()).toBe(expectedEMA60?.toString());

    // RSI
    const expectedRSI = calcRSI(closes);
    expect(result.rsi14?.toString()).toBe(expectedRSI?.toString());

    // ATR
    const expectedATR = calcATR(highs, lows, closes);
    expect(result.atr14?.toString()).toBe(expectedATR?.toString());
  });

  it("with exactly 20 candles: bb20 non-null, sma20 non-null, sma60/120 null", () => {
    const candles = makeCandles(20);
    const result = calcAllIndicators(candles);

    expect(result.bb20).not.toBeNull();
    expect(result.sma20).not.toBeNull();
    expect(result.sma60).toBeNull();
    expect(result.sma120).toBeNull();
  });

  it("AllIndicators shape has all expected keys", () => {
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
  });
});
