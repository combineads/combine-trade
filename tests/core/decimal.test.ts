import { describe, expect, it } from "bun:test";
import {
  Decimal,
  abs,
  add,
  d,
  div,
  eq,
  gt,
  gte,
  isNegative,
  isPositive,
  isZero,
  lt,
  lte,
  max,
  min,
  mul,
  neg,
  pctChange,
  pctOf,
  sub,
  toFixed,
  toNumber,
  toPercent,
} from "../../src/core/decimal";

describe("core/decimal", () => {
  describe("d() factory", () => {
    it("creates a Decimal from a string", () => {
      expect(d("1.5")).toBeInstanceOf(Decimal);
      expect(d("1.5").toString()).toBe("1.5");
    });

    it("accepts an existing Decimal", () => {
      const dec = new Decimal("2.5");
      expect(d(dec).toString()).toBe("2.5");
    });
  });

  describe("add()", () => {
    it("0.1 + 0.2 equals 0.3 exactly (no float error)", () => {
      expect(add("0.1", "0.2").equals(d("0.3"))).toBe(true);
    });

    it("adds two Decimal instances", () => {
      expect(add(d("1"), d("2")).toString()).toBe("3");
    });

    it("adds string inputs", () => {
      expect(add("100", "0.5").toString()).toBe("100.5");
    });
  });

  describe("sub()", () => {
    it("subtracts correctly", () => {
      expect(sub("1", "0.3").equals(d("0.7"))).toBe(true);
    });

    it("produces negative results", () => {
      expect(sub("1", "2").toString()).toBe("-1");
    });
  });

  describe("mul()", () => {
    it("string inputs '100' and '0.03' equal 3", () => {
      expect(mul("100", "0.03").equals(d("3"))).toBe(true);
    });

    it("multiplies Decimal instances", () => {
      expect(mul(d("5"), d("4")).toString()).toBe("20");
    });
  });

  describe("div()", () => {
    it("divides correctly", () => {
      expect(div("10", "4").toString()).toBe("2.5");
    });

    it("throws on zero divisor (string)", () => {
      expect(() => div("1", "0")).toThrow("Division by zero");
    });

    it("throws on zero divisor (Decimal)", () => {
      expect(() => div(d("5"), d("0"))).toThrow("Division by zero");
    });

    it("includes the dividend in the error message", () => {
      expect(() => div("42", "0")).toThrow("42");
    });
  });

  describe("abs()", () => {
    it("returns absolute value of negative", () => {
      expect(abs("-5.5").toString()).toBe("5.5");
    });

    it("leaves positive unchanged", () => {
      expect(abs("3.14").toString()).toBe("3.14");
    });

    it("handles zero", () => {
      expect(abs("0").toString()).toBe("0");
    });
  });

  describe("neg()", () => {
    it("negates a positive value", () => {
      expect(neg("3").toString()).toBe("-3");
    });

    it("negates a negative value back to positive", () => {
      expect(neg("-7").toString()).toBe("7");
    });

    it("handles zero", () => {
      expect(neg("0").toString()).toBe("0");
    });
  });

  describe("min()", () => {
    it("returns the smallest value", () => {
      expect(min("3", "1", "2").toString()).toBe("1");
    });

    it("works with Decimal instances", () => {
      expect(min(d("10"), d("5"), d("8")).toString()).toBe("5");
    });

    it("works with a single value", () => {
      expect(min("7").toString()).toBe("7");
    });

    it("throws with no arguments", () => {
      expect(() => min()).toThrow();
    });
  });

  describe("max()", () => {
    it("returns the largest value", () => {
      expect(max("3", "1", "2").toString()).toBe("3");
    });

    it("works with Decimal instances", () => {
      expect(max(d("10"), d("5"), d("8")).toString()).toBe("10");
    });

    it("works with a single value", () => {
      expect(max("7").toString()).toBe("7");
    });

    it("throws with no arguments", () => {
      expect(() => max()).toThrow();
    });
  });

  describe("eq()", () => {
    it("1.0 equals 1.00 (value equality)", () => {
      expect(eq(d("1.0"), d("1.00"))).toBe(true);
    });

    it("returns false for different values", () => {
      expect(eq("1", "2")).toBe(false);
    });

    it("compares string inputs", () => {
      expect(eq("0.5", "0.5")).toBe(true);
    });
  });

  describe("gt()", () => {
    it("1.5 > 1.49 returns true", () => {
      expect(gt(d("1.5"), d("1.49"))).toBe(true);
    });

    it("equal values return false", () => {
      expect(gt("1", "1")).toBe(false);
    });

    it("smaller value returns false", () => {
      expect(gt("1", "2")).toBe(false);
    });
  });

  describe("gte()", () => {
    it("returns true when greater", () => {
      expect(gte("2", "1")).toBe(true);
    });

    it("returns true when equal", () => {
      expect(gte("1", "1")).toBe(true);
    });

    it("returns false when less", () => {
      expect(gte("1", "2")).toBe(false);
    });
  });

  describe("lt()", () => {
    it("returns true when less", () => {
      expect(lt("1", "2")).toBe(true);
    });

    it("returns false when equal", () => {
      expect(lt("1", "1")).toBe(false);
    });

    it("returns false when greater", () => {
      expect(lt("2", "1")).toBe(false);
    });
  });

  describe("lte()", () => {
    it("returns true when less", () => {
      expect(lte("1", "2")).toBe(true);
    });

    it("returns true when equal", () => {
      expect(lte("1", "1")).toBe(true);
    });

    it("returns false when greater", () => {
      expect(lte("2", "1")).toBe(false);
    });
  });

  describe("isZero()", () => {
    it("returns true for '0'", () => {
      expect(isZero(d("0"))).toBe(true);
    });

    it("returns false for '0.001'", () => {
      expect(isZero(d("0.001"))).toBe(false);
    });

    it("returns false for negative value", () => {
      expect(isZero("-1")).toBe(false);
    });
  });

  describe("isPositive()", () => {
    it("returns true for positive value", () => {
      expect(isPositive("1")).toBe(true);
    });

    it("returns false for zero", () => {
      expect(isPositive("0")).toBe(false);
    });

    it("returns false for negative", () => {
      expect(isPositive("-1")).toBe(false);
    });
  });

  describe("isNegative()", () => {
    it("returns true for negative value", () => {
      expect(isNegative("-1")).toBe(true);
    });

    it("returns false for positive", () => {
      expect(isNegative("1")).toBe(false);
    });

    it("returns false for zero", () => {
      expect(isNegative("0")).toBe(false);
    });
  });

  describe("toFixed()", () => {
    it("rounds to 2 decimal places", () => {
      expect(toFixed(d("1.23456"), 2)).toBe("1.23");
    });

    it("pads when fewer decimals than requested", () => {
      expect(toFixed("1", 3)).toBe("1.000");
    });

    it("rounds up with ROUND_HALF_UP", () => {
      expect(toFixed("1.235", 2)).toBe("1.24");
    });

    it("rounds down correctly", () => {
      expect(toFixed("1.234", 2)).toBe("1.23");
    });
  });

  describe("toPercent()", () => {
    it("formats 0.1234 as '12.34%'", () => {
      expect(toPercent("0.1234")).toBe("12.34%");
    });

    it("uses custom decimal places", () => {
      expect(toPercent("0.1", 1)).toBe("10.0%");
    });

    it("defaults to 2 decimal places", () => {
      expect(toPercent("0.5")).toBe("50.00%");
    });

    it("handles zero", () => {
      expect(toPercent("0")).toBe("0.00%");
    });
  });

  describe("toNumber()", () => {
    it("converts Decimal to native number", () => {
      expect(toNumber(d("3.14"))).toBe(3.14);
    });

    it("converts string to native number", () => {
      expect(toNumber("42")).toBe(42);
    });

    it("returns a JavaScript number type", () => {
      expect(typeof toNumber("1")).toBe("number");
    });
  });

  describe("pctChange()", () => {
    it("100 to 110 gives 0.1 (10%)", () => {
      expect(pctChange(d("100"), d("110")).equals(d("0.1"))).toBe(true);
    });

    it("100 to 90 gives -0.1 (-10%)", () => {
      expect(pctChange("100", "90").equals(d("-0.1"))).toBe(true);
    });

    it("no change gives 0", () => {
      expect(pctChange("50", "50").equals(d("0"))).toBe(true);
    });

    it("throws when from is zero", () => {
      expect(() => pctChange("0", "100")).toThrow("pctChange");
    });
  });

  describe("pctOf()", () => {
    it("3% of 1000 is 30", () => {
      expect(pctOf("1000", "0.03").equals(d("30"))).toBe(true);
    });

    it("100% of 500 is 500", () => {
      expect(pctOf("500", "1").equals(d("500"))).toBe(true);
    });

    it("50% of 200 is 100", () => {
      expect(pctOf("200", "0.5").equals(d("100"))).toBe(true);
    });
  });

  describe("Decimal re-export", () => {
    it("Decimal is re-exported and usable", () => {
      const v = new Decimal("99.9");
      expect(v).toBeInstanceOf(Decimal);
    });
  });
});
