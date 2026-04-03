import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { calcRSI, calcRSISeries, RSI_DEFAULT_PERIOD } from "@/indicators/rsi";

describe("indicators/rsi", () => {
  it("returns Decimal > 70 for 15+ rising closes", () => {
    // Strongly rising: each close is noticeably higher than the previous
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
    const result = calcRSI(closes);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Decimal);
    expect(result!.greaterThan(new Decimal("70"))).toBe(true);
  });

  it("returns Decimal < 30 for 15+ falling closes", () => {
    // Strongly falling: each close is noticeably lower than the previous
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i * 5);
    const result = calcRSI(closes);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Decimal);
    expect(result!.lessThan(new Decimal("30"))).toBe(true);
  });

  it("returns null when closes.length < period + 1 (exactly period elements)", () => {
    const closes = Array.from({ length: RSI_DEFAULT_PERIOD }, (_, i) => i + 1);
    expect(closes).toHaveLength(RSI_DEFAULT_PERIOD);
    const result = calcRSI(closes);
    expect(result).toBeNull();
  });

  it("returns null for fewer than period + 1 closes", () => {
    const result = calcRSI([100, 101, 102]);
    expect(result).toBeNull();
  });

  it("result is always between 0 and 100 for rising input", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 50 + i * 3);
    const result = calcRSI(closes);
    expect(result).not.toBeNull();
    expect(result!.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
    expect(result!.lessThanOrEqualTo(new Decimal("100"))).toBe(true);
  });

  it("result is always between 0 and 100 for falling input", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i * 3);
    const result = calcRSI(closes);
    expect(result).not.toBeNull();
    expect(result!.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
    expect(result!.lessThanOrEqualTo(new Decimal("100"))).toBe(true);
  });

  it("calcRSISeries returns Decimal[] for valid input", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const result = calcRSISeries(closes);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => {
      expect(v).toBeInstanceOf(Decimal);
      expect(v.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
      expect(v.lessThanOrEqualTo(new Decimal("100"))).toBe(true);
    });
  });

  it("calcRSISeries returns empty array when closes.length < period + 1", () => {
    const closes = Array.from({ length: RSI_DEFAULT_PERIOD }, (_, i) => i + 1);
    const result = calcRSISeries(closes);
    expect(result).toHaveLength(0);
  });

  it("handles constant prices gracefully (no crash, result is null or valid Decimal)", () => {
    // With all-same prices there are no gains or losses; library may return NaN
    const closes = Array.from({ length: 20 }, () => 100);
    const result = calcRSI(closes);
    // Either returns null (NaN filtered) or a valid Decimal in [0, 100]
    if (result !== null) {
      expect(result).toBeInstanceOf(Decimal);
      expect(result.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
      expect(result.lessThanOrEqualTo(new Decimal("100"))).toBe(true);
    } else {
      expect(result).toBeNull();
    }
  });
});
