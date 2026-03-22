import { describe, expect, test } from "bun:test";
import {
	PositionSizeError,
	calculateQuantity,
	checkExposure,
	checkLeverage,
	roundToStepSize,
	sizePosition,
	validateQuantity,
} from "../position-sizer.js";
import type { PositionSizeConfig } from "../types.js";

const config: PositionSizeConfig = {
	riskPct: 0.01,
	stepSize: "0.001",
	minQty: "0.001",
	maxQty: "10",
	maxExposureUsd: "100000",
	maxLeverage: 20,
};

describe("PositionSizer", () => {
	describe("calculateQuantity", () => {
		test("(10000, 50000, 0.01, riskPct=0.01) → 0.2", () => {
			// (10000 * 0.01) / (50000 * 0.01) = 100 / 500 = 0.2
			const qty = calculateQuantity("10000", "50000", 0.01, config);
			expect(qty).toBe("0.2");
		});
	});

	describe("roundToStepSize", () => {
		test("2.567 with stepSize 0.001 → 2.567 (already aligned)", () => {
			expect(roundToStepSize("2.567", "0.001")).toBe("2.567");
		});

		test("2.5679 with stepSize 0.001 → 2.567 (floor)", () => {
			expect(roundToStepSize("2.5679", "0.001")).toBe("2.567");
		});

		test("0.0005 with stepSize 0.001 → 0 (floors below stepSize)", () => {
			expect(roundToStepSize("0.0005", "0.001")).toBe("0");
		});
	});

	describe("validateQuantity", () => {
		test("quantity below minQty → throws PositionSizeError", () => {
			expect(() => validateQuantity("0.0001", config)).toThrow(PositionSizeError);
		});

		test("quantity above maxQty → throws PositionSizeError", () => {
			expect(() => validateQuantity("11", config)).toThrow(PositionSizeError);
		});

		test("quantity in valid range → no throw", () => {
			expect(() => validateQuantity("0.5", config)).not.toThrow();
		});
	});

	describe("checkExposure", () => {
		test("800 + 300 vs cap 1000 → throws", () => {
			const tightConfig = { ...config, maxExposureUsd: "1000" };
			expect(() => checkExposure("800", "300", tightConfig)).toThrow(PositionSizeError);
		});

		test("500 + 300 vs cap 1000 → no throw", () => {
			const tightConfig = { ...config, maxExposureUsd: "1000" };
			expect(() => checkExposure("500", "300", tightConfig)).not.toThrow();
		});
	});

	describe("checkLeverage", () => {
		test("notional 50000, balance 1000, maxLeverage 20 → throws (50x)", () => {
			expect(() => checkLeverage("50000", "1000", config)).toThrow(PositionSizeError);
		});

		test("notional 10000, balance 1000, maxLeverage 20 → no throw (10x)", () => {
			expect(() => checkLeverage("10000", "1000", config)).not.toThrow();
		});
	});

	describe("sizePosition", () => {
		test("happy path → returns correct result", () => {
			const result = sizePosition("10000", "50000", 0.01, "0", config);
			expect(result.quantity).toBe("0.2");
			// notional = 0.2 * 50000 = 10000
			expect(result.notionalUsd).toBe("10000");
			// leverage = 10000 / 10000 = 1
			expect(result.effectiveLeverage).toBe("1");
		});

		test("exposure breach → throws PositionSizeError", () => {
			const tightConfig = { ...config, maxExposureUsd: "5000" };
			// notional would be 10000, current 0, but cap is 5000
			expect(() => sizePosition("10000", "50000", 0.01, "0", tightConfig)).toThrow(
				PositionSizeError,
			);
		});

		test("leverage breach → throws PositionSizeError", () => {
			const tightConfig = { ...config, maxLeverage: 0.5 };
			// leverage = 10000 / 10000 = 1x, but max is 0.5x
			expect(() => sizePosition("10000", "50000", 0.01, "0", tightConfig)).toThrow(
				PositionSizeError,
			);
		});
	});
});
