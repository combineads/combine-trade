import { describe, expect, test } from "bun:test";
import { ArithmeticError, add, div, mul, round, sub } from "../arithmetic.js";

describe("Decimal arithmetic", () => {
	test("add: 0.1 + 0.2 = 0.3 (IEEE 754 proof)", () => {
		expect(add("0.1", "0.2")).toBe("0.3");
	});

	test("add: large numbers", () => {
		expect(add("999999999.99", "0.01")).toBe("1000000000");
	});

	test("sub: 1.0 - 0.9 = 0.1", () => {
		expect(sub("1.0", "0.9")).toBe("0.1");
	});

	test("sub: negative result", () => {
		expect(sub("100", "250")).toBe("-150");
	});

	test("mul: 0.1 * 0.2 = 0.02", () => {
		expect(mul("0.1", "0.2")).toBe("0.02");
	});

	test("mul: quantity * price", () => {
		expect(mul("0.5", "50000")).toBe("25000");
	});

	test("div: 100 / 3", () => {
		const result = div("100", "3");
		expect(result.startsWith("33.33333333")).toBe(true);
	});

	test("div: by zero throws ArithmeticError", () => {
		expect(() => div("100", "0")).toThrow(ArithmeticError);
	});

	test("div: exact division", () => {
		expect(div("10", "4")).toBe("2.5");
	});

	test("round ROUND_DOWN: truncates toward zero", () => {
		expect(round("2.5679", 3, "ROUND_DOWN")).toBe("2.567");
	});

	test("round ROUND_DOWN: negative truncates toward zero", () => {
		expect(round("-2.5679", 3, "ROUND_DOWN")).toBe("-2.567");
	});

	test("round ROUND_HALF_UP: standard rounding", () => {
		expect(round("2.565", 2, "ROUND_HALF_UP")).toBe("2.57");
	});

	test("round ROUND_HALF_UP: rounds 0.5 up", () => {
		expect(round("1.5", 0, "ROUND_HALF_UP")).toBe("2");
	});

	test("round to 0 decimal places", () => {
		expect(round("99.9999", 0, "ROUND_DOWN")).toBe("99");
	});

	test("add with negative numbers", () => {
		expect(add("-100", "50")).toBe("-50");
	});
});
