import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { d } from "@/core/decimal";
import {
  calculateSize,
  getRiskPct,
  MinSizeError,
  type SizeParams,
  type SizeResult,
} from "@/positions/sizer";

// ---------------------------------------------------------------------------
// Helper — builds default SizeParams for convenience
// ---------------------------------------------------------------------------

function makeParams(overrides: Partial<SizeParams> = {}): SizeParams {
  return {
    balance: d("10000000"),       // 10M KRW
    entryPrice: d("50000"),       // 50,000
    slPrice: d("49900"),          // SL 100 ticks below (LONG)
    direction: "LONG",
    exchangeInfo: {
      symbol: "BTCUSDT",
      tickSize: d("0.001"),
      minOrderSize: d("0.001"),
      maxLeverage: 38,
      contractSize: d("1"),
    },
    riskPct: d("0.01"),           // 1%
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getRiskPct — tier selection
// ---------------------------------------------------------------------------

describe("sizer — getRiskPct", () => {
  it("small balance (~300K KRW) returns 3%", () => {
    const pct = getRiskPct(d("300000"));
    expect(pct.equals(d("0.03"))).toBe(true);
  });

  it("large balance (~30M KRW) returns 1%", () => {
    const pct = getRiskPct(d("30000000"));
    expect(pct.equals(d("0.01"))).toBe(true);
  });

  it("balance below 300K still returns 3%", () => {
    const pct = getRiskPct(d("100000"));
    expect(pct.equals(d("0.03"))).toBe(true);
  });

  it("balance above 30M still returns 1%", () => {
    const pct = getRiskPct(d("100000000"));
    expect(pct.equals(d("0.01"))).toBe(true);
  });

  it("mid-range balance uses linear interpolation", () => {
    // Halfway between 300K and 30M → midpoint of 3% and 1% → ~2%
    const midBalance = d("15150000"); // (300000 + 30000000) / 2
    const pct = getRiskPct(midBalance);
    // Should be between 1% and 3%
    expect(pct.greaterThan(d("0.01"))).toBe(true);
    expect(pct.lessThan(d("0.03"))).toBe(true);
  });

  it("returns a Decimal instance", () => {
    const pct = getRiskPct(d("1000000"));
    expect(pct).toBeInstanceOf(Decimal);
  });
});

// ---------------------------------------------------------------------------
// calculateSize — standard params
// ---------------------------------------------------------------------------

describe("sizer — calculateSize standard", () => {
  it("calculates correct size and leverage with standard params", () => {
    // balance=10M, risk=1%, SL=100 ticks from entry
    const params = makeParams();
    const result = calculateSize(params);

    // riskAmount = 10,000,000 * 0.01 = 100,000
    // slDistance = |50000 - 49900| = 100
    // rawSize = 100,000 / 100 = 1000
    // leverage = (1000 * 50000) / 10,000,000 = 5
    expect(result).not.toBeNull();
    const r = result as SizeResult;
    expect(r.riskAmount.equals(d("100000"))).toBe(true);
    expect(r.size.equals(d("1000"))).toBe(true);
    expect(r.leverage).toBe(5);
    expect(r.adjustedForLevCap).toBe(false);
  });

  it("all return values are Decimal instances (except leverage and adjustedForLevCap)", () => {
    const result = calculateSize(makeParams());
    expect(result).not.toBeNull();
    const r = result as SizeResult;
    expect(r.size).toBeInstanceOf(Decimal);
    expect(r.riskAmount).toBeInstanceOf(Decimal);
    expect(r.maxLoss).toBeInstanceOf(Decimal);
    expect(typeof r.leverage).toBe("number");
    expect(typeof r.adjustedForLevCap).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// calculateSize — SL tightness affects position size, not risk amount
// ---------------------------------------------------------------------------

describe("sizer — tight vs wide SL", () => {
  it("tight SL (10 ticks) → larger position, higher leverage, same riskAmount", () => {
    const params = makeParams({
      slPrice: d("49990"),  // SL only 10 away
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;

    // riskAmount = 100,000
    // slDistance = 10
    // rawSize = 100,000 / 10 = 10,000
    // leverage = (10000 * 50000) / 10,000,000 = 50 → exceeds 38x cap
    // So adjusted: size = (10,000,000 * 38) / 50,000 = 7,600
    expect(r.riskAmount.lessThanOrEqualTo(d("100000"))).toBe(true);
    expect(r.adjustedForLevCap).toBe(true);
    expect(r.leverage).toBeLessThanOrEqual(38);
  });

  it("wide SL (500 ticks) → smaller position, lower leverage, same riskAmount", () => {
    const params = makeParams({
      slPrice: d("49500"),  // SL 500 away
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;

    // riskAmount = 100,000
    // slDistance = 500
    // rawSize = 100,000 / 500 = 200
    // leverage = (200 * 50000) / 10,000,000 = 1
    expect(r.size.equals(d("200"))).toBe(true);
    expect(r.riskAmount.equals(d("100000"))).toBe(true);
    expect(r.leverage).toBe(1);
    expect(r.adjustedForLevCap).toBe(false);
  });

  it("same riskAmount regardless of SL width (when leverage cap not hit)", () => {
    const narrow = calculateSize(makeParams({ slPrice: d("49800") })) as SizeResult;  // 200 ticks
    const wide = calculateSize(makeParams({ slPrice: d("49500") })) as SizeResult;    // 500 ticks
    expect(narrow.riskAmount.equals(wide.riskAmount)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSize — leverage cap
// ---------------------------------------------------------------------------

describe("sizer — leverage cap (38x)", () => {
  it("reduces position when leverage exceeds 38x, sets adjustedForLevCap = true", () => {
    // Tight SL to force high leverage
    const params = makeParams({
      slPrice: d("49995"),  // SL only 5 ticks away
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;

    // rawSize = 100,000 / 5 = 20,000
    // rawLeverage = (20,000 * 50,000) / 10,000,000 = 100 → exceeds 38x
    // adjusted size = (10,000,000 * 38) / 50,000 = 7,600
    expect(r.adjustedForLevCap).toBe(true);
    expect(r.leverage).toBeLessThanOrEqual(38);
    expect(r.size.equals(d("7600"))).toBe(true);

    // recalculated maxLoss = 7600 * 5 = 38,000 (less than original 100,000)
    expect(r.maxLoss.equals(d("38000"))).toBe(true);
  });

  it("uses exchange maxLeverage if lower than 38", () => {
    const params = makeParams({
      slPrice: d("49995"),
      exchangeInfo: {
        symbol: "BTCUSDT",
        tickSize: d("0.001"),
        minOrderSize: d("0.001"),
        maxLeverage: 20,
        contractSize: d("1"),
      },
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;

    expect(r.adjustedForLevCap).toBe(true);
    expect(r.leverage).toBeLessThanOrEqual(20);
    // adjusted size = (10,000,000 * 20) / 50,000 = 4,000
    expect(r.size.equals(d("4000"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSize — small vs large balance riskPct
// ---------------------------------------------------------------------------

describe("sizer — balance-based riskPct", () => {
  it("very small balance (300K) uses riskPct = 3%", () => {
    const params = makeParams({
      balance: d("300000"),
      riskPct: getRiskPct(d("300000")), // should be 3%
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;
    // riskAmount = 300,000 * 0.03 = 9,000
    expect(r.riskAmount.equals(d("9000"))).toBe(true);
  });

  it("large balance (30M) uses riskPct = 1%", () => {
    const params = makeParams({
      balance: d("30000000"),
      riskPct: getRiskPct(d("30000000")), // should be 1%
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;
    // riskAmount = 30,000,000 * 0.01 = 300,000
    expect(r.riskAmount.equals(d("300000"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSize — minOrderSize enforcement
// ---------------------------------------------------------------------------

describe("sizer — minOrderSize enforcement", () => {
  it("returns null when calculated size < minOrderSize", () => {
    const params = makeParams({
      balance: d("100"),           // very small balance
      riskPct: d("0.01"),          // 1%
      entryPrice: d("50000"),
      slPrice: d("49900"),         // 100 ticks
      exchangeInfo: {
        symbol: "BTCUSDT",
        tickSize: d("0.001"),
        minOrderSize: d("1000"),   // unreachably high minimum
        maxLeverage: 38,
        contractSize: d("1"),
      },
    });
    const result = calculateSize(params);
    expect(result).toBeNull();
  });

  it("succeeds when size exactly equals minOrderSize", () => {
    // riskAmount = 100 * 0.01 = 1
    // slDistance = 1
    // rawSize = 1
    const params = makeParams({
      balance: d("100"),
      riskPct: d("0.01"),
      entryPrice: d("100"),
      slPrice: d("99"),           // 1 tick
      exchangeInfo: {
        symbol: "TESTUSDT",
        tickSize: d("1"),
        minOrderSize: d("1"),
        maxLeverage: 100,
        contractSize: d("1"),
      },
    });
    const result = calculateSize(params);
    expect(result).not.toBeNull();
    const r = result as SizeResult;
    expect(r.size.greaterThanOrEqualTo(d("1"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSize — tickSize rounding
// ---------------------------------------------------------------------------

describe("sizer — tickSize rounding", () => {
  it("size is rounded down to tickSize multiple", () => {
    // riskAmount = 10,000,000 * 0.01 = 100,000
    // slDistance = 100
    // rawSize = 1000 → already a multiple of 0.001
    const params = makeParams();
    const result = calculateSize(params) as SizeResult;
    // Check divisible by tickSize
    expect(result.size.mod(d("0.001")).isZero()).toBe(true);
  });

  it("non-exact size is rounded down to tickSize", () => {
    // Set up so rawSize has fractional remainder
    // balance=1000, riskPct=0.01, entry=100, sl=99.7 → slDist=0.3
    // riskAmount=10, rawSize = 10/0.3 = 33.333...
    // tickSize = 0.01 → rounded to 33.33
    const params = makeParams({
      balance: d("1000"),
      riskPct: d("0.01"),
      entryPrice: d("100"),
      slPrice: d("99.7"),
      exchangeInfo: {
        symbol: "TESTUSDT",
        tickSize: d("0.01"),
        minOrderSize: d("0.01"),
        maxLeverage: 100,
        contractSize: d("1"),
      },
    });
    const result = calculateSize(params) as SizeResult;
    expect(result.size.mod(d("0.01")).isZero()).toBe(true);
    // 33.33 (rounded down from 33.333...)
    expect(result.size.equals(d("33.33"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSize — LONG vs SHORT direction
// ---------------------------------------------------------------------------

describe("sizer — direction handling", () => {
  it("LONG entry: SL below entry → correct slDistance", () => {
    const params = makeParams({
      direction: "LONG",
      entryPrice: d("50000"),
      slPrice: d("49800"),
    });
    const result = calculateSize(params) as SizeResult;
    // slDistance = 50000 - 49800 = 200
    // riskAmount = 100,000, rawSize = 100,000 / 200 = 500
    expect(result.size.equals(d("500"))).toBe(true);
  });

  it("SHORT entry: SL above entry → correct slDistance", () => {
    const params = makeParams({
      direction: "SHORT",
      entryPrice: d("50000"),
      slPrice: d("50200"),
    });
    const result = calculateSize(params) as SizeResult;
    // slDistance = |50000 - 50200| = 200
    // riskAmount = 100,000, rawSize = 100,000 / 200 = 500
    expect(result.size.equals(d("500"))).toBe(true);
  });

  it("LONG with SL above entry throws error (invalid SL)", () => {
    const params = makeParams({
      direction: "LONG",
      entryPrice: d("50000"),
      slPrice: d("50100"),
    });
    expect(() => calculateSize(params)).toThrow();
  });

  it("SHORT with SL below entry throws error (invalid SL)", () => {
    const params = makeParams({
      direction: "SHORT",
      entryPrice: d("50000"),
      slPrice: d("49900"),
    });
    expect(() => calculateSize(params)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// calculateSize — edge cases
// ---------------------------------------------------------------------------

describe("sizer — edge cases", () => {
  it("slPrice equals entryPrice throws (division by zero)", () => {
    const params = makeParams({
      slPrice: d("50000"),  // same as entry
    });
    expect(() => calculateSize(params)).toThrow();
  });

  it("zero balance returns null (no position possible)", () => {
    const params = makeParams({ balance: d("0") });
    const result = calculateSize(params);
    expect(result).toBeNull();
  });

  it("negative riskPct throws", () => {
    const params = makeParams({ riskPct: d("-0.01") });
    expect(() => calculateSize(params)).toThrow();
  });

  it("riskPct of zero returns null", () => {
    const params = makeParams({ riskPct: d("0") });
    const result = calculateSize(params);
    expect(result).toBeNull();
  });

  it("maxLoss equals riskAmount when no leverage cap adjustment", () => {
    const params = makeParams({
      slPrice: d("49500"),  // wide SL, no lev cap
    });
    const result = calculateSize(params) as SizeResult;
    expect(result.maxLoss.equals(result.riskAmount)).toBe(true);
    expect(result.adjustedForLevCap).toBe(false);
  });

  it("maxLoss is less than riskAmount when leverage cap applied", () => {
    const params = makeParams({
      slPrice: d("49995"),  // very tight, will trigger lev cap
    });
    const result = calculateSize(params) as SizeResult;
    expect(result.adjustedForLevCap).toBe(true);
    expect(result.maxLoss.lessThan(result.riskAmount)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MinSizeError
// ---------------------------------------------------------------------------

describe("sizer — MinSizeError", () => {
  it("MinSizeError has correct properties", () => {
    const err = new MinSizeError(d("0.0005"), d("0.001"));
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MinSizeError);
    expect(err.calculatedSize).toBeInstanceOf(Decimal);
    expect(err.minOrderSize).toBeInstanceOf(Decimal);
    expect(err.message).toContain("0.0005");
    expect(err.message).toContain("0.001");
  });
});
