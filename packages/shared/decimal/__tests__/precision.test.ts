import { describe, expect, test } from "bun:test";
import {
	PrecisionError,
	roundPrice,
	roundQuantity,
	validateMinNotional,
	validateOrder,
} from "../precision.js";

describe("Exchange precision", () => {
	describe("roundPrice", () => {
		test("rounds BTC price to tick size 0.10", () => {
			expect(roundPrice("50123.47", "0.10")).toBe("50123.4");
		});

		test("already aligned price unchanged", () => {
			expect(roundPrice("50000.00", "0.10")).toBe("50000");
		});

		test("rounds down (never up)", () => {
			expect(roundPrice("50000.19", "0.10")).toBe("50000.1");
		});

		test("tick size 1 for whole-number assets", () => {
			expect(roundPrice("123.9", "1")).toBe("123");
		});
	});

	describe("roundQuantity", () => {
		test("rounds BTC quantity to lot size 0.001", () => {
			expect(roundQuantity("0.1234", "0.001")).toBe("0.123");
		});

		test("rounds down (never up)", () => {
			expect(roundQuantity("0.9999", "0.001")).toBe("0.999");
		});

		test("sub-lot quantity rounds to 0", () => {
			expect(roundQuantity("0.0005", "0.001")).toBe("0");
		});

		test("lot size 1 for whole-unit assets", () => {
			expect(roundQuantity("99.7", "1")).toBe("99");
		});
	});

	describe("validateMinNotional", () => {
		test("notional above min → no throw", () => {
			// 0.1 * 50000 = 5000 >= 5
			expect(() => validateMinNotional("0.1", "50000", "5")).not.toThrow();
		});

		test("notional below min → throws PrecisionError", () => {
			// 0.0001 * 50000 = 5 < 10
			expect(() => validateMinNotional("0.0001", "50000", "10")).toThrow(PrecisionError);
		});

		test("notional exactly at min → no throw", () => {
			// 0.0001 * 50000 = 5 >= 5
			expect(() => validateMinNotional("0.0001", "50000", "5")).not.toThrow();
		});
	});

	describe("validateOrder", () => {
		const rules = { tickSize: "0.10", lotSize: "0.001", minNotional: "5" };

		test("happy path: rounds and validates", () => {
			const result = validateOrder("50123.47", "0.1234", rules);
			expect(result.roundedPrice).toBe("50123.4");
			expect(result.roundedQuantity).toBe("0.123");
		});

		test("throws when rounded quantity makes notional too small", () => {
			expect(() => validateOrder("50000", "0.00005", rules)).toThrow(PrecisionError);
		});
	});
});
