import { describe, expect, test } from "bun:test";
import { confidenceTier, wilsonScoreCI } from "../confidence.js";
import { judge } from "../engine.js";
import type { DecisionInput } from "../types.js";

describe("wilsonScoreCI", () => {
	test("returns correct CI for known values", () => {
		// n=100, winrate=0.6 → known Wilson interval
		const { lower, upper } = wilsonScoreCI(0.6, 100);
		expect(lower).toBeCloseTo(0.502, 2);
		expect(upper).toBeCloseTo(0.691, 2);
	});

	test("narrow CI for large sample", () => {
		const { lower, upper } = wilsonScoreCI(0.6, 1000);
		expect(upper - lower).toBeLessThan(0.1);
	});

	test("wide CI for small sample", () => {
		const { lower, upper } = wilsonScoreCI(0.6, 30);
		expect(upper - lower).toBeGreaterThan(0.2);
	});

	test("CI is within [0,1]", () => {
		const { lower, upper } = wilsonScoreCI(0.99, 30);
		expect(lower).toBeGreaterThanOrEqual(0);
		expect(upper).toBeLessThanOrEqual(1);
	});
});

describe("confidenceTier", () => {
	test("Low: 30-59", () => {
		expect(confidenceTier(30)).toBe("low");
		expect(confidenceTier(59)).toBe("low");
	});

	test("Medium: 60-149", () => {
		expect(confidenceTier(60)).toBe("medium");
		expect(confidenceTier(149)).toBe("medium");
	});

	test("High: 150-299", () => {
		expect(confidenceTier(150)).toBe("high");
		expect(confidenceTier(299)).toBe("high");
	});

	test("Very High: >= 300", () => {
		expect(confidenceTier(300)).toBe("very_high");
		expect(confidenceTier(1000)).toBe("very_high");
	});

	test("Below 30 → low", () => {
		expect(confidenceTier(10)).toBe("low");
	});
});

describe("judge", () => {
	const baseStats: DecisionInput = {
		winrate: 0.6,
		avgWin: 2.0,
		avgLoss: 1.0,
		expectancy: 0.8,
		sampleCount: 50,
	};

	test("criteria met → returns strategy direction (long)", () => {
		const result = judge(baseStats, "long");
		expect(result.decision).toBe("LONG");
		expect(result.reason).toBe("criteria_met");
	});

	test("criteria met → returns strategy direction (short)", () => {
		const result = judge(baseStats, "short");
		expect(result.decision).toBe("SHORT");
		expect(result.reason).toBe("criteria_met");
	});

	test("insufficient samples → PASS", () => {
		const result = judge({ ...baseStats, sampleCount: 20 }, "long");
		expect(result.decision).toBe("PASS");
		expect(result.reason).toBe("insufficient_samples");
	});

	test("low winrate → PASS", () => {
		const result = judge({ ...baseStats, winrate: 0.4 }, "long");
		expect(result.decision).toBe("PASS");
		expect(result.reason).toBe("low_winrate");
	});

	test("negative expectancy → PASS", () => {
		const result = judge({ ...baseStats, expectancy: -0.1 }, "long");
		expect(result.decision).toBe("PASS");
		expect(result.reason).toBe("negative_expectancy");
	});

	test("exactly 30 samples, 55% winrate, 0+ expectancy → LONG", () => {
		const result = judge(
			{ winrate: 0.55, avgWin: 1.0, avgLoss: 0.5, expectancy: 0.325, sampleCount: 30 },
			"long",
		);
		expect(result.decision).toBe("LONG");
	});

	test("custom config overrides defaults", () => {
		// Would pass default thresholds but fails custom
		const result = judge(baseStats, "long", { minWinrate: 0.7 });
		expect(result.decision).toBe("PASS");
		expect(result.reason).toBe("low_winrate");
	});

	test("custom config with lower thresholds", () => {
		const lowStats: DecisionInput = {
			winrate: 0.45,
			avgWin: 3.0,
			avgLoss: 1.0,
			expectancy: 0.8,
			sampleCount: 30,
		};
		// Fails default (winrate < 0.55) but passes custom
		const result = judge(lowStats, "long", { minWinrate: 0.4 });
		expect(result.decision).toBe("LONG");
	});

	test("result includes CI and confidence tier", () => {
		const result = judge(baseStats, "long");
		expect(result.ciLower).toBeDefined();
		expect(result.ciUpper).toBeDefined();
		expect(result.ciLower).toBeLessThan(result.ciUpper);
		expect(result.confidenceTier).toBe("low"); // sampleCount=50
	});

	test("result includes statistics passthrough", () => {
		const result = judge(baseStats, "long");
		expect(result.statistics).toEqual(baseStats);
	});

	test("priority: insufficient_samples checked first", () => {
		const result = judge(
			{ winrate: 0.3, avgWin: 0, avgLoss: 1, expectancy: -1, sampleCount: 10 },
			"long",
		);
		expect(result.reason).toBe("insufficient_samples");
	});
});
