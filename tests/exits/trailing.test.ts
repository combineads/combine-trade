import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { d } from "@/core/decimal";
import {
  calculateTrailingSl,
  shouldUpdateTrailingSl,
  calcMaxProfit,
  DEFAULT_TRAILING_RATIO,
} from "@/exits/trailing";

// ---------------------------------------------------------------------------
// calculateTrailingSl
// ---------------------------------------------------------------------------

describe("trailing — calculateTrailingSl", () => {
  it("LONG with positive profit: SL above entry", () => {
    // entry=100, maxProfit=20, ratio=0.50 => 100 + 20*0.50 = 110
    const sl = calculateTrailingSl(d("100"), d("20"), "LONG");
    expect(sl.equals(d("110"))).toBe(true);
  });

  it("SHORT with positive profit: SL below entry", () => {
    // entry=100, maxProfit=20, ratio=0.50 => 100 - 20*0.50 = 90
    const sl = calculateTrailingSl(d("100"), d("20"), "SHORT");
    expect(sl.equals(d("90"))).toBe(true);
  });

  it("zero profit: SL equals entry (breakeven)", () => {
    const slLong = calculateTrailingSl(d("50000"), d("0"), "LONG");
    expect(slLong.equals(d("50000"))).toBe(true);

    const slShort = calculateTrailingSl(d("50000"), d("0"), "SHORT");
    expect(slShort.equals(d("50000"))).toBe(true);
  });

  it("custom ratio 0.30: correct proportional SL", () => {
    // entry=200, maxProfit=40, ratio=0.30 => 200 + 40*0.30 = 212
    const sl = calculateTrailingSl(d("200"), d("40"), "LONG", d("0.30"));
    expect(sl.equals(d("212"))).toBe(true);
  });

  it("custom ratio 0.30 SHORT: correct proportional SL", () => {
    // entry=200, maxProfit=40, ratio=0.30 => 200 - 40*0.30 = 188
    const sl = calculateTrailingSl(d("200"), d("40"), "SHORT", d("0.30"));
    expect(sl.equals(d("188"))).toBe(true);
  });

  it("uses DEFAULT_TRAILING_RATIO of 0.50 when ratio omitted", () => {
    expect(DEFAULT_TRAILING_RATIO.equals(d("0.50"))).toBe(true);

    // entry=1000, maxProfit=100, default 0.50 => 1000 + 100*0.50 = 1050
    const sl = calculateTrailingSl(d("1000"), d("100"), "LONG");
    expect(sl.equals(d("1050"))).toBe(true);
  });

  it("returns Decimal instance", () => {
    const sl = calculateTrailingSl(d("100"), d("10"), "LONG");
    expect(sl).toBeInstanceOf(Decimal);
  });

  it("LONG SL is always >= entry when maxProfit >= 0", () => {
    const sl = calculateTrailingSl(d("50000"), d("0"), "LONG");
    expect(sl.greaterThanOrEqualTo(d("50000"))).toBe(true);

    const sl2 = calculateTrailingSl(d("50000"), d("500"), "LONG");
    expect(sl2.greaterThanOrEqualTo(d("50000"))).toBe(true);
  });

  it("SHORT SL is always <= entry when maxProfit >= 0", () => {
    const sl = calculateTrailingSl(d("50000"), d("0"), "SHORT");
    expect(sl.lessThanOrEqualTo(d("50000"))).toBe(true);

    const sl2 = calculateTrailingSl(d("50000"), d("500"), "SHORT");
    expect(sl2.lessThanOrEqualTo(d("50000"))).toBe(true);
  });

  it("works with realistic crypto prices", () => {
    // BTC entry=67543.50, maxProfit=1200.00, ratio=0.50
    // LONG: 67543.50 + 1200*0.50 = 68143.50
    const sl = calculateTrailingSl(d("67543.50"), d("1200"), "LONG");
    expect(sl.equals(d("68143.50"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldUpdateTrailingSl
// ---------------------------------------------------------------------------

describe("trailing — shouldUpdateTrailingSl", () => {
  it("LONG: new > current => true (SL moves up)", () => {
    expect(shouldUpdateTrailingSl(d("100"), d("105"), "LONG")).toBe(true);
  });

  it("LONG: new < current => false (never move SL down)", () => {
    expect(shouldUpdateTrailingSl(d("105"), d("100"), "LONG")).toBe(false);
  });

  it("LONG: new === current => false (no change needed)", () => {
    expect(shouldUpdateTrailingSl(d("100"), d("100"), "LONG")).toBe(false);
  });

  it("SHORT: new < current => true (SL moves down)", () => {
    expect(shouldUpdateTrailingSl(d("105"), d("100"), "SHORT")).toBe(true);
  });

  it("SHORT: new > current => false (never move SL up)", () => {
    expect(shouldUpdateTrailingSl(d("100"), d("105"), "SHORT")).toBe(false);
  });

  it("SHORT: new === current => false (no change needed)", () => {
    expect(shouldUpdateTrailingSl(d("100"), d("100"), "SHORT")).toBe(false);
  });

  it("returns boolean type", () => {
    const result = shouldUpdateTrailingSl(d("100"), d("105"), "LONG");
    expect(typeof result).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// calcMaxProfit
// ---------------------------------------------------------------------------

describe("trailing — calcMaxProfit", () => {
  it("LONG: price above entry => positive profit", () => {
    // current=120, entry=100 => 20
    const profit = calcMaxProfit(d("100"), d("120"), "LONG");
    expect(profit.equals(d("20"))).toBe(true);
  });

  it("LONG: price below entry => zero (clamped)", () => {
    // current=90, entry=100 => max(0, -10) = 0
    const profit = calcMaxProfit(d("100"), d("90"), "LONG");
    expect(profit.equals(d("0"))).toBe(true);
  });

  it("LONG: price equals entry => zero", () => {
    const profit = calcMaxProfit(d("100"), d("100"), "LONG");
    expect(profit.equals(d("0"))).toBe(true);
  });

  it("SHORT: price below entry => positive profit", () => {
    // entry=100, current=80 => 20
    const profit = calcMaxProfit(d("100"), d("80"), "SHORT");
    expect(profit.equals(d("20"))).toBe(true);
  });

  it("SHORT: price above entry => zero (clamped)", () => {
    // entry=100, current=110 => max(0, -10) = 0
    const profit = calcMaxProfit(d("100"), d("110"), "SHORT");
    expect(profit.equals(d("0"))).toBe(true);
  });

  it("SHORT: price equals entry => zero", () => {
    const profit = calcMaxProfit(d("100"), d("100"), "SHORT");
    expect(profit.equals(d("0"))).toBe(true);
  });

  it("returns Decimal instance", () => {
    const profit = calcMaxProfit(d("100"), d("120"), "LONG");
    expect(profit).toBeInstanceOf(Decimal);
  });

  it("never returns negative value", () => {
    // LONG underwater
    const p1 = calcMaxProfit(d("50000"), d("45000"), "LONG");
    expect(p1.greaterThanOrEqualTo(d("0"))).toBe(true);

    // SHORT underwater
    const p2 = calcMaxProfit(d("50000"), d("55000"), "SHORT");
    expect(p2.greaterThanOrEqualTo(d("0"))).toBe(true);
  });

  it("works with realistic crypto prices", () => {
    // BTC LONG: entry=67543.50, current=68743.50 => 1200
    const profit = calcMaxProfit(d("67543.50"), d("68743.50"), "LONG");
    expect(profit.equals(d("1200"))).toBe(true);
  });
});
