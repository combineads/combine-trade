import { describe, expect, test } from "bun:test";
import {
	LotSizeViolationError,
	LotSizeValidator,
	type ExchangeLotRules,
} from "../lot-size-validator.js";

const rules: ExchangeLotRules = {
	stepSize: "0.01",
	minQty: "0.01",
	maxQty: "100",
	minNotional: "20",
};

const validator = new LotSizeValidator();

describe("LotSizeValidator", () => {
	describe("checkStepSize", () => {
		test("0.005 with stepSize 0.01 → throws LotSizeViolationError (not aligned)", () => {
			expect(() => validator.checkStepSize("0.005", "0.01")).toThrow(LotSizeViolationError);
		});

		test("0.01 with stepSize 0.01 → no throw (aligned)", () => {
			expect(() => validator.checkStepSize("0.01", "0.01")).not.toThrow();
		});

		test("0.03 with stepSize 0.01 → no throw (multiple)", () => {
			expect(() => validator.checkStepSize("0.03", "0.01")).not.toThrow();
		});

		test("0.015 with stepSize 0.01 → throws (not aligned)", () => {
			expect(() => validator.checkStepSize("0.015", "0.01")).toThrow(LotSizeViolationError);
		});
	});

	describe("checkMinQty", () => {
		test("0.005 with minQty 0.01 → throws LotSizeViolationError", () => {
			expect(() => validator.checkMinQty("0.005", "0.01")).toThrow(LotSizeViolationError);
		});

		test("0.01 with minQty 0.01 → no throw (equal to min)", () => {
			expect(() => validator.checkMinQty("0.01", "0.01")).not.toThrow();
		});

		test("0.05 with minQty 0.01 → no throw (above min)", () => {
			expect(() => validator.checkMinQty("0.05", "0.01")).not.toThrow();
		});
	});

	describe("checkMaxQty", () => {
		test("200 with maxQty 100 → throws LotSizeViolationError", () => {
			expect(() => validator.checkMaxQty("200", "100")).toThrow(LotSizeViolationError);
		});

		test("50 with maxQty 100 → no throw (below max)", () => {
			expect(() => validator.checkMaxQty("50", "100")).not.toThrow();
		});

		test("100 with maxQty 100 → no throw (equal to max)", () => {
			expect(() => validator.checkMaxQty("100", "100")).not.toThrow();
		});
	});

	describe("checkMinNotional", () => {
		test("qty=0.001, price=10 → throws (0.001 * 10 = 0.01 < 20)", () => {
			expect(() => validator.checkMinNotional("0.001", "10", "20")).toThrow(LotSizeViolationError);
		});

		test("qty=10, price=5 → no throw (10 * 5 = 50 >= 20)", () => {
			expect(() => validator.checkMinNotional("10", "5", "20")).not.toThrow();
		});

		test("qty=4, price=5 → no throw (4 * 5 = 20 = minNotional)", () => {
			expect(() => validator.checkMinNotional("4", "5", "20")).not.toThrow();
		});

		test("qty=3, price=5 → throws (3 * 5 = 15 < 20)", () => {
			expect(() => validator.checkMinNotional("3", "5", "20")).toThrow(LotSizeViolationError);
		});
	});

	describe("validate", () => {
		test("happy path — returns step-rounded quantity string", () => {
			// 5.005 rounded down to stepSize 0.01 = 5.00, which satisfies all rules
			const result = validator.validate("5.005", "10", rules);
			expect(result).toBe("5");
		});

		test("exact aligned quantity passes through unchanged", () => {
			const result = validator.validate("5", "10", rules);
			expect(result).toBe("5");
		});

		test("quantity that rounds below minQty → throws after rounding", () => {
			// 0.005 rounded down with stepSize 0.01 = 0, which is below minQty 0.01
			expect(() => validator.validate("0.005", "10", rules)).toThrow(LotSizeViolationError);
		});

		test("quantity above maxQty → throws", () => {
			expect(() => validator.validate("200", "10", rules)).toThrow(LotSizeViolationError);
		});

		test("notional below minNotional → throws", () => {
			// qty=0.01 (minQty), price=1 → notional=0.01 < 20
			expect(() => validator.validate("0.01", "1", rules)).toThrow(LotSizeViolationError);
		});
	});

	describe("LotSizeViolationError", () => {
		test("has code ERR_USER_LOT_SIZE_VIOLATION", () => {
			const err = new LotSizeViolationError("step-size", "test message");
			expect(err.code).toBe("ERR_USER_LOT_SIZE_VIOLATION");
		});

		test("is instance of Error", () => {
			const err = new LotSizeViolationError("min-qty", "too small");
			expect(err).toBeInstanceOf(Error);
		});

		test("name is LotSizeViolationError", () => {
			const err = new LotSizeViolationError("max-qty", "too large");
			expect(err.name).toBe("LotSizeViolationError");
		});

		test("message includes violated rule", () => {
			const err = new LotSizeViolationError("min-notional", "notional too low");
			expect(err.message).toContain("min-notional");
		});
	});
});
