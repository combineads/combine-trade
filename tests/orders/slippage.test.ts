import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";

import { d } from "../../src/core/decimal";
import { checkSlippage, checkSpread } from "../../src/orders/slippage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default max spread (5%) matching CommonCode SLIPPAGE.max_spread_pct */
const DEFAULT_MAX = d("0.05");

function expectDecimal(val: unknown): asserts val is Decimal {
  expect(val).toBeInstanceOf(Decimal);
}

// ---------------------------------------------------------------------------
// checkSlippage — pure function
// ---------------------------------------------------------------------------

describe("checkSlippage", () => {
  it("exact fill (expected === filled) returns passed=true, slippage=0", () => {
    const result = checkSlippage(d("100"), d("100"), DEFAULT_MAX);

    expect(result.passed).toBe(true);
    expect(result.slippage.isZero()).toBe(true);
    expect(result.slippagePct.isZero()).toBe(true);
    expect(result.expectedPrice.equals(d("100"))).toBe(true);
    expect(result.filledPrice.equals(d("100"))).toBe(true);
  });

  it("slippage below threshold returns passed=true", () => {
    // expected=100, filled=102 => slippage=2, pct=0.02 (2%) < 5%
    const result = checkSlippage(d("100"), d("102"), DEFAULT_MAX);

    expect(result.passed).toBe(true);
    expect(result.slippage.equals(d("2"))).toBe(true);
    expect(result.slippagePct.equals(d("0.02"))).toBe(true);
  });

  it("slippage at exact threshold returns passed=true (boundary)", () => {
    // expected=100, filled=105 => slippage=5, pct=0.05 (5%) === 5%
    const result = checkSlippage(d("100"), d("105"), DEFAULT_MAX);

    expect(result.passed).toBe(true);
    expect(result.slippagePct.equals(d("0.05"))).toBe(true);
  });

  it("slippage above threshold returns passed=false", () => {
    // expected=100, filled=106 => slippage=6, pct=0.06 (6%) > 5%
    const result = checkSlippage(d("100"), d("106"), DEFAULT_MAX);

    expect(result.passed).toBe(false);
    expect(result.slippagePct.equals(d("0.06"))).toBe(true);
  });

  it("LONG entry filled higher produces positive slippage (adverse)", () => {
    // LONG: buy at higher price is adverse => slippage = filled - expected > 0
    const result = checkSlippage(d("50000"), d("50100"), DEFAULT_MAX);

    expect(result.slippage.isPositive()).toBe(true);
    expect(result.slippage.equals(d("100"))).toBe(true);
    // 100/50000 = 0.002 = 0.2% < 5%
    expect(result.passed).toBe(true);
  });

  it("SHORT entry filled lower produces positive slippage (adverse)", () => {
    // SHORT: sell at lower price is adverse => slippage = filled - expected < 0
    // raw slippage is negative, but slippagePct uses |slippage|
    const result = checkSlippage(d("50000"), d("49900"), DEFAULT_MAX);

    expect(result.slippage.isNegative()).toBe(true);
    expect(result.slippage.equals(d("-100"))).toBe(true);
    // |(-100)| / 50000 = 0.002 = 0.2%
    expect(result.slippagePct.equals(d("0.002"))).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("favorable slippage (better price) returns passed=true, negative raw slippage", () => {
    // LONG: filled lower than expected => favorable
    const result = checkSlippage(d("100"), d("98"), DEFAULT_MAX);

    expect(result.slippage.equals(d("-2"))).toBe(true);
    // slippagePct = |(-2)| / 100 = 0.02
    expect(result.slippagePct.equals(d("0.02"))).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("very small expectedPrice does not cause division by zero", () => {
    // expectedPrice = 0.0001, filledPrice = 0.00011
    // slippage = 0.00001, pct = 0.00001 / 0.0001 = 0.1 (10%) > 5% => fail
    const result = checkSlippage(d("0.0001"), d("0.00011"), DEFAULT_MAX);

    expect(result.passed).toBe(false);
    expect(result.slippage.equals(d("0.00001"))).toBe(true);
    expect(result.slippagePct.equals(d("0.1"))).toBe(true);
  });

  it("zero expectedPrice throws an error (division by zero)", () => {
    expect(() => checkSlippage(d("0"), d("100"), DEFAULT_MAX)).toThrow();
  });

  it("all return values are Decimal instances", () => {
    const result = checkSlippage(d("100"), d("101"), DEFAULT_MAX);

    expectDecimal(result.slippage);
    expectDecimal(result.slippagePct);
    expectDecimal(result.expectedPrice);
    expectDecimal(result.filledPrice);
  });

  it("custom maxSpreadPct is respected", () => {
    // 1% max spread, slippage = 2%
    const result = checkSlippage(d("100"), d("102"), d("0.01"));

    expect(result.passed).toBe(false);
    expect(result.slippagePct.equals(d("0.02"))).toBe(true);
  });

  it("very tight maxSpreadPct (0) only passes exact fills", () => {
    const exact = checkSlippage(d("100"), d("100"), d("0"));
    expect(exact.passed).toBe(true);

    const tiny = checkSlippage(d("100"), d("100.001"), d("0"));
    expect(tiny.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkSpread — pre-order bid/ask spread guard
// ---------------------------------------------------------------------------

describe("checkSpread", () => {
  it("zero spread (bid === ask) returns passed=true, spreadPct=0", () => {
    // Degenerate but valid: bid == ask
    const result = checkSpread(d("100"), d("100"), d("0.001"));

    expect(result.passed).toBe(true);
    expect(result.spreadPct.isZero()).toBe(true);
  });

  it("spread below threshold returns passed=true", () => {
    // bid=99.95, ask=100.05 => spread=0.10, mid=100, spreadPct=0.001 (0.1%)
    const result = checkSpread(d("99.95"), d("100.05"), d("0.002"));

    expect(result.passed).toBe(true);
    expect(result.spreadPct.equals(d("0.001"))).toBe(true);
  });

  it("spread at exact threshold returns passed=true (boundary)", () => {
    // bid=99.95, ask=100.05 => spreadPct=0.001
    const result = checkSpread(d("99.95"), d("100.05"), d("0.001"));

    expect(result.passed).toBe(true);
    expect(result.spreadPct.equals(d("0.001"))).toBe(true);
  });

  it("spread above threshold returns passed=false", () => {
    // bid=99, ask=101 => spread=2, mid=100, spreadPct=0.02 (2%) > 0.1%
    const result = checkSpread(d("99"), d("101"), d("0.001"));

    expect(result.passed).toBe(false);
    expect(result.spreadPct.equals(d("0.02"))).toBe(true);
  });

  it("wide spread on cheap token returns passed=false", () => {
    // bid=0.099, ask=0.101 => spread=0.002, mid=0.1, spreadPct=0.02 (2%)
    const result = checkSpread(d("0.099"), d("0.101"), d("0.001"));

    expect(result.passed).toBe(false);
    expect(result.spreadPct.equals(d("0.02"))).toBe(true);
  });

  it("uses mid-price formula: (ask - bid) / ((ask + bid) / 2)", () => {
    // bid=49900, ask=50100 => spread=200, mid=50000, spreadPct=200/50000=0.004
    const result = checkSpread(d("49900"), d("50100"), d("0.01"));

    expect(result.passed).toBe(true);
    expect(result.spreadPct.equals(d("0.004"))).toBe(true);
  });

  it("spreadPct return value is a Decimal instance", () => {
    const result = checkSpread(d("99.95"), d("100.05"), d("0.001"));

    expect(result.spreadPct).toBeInstanceOf(Decimal);
  });

  it("tight threshold (0.0001) rejects typical crypto spread", () => {
    // bid=49990, ask=50010 => spread=20, mid=50000, spreadPct=0.0004 > 0.0001
    const result = checkSpread(d("49990"), d("50010"), d("0.0001"));

    expect(result.passed).toBe(false);
  });

  it("very small prices do not cause precision issues", () => {
    // bid=0.000099, ask=0.000101 => spread=0.000002, mid=0.0001, pct=0.02
    const result = checkSpread(d("0.000099"), d("0.000101"), d("0.03"));

    expect(result.passed).toBe(true);
    expect(result.spreadPct.equals(d("0.02"))).toBe(true);
  });
});
