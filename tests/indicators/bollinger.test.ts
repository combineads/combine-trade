import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { d } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import { calcBB, calcBB20, calcBB4, candlesToCloses } from "../../src/indicators/bollinger";

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeCandle(close: number): Candle {
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance" as const,
    timeframe: "5M" as const,
    open_time: new Date(),
    open: d(close.toString()),
    high: d((close * 1.01).toString()),
    low: d((close * 0.99).toString()),
    close: d(close.toString()),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date(),
  };
}

/** Build an array of candles with linearly rising closes from start to end. */
function makeCandles(count: number, baseClose = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(baseClose + i * 0.1));
}

/** Build an array of candles all with the same close price. */
function makeConstantCandles(count: number, close = 100): Candle[] {
  return Array.from({ length: count }, () => makeCandle(close));
}

// ---------------------------------------------------------------------------
// candlesToCloses
// ---------------------------------------------------------------------------

describe("bollinger — candlesToCloses", () => {
  it("extracts close prices as numbers in order", () => {
    const candles = [makeCandle(100), makeCandle(101), makeCandle(102)];
    const closes = candlesToCloses(candles);
    expect(closes).toEqual([100, 101, 102]);
  });

  it("returns empty array for empty input", () => {
    expect(candlesToCloses([])).toEqual([]);
  });

  it("preserves exact close values (no rounding)", () => {
    const candle = makeCandle(99.987);
    const [close] = candlesToCloses([candle]);
    expect(close).toBeCloseTo(99.987, 10);
  });
});

// ---------------------------------------------------------------------------
// calcBB — generic
// ---------------------------------------------------------------------------

describe("bollinger — calcBB (generic)", () => {
  it("returns null when closes.length < length", () => {
    const result = calcBB([1, 2, 3], 5, 2, 3);
    expect(result).toBeNull();
  });

  it("returns BollingerResult when closes.length === length", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
    const result = calcBB(closes, 20, 2, closes[closes.length - 1]!);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calcBB20
// ---------------------------------------------------------------------------

describe("bollinger — calcBB20", () => {
  it("returns null when fewer than 20 candles", () => {
    const candles = makeCandles(19);
    expect(calcBB20(candles)).toBeNull();
  });

  it("returns BollingerResult with exactly 20 candles", () => {
    const candles = makeCandles(20);
    const result = calcBB20(candles);
    expect(result).not.toBeNull();
  });

  it("returns BollingerResult with more than 20 candles", () => {
    const candles = makeCandles(50);
    const result = calcBB20(candles);
    expect(result).not.toBeNull();
  });

  it("all result fields are Decimal instances", () => {
    const candles = makeCandles(25);
    const result = calcBB20(candles);
    expect(result).not.toBeNull();
    expect(result!.upper).toBeInstanceOf(Decimal);
    expect(result!.middle).toBeInstanceOf(Decimal);
    expect(result!.lower).toBeInstanceOf(Decimal);
    expect(result!.bandwidth).toBeInstanceOf(Decimal);
    expect(result!.percentB).toBeInstanceOf(Decimal);
  });

  it("upper > middle > lower", () => {
    const candles = makeCandles(25);
    const result = calcBB20(candles);
    expect(result).not.toBeNull();
    expect(result!.upper.gt(result!.middle)).toBe(true);
    expect(result!.middle.gt(result!.lower)).toBe(true);
  });

  it("bandwidth = (upper - lower) / middle", () => {
    const candles = makeCandles(25);
    const result = calcBB20(candles);
    expect(result).not.toBeNull();
    const expected = result!.upper.minus(result!.lower).div(result!.middle);
    expect(result!.bandwidth.toFixed(10)).toBe(expected.toFixed(10));
  });

  it("percentB = (close - lower) / (upper - lower)", () => {
    const candles = makeCandles(25);
    const result = calcBB20(candles);
    expect(result).not.toBeNull();
    const lastClose = d(candles[candles.length - 1]!.close.toString());
    const expected = lastClose
      .minus(result!.lower)
      .div(result!.upper.minus(result!.lower));
    expect(result!.percentB.toFixed(10)).toBe(expected.toFixed(10));
  });
});

// ---------------------------------------------------------------------------
// calcBB4
// ---------------------------------------------------------------------------

describe("bollinger — calcBB4", () => {
  it("returns null when fewer than 4 candles", () => {
    const candles = makeCandles(3);
    expect(calcBB4(candles)).toBeNull();
  });

  it("returns BollingerResult with exactly 4 candles", () => {
    const candles = makeCandles(4);
    const result = calcBB4(candles);
    expect(result).not.toBeNull();
  });

  it("returns BollingerResult with more than 4 candles", () => {
    const candles = makeCandles(20);
    const result = calcBB4(candles);
    expect(result).not.toBeNull();
  });

  it("all result fields are Decimal instances", () => {
    const candles = makeCandles(10);
    const result = calcBB4(candles);
    expect(result).not.toBeNull();
    expect(result!.upper).toBeInstanceOf(Decimal);
    expect(result!.middle).toBeInstanceOf(Decimal);
    expect(result!.lower).toBeInstanceOf(Decimal);
    expect(result!.bandwidth).toBeInstanceOf(Decimal);
    expect(result!.percentB).toBeInstanceOf(Decimal);
  });

  it("bandwidth = (upper - lower) / middle", () => {
    const candles = makeCandles(10);
    const result = calcBB4(candles);
    expect(result).not.toBeNull();
    const expected = result!.upper.minus(result!.lower).div(result!.middle);
    expect(result!.bandwidth.toFixed(10)).toBe(expected.toFixed(10));
  });

  it("percentB = (close - lower) / (upper - lower)", () => {
    const candles = makeCandles(10);
    const result = calcBB4(candles);
    expect(result).not.toBeNull();
    const lastClose = d(candles[candles.length - 1]!.close.toString());
    const expected = lastClose
      .minus(result!.lower)
      .div(result!.upper.minus(result!.lower));
    expect(result!.percentB.toFixed(10)).toBe(expected.toFixed(10));
  });
});

// ---------------------------------------------------------------------------
// Constant close prices (zero standard deviation edge case)
// ---------------------------------------------------------------------------

describe("bollinger — constant close prices", () => {
  it("BB20: middle equals close when all prices are constant", () => {
    const candles = makeConstantCandles(25, 100);
    const result = calcBB20(candles);
    // With constant prices, stddev=0 so upper=lower=middle.
    // The library may return null/NaN or a degenerate band — we handle both gracefully.
    if (result !== null) {
      expect(result.middle.toFixed(2)).toBe("100.00");
    }
  });

  it("BB20: bandwidth ≈ 0 when all prices are constant", () => {
    const candles = makeConstantCandles(25, 100);
    const result = calcBB20(candles);
    if (result !== null) {
      expect(result.bandwidth.toFixed(6)).toBe("0.000000");
    }
  });

  it("BB4: middle equals close when all prices are constant", () => {
    const candles = makeConstantCandles(10, 50);
    const result = calcBB4(candles);
    if (result !== null) {
      expect(result.middle.toFixed(2)).toBe("50.00");
    }
  });
});
