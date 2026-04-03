import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { ATR_DEFAULT_PERIOD, calcATR, calcATRSeries } from "@/indicators/atr";

// Helper: generate synthetic OHLC data with a controlled H-L spread
function makeBars(count: number, spread: number): { highs: number[]; lows: number[]; closes: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + i;
    highs.push(close + spread);
    lows.push(close - spread);
    closes.push(close);
  }
  return { highs, lows, closes };
}

describe("indicators/atr", () => {
  it("calcATR returns a positive Decimal for 15+ candle data with default period", () => {
    const { highs, lows, closes } = makeBars(20, 1);
    const result = calcATR(highs, lows, closes);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Decimal);
    expect(result!.greaterThan(new Decimal("0"))).toBe(true);
  });

  it("calcATR returns null when exactly 14 data points are provided (needs period+1)", () => {
    const { highs, lows, closes } = makeBars(ATR_DEFAULT_PERIOD, 1);
    const result = calcATR(highs, lows, closes);
    expect(result).toBeNull();
  });

  it("calcATR with high-volatility data produces a larger ATR than low-volatility data", () => {
    const lowVol = makeBars(20, 0.5);
    const highVol = makeBars(20, 10);
    const atrLow = calcATR(lowVol.highs, lowVol.lows, lowVol.closes);
    const atrHigh = calcATR(highVol.highs, highVol.lows, highVol.closes);
    expect(atrLow).not.toBeNull();
    expect(atrHigh).not.toBeNull();
    expect(atrHigh!.greaterThan(atrLow!)).toBe(true);
  });

  it("calcATR result is always non-negative", () => {
    const { highs, lows, closes } = makeBars(30, 2);
    const result = calcATR(highs, lows, closes);
    expect(result).not.toBeNull();
    expect(result!.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
  });

  it("calcATRSeries returns an array of Decimal values for valid input", () => {
    const { highs, lows, closes } = makeBars(20, 1);
    const result = calcATRSeries(highs, lows, closes);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => {
      expect(v).toBeInstanceOf(Decimal);
      expect(v.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
    });
  });

  it("calcATR returns null when array lengths are mismatched", () => {
    const { highs, lows, closes } = makeBars(20, 1);
    // Drop one element from lows to create mismatch
    const result = calcATR(highs, lows.slice(0, -1), closes);
    expect(result).toBeNull();
  });

  it("calcATRSeries returns empty array when input is too short", () => {
    const { highs, lows, closes } = makeBars(ATR_DEFAULT_PERIOD, 1);
    const result = calcATRSeries(highs, lows, closes);
    expect(result).toHaveLength(0);
  });
});
