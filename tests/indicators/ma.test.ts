import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { calcEMA, calcEMASeries, calcSMA, calcSMASeries } from "@/indicators/ma";

describe("indicators/ma — calcSMA", () => {
  it("returns correct last SMA value for [1,2,3,4,5] period 3", () => {
    const result = calcSMA([1, 2, 3, 4, 5], 3);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Decimal);
    // average of [3, 4, 5] = 4
    expect(result?.equals(new Decimal("4"))).toBe(true);
  });

  it("returns null when source.length < period", () => {
    const result = calcSMA([1, 2], 3);
    expect(result).toBeNull();
  });

  it("returns correct value for constant input [10,10,10,10,10] period 3", () => {
    const result = calcSMA([10, 10, 10, 10, 10], 3);
    expect(result).not.toBeNull();
    expect(result?.equals(new Decimal("10"))).toBe(true);
  });

  it("returns null when source.length equals zero", () => {
    const result = calcSMA([], 3);
    expect(result).toBeNull();
  });
});

describe("indicators/ma — calcEMA", () => {
  it("returns non-null Decimal for 20+ value source", () => {
    const source = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = calcEMA(source, 20);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Decimal);
  });

  it("returns null when source.length < period", () => {
    const result = calcEMA([1, 2, 3], 5);
    expect(result).toBeNull();
  });

  it("returns correct value for constant input [10,10,10,10,10] period 3", () => {
    const result = calcEMA([10, 10, 10, 10, 10], 3);
    expect(result).not.toBeNull();
    expect(result?.equals(new Decimal("10"))).toBe(true);
  });
});

describe("indicators/ma — calcSMASeries", () => {
  it("returns Decimal array with correct count for [1,2,3,4,5] period 3", () => {
    const result = calcSMASeries([1, 2, 3, 4, 5], 3);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => expect(v).toBeInstanceOf(Decimal));
  });

  it("returns empty array when source.length < period", () => {
    const result = calcSMASeries([1, 2], 3);
    expect(result).toHaveLength(0);
  });

  it("all values in series are Decimal instances", () => {
    const source = [10, 20, 30, 40, 50, 60, 70];
    const result = calcSMASeries(source, 3);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => expect(v).toBeInstanceOf(Decimal));
  });
});

describe("indicators/ma — calcEMASeries", () => {
  it("returns Decimal array for valid input", () => {
    const source = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = calcEMASeries(source, 3);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => expect(v).toBeInstanceOf(Decimal));
  });

  it("returns empty array when source.length < period", () => {
    const result = calcEMASeries([1, 2], 5);
    expect(result).toHaveLength(0);
  });
});

describe("indicators/ma — SMA and EMA of constant data", () => {
  it("SMA and EMA of constant [5,5,5,5,5,5,5,5] period 3 are equal", () => {
    const source = [5, 5, 5, 5, 5, 5, 5, 5];
    const sma = calcSMA(source, 3);
    const ema = calcEMA(source, 3);
    expect(sma).not.toBeNull();
    expect(ema).not.toBeNull();
    expect(sma?.equals(new Decimal("5"))).toBe(true);
    expect(ema?.equals(new Decimal("5"))).toBe(true);
    expect(sma?.equals(ema as Decimal)).toBe(true);
  });
});
