import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	LiquidationWarningMonitor,
	isNearLiquidation,
	type LiquidationPosition,
	type LiquidationWarningDeps,
} from "../liquidation-warning-monitor.js";

// --- isNearLiquidation pure function ---

describe("isNearLiquidation()", () => {
	describe("LONG positions", () => {
		test("returns true when mark price is within threshold of liquidation", () => {
			// proximity = (markPrice - liquidationPrice) / liquidationPrice
			// = (45500 - 45000) / 45000 = 0.0111... => ~1.11%
			// threshold = 5% → within threshold → true
			expect(isNearLiquidation("45500", "45000", "LONG", 5)).toBe(true);
		});

		test("returns false when mark price is far from liquidation", () => {
			// proximity = (55000 - 45000) / 45000 = 0.222... => ~22.2%
			// threshold = 5% → outside threshold → false
			expect(isNearLiquidation("55000", "45000", "LONG", 5)).toBe(false);
		});

		test("returns true when mark price exactly at threshold boundary", () => {
			// proximity = (47250 - 45000) / 45000 = 0.05 => exactly 5%
			// threshold = 5% → at boundary → true
			expect(isNearLiquidation("47250", "45000", "LONG", 5)).toBe(true);
		});

		test("returns true when mark price is below liquidation (already liquidated zone)", () => {
			// proximity would be negative for LONG below liquidation
			// (44000 - 45000) / 45000 = -0.0222... → negative proximity
			// negative < threshold → true (extremely dangerous)
			expect(isNearLiquidation("44000", "45000", "LONG", 5)).toBe(true);
		});
	});

	describe("SHORT positions", () => {
		test("returns true when mark price is within threshold of liquidation", () => {
			// proximity = (liquidationPrice - markPrice) / liquidationPrice
			// = (55000 - 54000) / 55000 = 0.01818... => ~1.82%
			// threshold = 5% → within threshold → true
			expect(isNearLiquidation("54000", "55000", "SHORT", 5)).toBe(true);
		});

		test("returns false when mark price is far from liquidation", () => {
			// proximity = (55000 - 45000) / 55000 = 0.1818... => ~18.2%
			// threshold = 5% → outside threshold → false
			expect(isNearLiquidation("45000", "55000", "SHORT", 5)).toBe(false);
		});

		test("returns true when mark price exactly at threshold boundary", () => {
			// proximity = (55000 - 52250) / 55000 = 0.05 => exactly 5%
			// threshold = 5% → at boundary → true
			expect(isNearLiquidation("52250", "55000", "SHORT", 5)).toBe(true);
		});

		test("returns true when mark price is above liquidation (already liquidated zone)", () => {
			// proximity = (55000 - 56000) / 55000 = -0.01818... → negative
			// negative < threshold → true
			expect(isNearLiquidation("56000", "55000", "SHORT", 5)).toBe(true);
		});
	});

	describe("edge cases", () => {
		test("handles zero threshold", () => {
			// Only at exactly liquidation price (proximity = 0) would be ≤ 0
			// proximity = (45500 - 45000) / 45000 = 0.011... > 0
			expect(isNearLiquidation("45500", "45000", "LONG", 0)).toBe(false);
		});

		test("handles large threshold covers all positions", () => {
			expect(isNearLiquidation("90000", "45000", "LONG", 100)).toBe(true);
		});
	});
});

// --- LiquidationWarningMonitor class ---

function makePosition(overrides: Partial<LiquidationPosition> = {}): LiquidationPosition {
	return {
		positionId: "pos-1",
		symbol: "BTCUSDT",
		side: "LONG",
		markPrice: "45500",
		liquidationPrice: "45000",
		...overrides,
	};
}

function makeDeps(overrides: Partial<LiquidationWarningDeps> = {}): LiquidationWarningDeps {
	return {
		sendWarning: mock(async () => {}),
		...overrides,
	};
}

describe("LiquidationWarningMonitor", () => {
	describe("check()", () => {
		test("calls sendWarning for position within threshold", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			const position = makePosition(); // proximity ~1.1%, within 5%
			await monitor.check([position], deps);
			expect(deps.sendWarning).toHaveBeenCalledTimes(1);
			expect(deps.sendWarning).toHaveBeenCalledWith(position);
		});

		test("does not call sendWarning for position outside threshold", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			const position = makePosition({
				markPrice: "55000",
				liquidationPrice: "45000",
			}); // proximity ~22%, outside 5%
			await monitor.check([position], deps);
			expect(deps.sendWarning).not.toHaveBeenCalled();
		});

		test("cooldown prevents second warning within cooldown window", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			const position = makePosition();
			await monitor.check([position], deps);
			await monitor.check([position], deps);
			// second call should be suppressed by cooldown
			expect(deps.sendWarning).toHaveBeenCalledTimes(1);
		});

		test("allows warning after cooldown expires", async () => {
			const deps = makeDeps();
			// Use very short cooldown that we can advance past
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 100 });
			const position = makePosition();
			await monitor.check([position], deps);
			// Wait for cooldown to expire
			await new Promise((resolve) => setTimeout(resolve, 150));
			await monitor.check([position], deps);
			expect(deps.sendWarning).toHaveBeenCalledTimes(2);
		});

		test("independent cooldowns per positionId", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			const pos1 = makePosition({ positionId: "pos-1" });
			const pos2 = makePosition({ positionId: "pos-2", markPrice: "45100" });
			await monitor.check([pos1], deps);
			await monitor.check([pos2], deps);
			// both should fire independently
			expect(deps.sendWarning).toHaveBeenCalledTimes(2);
		});

		test("processes multiple positions in one call", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			const nearPos = makePosition({ positionId: "near" });
			const farPos = makePosition({
				positionId: "far",
				markPrice: "55000",
				liquidationPrice: "45000",
			});
			await monitor.check([nearPos, farPos], deps);
			// Only near position should trigger warning
			expect(deps.sendWarning).toHaveBeenCalledTimes(1);
			expect(deps.sendWarning).toHaveBeenCalledWith(nearPos);
		});

		test("SHORT position within threshold triggers warning", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			const position = makePosition({
				side: "SHORT",
				markPrice: "54000",
				liquidationPrice: "55000",
			}); // proximity ~1.82%, within 5%
			await monitor.check([position], deps);
			expect(deps.sendWarning).toHaveBeenCalledWith(position);
		});

		test("empty positions array does nothing", async () => {
			const deps = makeDeps();
			const monitor = new LiquidationWarningMonitor({ thresholdPct: 5, cooldownMs: 60_000 });
			await monitor.check([], deps);
			expect(deps.sendWarning).not.toHaveBeenCalled();
		});
	});
});
