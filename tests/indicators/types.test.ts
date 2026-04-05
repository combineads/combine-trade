import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import type { AllIndicators, BollingerResult, SqueezeState } from "@/indicators/types";

// ---------------------------------------------------------------------------
// Runtime construction tests
// ---------------------------------------------------------------------------

describe("indicators/types — BollingerResult construction", () => {
  it("BollingerResult can be constructed with Decimal fields", () => {
    const result: BollingerResult = {
      upper: new Decimal("100.5"),
      middle: new Decimal("100"),
      lower: new Decimal("99.5"),
      bandwidth: new Decimal("0.01"),
      percentB: new Decimal("0.5"),
    };
    expect(result.upper).toBeInstanceOf(Decimal);
    expect(result.middle).toBeInstanceOf(Decimal);
    expect(result.lower).toBeInstanceOf(Decimal);
    expect(result.bandwidth).toBeInstanceOf(Decimal);
    expect(result.percentB).toBeInstanceOf(Decimal);
  });
});

describe("indicators/types — AllIndicators construction", () => {
  it("AllIndicators has all 12 fields", () => {
    const indicators: AllIndicators = {
      bb20: null,
      bb4: null,
      bb4_1h: null,
      sma20: null,
      sma20_5m: null,
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
    const keys = Object.keys(indicators);
    expect(keys).toHaveLength(14);
    expect(keys).toContain("bb20");
    expect(keys).toContain("bb4");
    expect(keys).toContain("sma20");
    expect(keys).toContain("sma20_5m");
    expect(keys).toContain("sma60");
    expect(keys).toContain("sma120");
    expect(keys).toContain("ema20");
    expect(keys).toContain("ema60");
    expect(keys).toContain("ema120");
    expect(keys).toContain("rsi14");
    expect(keys).toContain("atr14");
    expect(keys).toContain("squeeze");
  });

  it("AllIndicators nullable fields accept null", () => {
    const indicators: AllIndicators = {
      bb20: null,
      bb4: null,
      bb4_1h: null,
      sma20: null,
      sma20_5m: null,
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
    expect(indicators.bb20).toBeNull();
    expect(indicators.bb4).toBeNull();
    expect(indicators.sma20).toBeNull();
    expect(indicators.sma20_5m).toBeNull();
    expect(indicators.rsi14).toBeNull();
    expect(indicators.atr14).toBeNull();
  });

  it("AllIndicators nullable fields accept Decimal values", () => {
    const bb: BollingerResult = {
      upper: new Decimal("100.5"),
      middle: new Decimal("100"),
      lower: new Decimal("99.5"),
      bandwidth: new Decimal("0.01"),
      percentB: new Decimal("0.5"),
    };
    const indicators: AllIndicators = {
      bb20: bb,
      bb4: bb,
      bb4_1h: null,
      sma20: new Decimal("100"),
      sma20_5m: null,
      sma60: new Decimal("99"),
      sma120: new Decimal("98"),
      ema20: new Decimal("100.1"),
      ema60: new Decimal("99.2"),
      ema120: new Decimal("98.3"),
      rsi14: new Decimal("55"),
      atr14: new Decimal("1.5"),
      prevSma20: new Decimal("99.9"),
      squeeze: "squeeze",
    };
    expect(indicators.bb20).not.toBeNull();
    expect(indicators.sma20).toBeInstanceOf(Decimal);
  });
});

describe("indicators/types — SqueezeState values", () => {
  it("SqueezeState accepts all valid values", () => {
    const values: SqueezeState[] = ["squeeze", "expansion", "normal"];
    expect(values).toHaveLength(3);
    expect(values).toContain("squeeze");
    expect(values).toContain("expansion");
    expect(values).toContain("normal");
  });
});

// ---------------------------------------------------------------------------
// Compile-time type safety verification (using @ts-expect-error)
// ---------------------------------------------------------------------------

describe("indicators/types — compile-time type safety", () => {
  it("number is not assignable to BollingerResult.upper", () => {
    // @ts-expect-error — number is not assignable to Decimal
    const _bad: BollingerResult = {
      // @ts-expect-error — number is not assignable to Decimal
      upper: 100.5,
      middle: new Decimal("100"),
      lower: new Decimal("99.5"),
      bandwidth: new Decimal("0.01"),
      percentB: new Decimal("0.5"),
    };
    expect(true).toBe(true);
  });

  it("invalid SqueezeState value is rejected at compile time", () => {
    // @ts-expect-error — 'unknown' is not a valid SqueezeState
    const _bad: SqueezeState = "unknown";
    expect(true).toBe(true);
  });
});
