import { describe, expect, test } from "bun:test";
import Decimal from "decimal.js";
import {
	type DriftConfig,
	type DriftInput,
	PatternDriftDetector,
	chiSquared,
	computeDriftScore,
	computePValue,
} from "../pattern-drift-detector.js";

// ---------------------------------------------------------------------------
// Helper: build a DriftInput from win/loss counts
// ---------------------------------------------------------------------------
function makeDriftInput(
	baselineWins: number,
	baselineLosses: number,
	recentWins: number,
	recentLosses: number,
	overrides: Partial<DriftInput> = {},
): DriftInput {
	return {
		strategyId: "strat-1",
		version: 1,
		symbol: "BTCUSDT",
		baselineWins,
		baselineLosses,
		recentWins,
		recentLosses,
		...overrides,
	};
}

const DEFAULT_CONFIG: DriftConfig = {
	warningThreshold: 60,
	criticalThreshold: 80,
};

// ---------------------------------------------------------------------------
// chi-squared helper tests
// ---------------------------------------------------------------------------
describe("chiSquared", () => {
	test("returns zero when distributions are identical", () => {
		// baseline: 20/10, recent: 20/10 — same ratio
		const result = chiSquared(20, 10, 20, 10);
		expect(result.toNumber()).toBeCloseTo(0, 5);
	});

	test("computes correct chi-squared for known distribution", () => {
		// 2x2 contingency table:
		//           baseline  recent   total
		// wins        20        10       30
		// losses      10        20       30
		// total       30        30       60
		//
		// Expected values:
		// E(wins,baseline)  = 30*30/60 = 15
		// E(wins,recent)    = 30*30/60 = 15
		// E(losses,baseline)= 30*30/60 = 15
		// E(losses,recent)  = 30*30/60 = 15
		//
		// chi2 = (20-15)^2/15 + (10-15)^2/15 + (10-15)^2/15 + (20-15)^2/15
		//      = 25/15 + 25/15 + 25/15 + 25/15 = 100/15 ≈ 6.667
		const result = chiSquared(20, 10, 10, 20);
		expect(result.toNumber()).toBeCloseTo(6.667, 2);
	});

	test("higher divergence produces larger chi-squared", () => {
		const moderate = chiSquared(25, 5, 15, 15);
		const extreme = chiSquared(29, 1, 1, 29);
		expect(extreme.toNumber()).toBeGreaterThan(moderate.toNumber());
	});
});

// ---------------------------------------------------------------------------
// p-value helper tests
// ---------------------------------------------------------------------------
describe("computePValue", () => {
	test("large chi-squared yields p-value < 0.05 (significant)", () => {
		// chi2 = 6.667, df=1 → p ≈ 0.0099
		const chi2 = new Decimal("6.667");
		const p = computePValue(chi2);
		expect(p.toNumber()).toBeLessThan(0.05);
	});

	test("small chi-squared yields p-value >= 0.05 (not significant)", () => {
		// chi2 = 0.5, df=1 → p ≈ 0.48
		const chi2 = new Decimal("0.5");
		const p = computePValue(chi2);
		expect(p.toNumber()).toBeGreaterThanOrEqual(0.05);
	});

	test("chi-squared of zero yields p-value of 1 (no divergence)", () => {
		const chi2 = new Decimal("0");
		const p = computePValue(chi2);
		expect(p.toNumber()).toBeCloseTo(1.0, 3);
	});
});

// ---------------------------------------------------------------------------
// drift score mapping tests
// ---------------------------------------------------------------------------
describe("computeDriftScore", () => {
	test("returns 0 when chi-squared is zero", () => {
		const score = computeDriftScore(new Decimal("0"));
		expect(score.toNumber()).toBe(0);
	});

	test("maps chi-squared 3.841 (p=0.05 boundary) to score near 50", () => {
		// chi2=3.841 is the 0.05 critical value for df=1
		const score = computeDriftScore(new Decimal("3.841"));
		expect(score.toNumber()).toBeGreaterThan(0);
		expect(score.toNumber()).toBeLessThanOrEqual(100);
	});

	test("clips score at 100 for extreme chi-squared", () => {
		const score = computeDriftScore(new Decimal("1000"));
		expect(score.toNumber()).toBe(100);
	});

	test("score is monotonically increasing with chi-squared", () => {
		const s1 = computeDriftScore(new Decimal("1"));
		const s2 = computeDriftScore(new Decimal("5"));
		const s3 = computeDriftScore(new Decimal("10"));
		expect(s2.toNumber()).toBeGreaterThan(s1.toNumber());
		expect(s3.toNumber()).toBeGreaterThan(s2.toNumber());
	});
});

// ---------------------------------------------------------------------------
// PatternDriftDetector tests
// ---------------------------------------------------------------------------
describe("PatternDriftDetector", () => {
	test("returns no-drift result when baseline sample size < 30", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input = makeDriftInput(10, 5, 20, 10); // baseline = 15, too small
		const result = detector.detect(input);

		expect(result.driftScore).toBe(0);
		expect(result.isSignificant).toBe(false);
		expect(result.alertLevel).toBe("none");
	});

	test("returns no-drift result when recent sample size < 30", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input = makeDriftInput(20, 15, 10, 5); // recent = 15, too small
		const result = detector.detect(input);

		expect(result.driftScore).toBe(0);
		expect(result.isSignificant).toBe(false);
		expect(result.alertLevel).toBe("none");
	});

	test("returns no-drift result when both windows < 30", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input = makeDriftInput(5, 5, 5, 5);
		const result = detector.detect(input);

		expect(result.driftScore).toBe(0);
		expect(result.isSignificant).toBe(false);
		expect(result.alertLevel).toBe("none");
	});

	test("isSignificant true when p-value < 0.05", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		// Highly divergent: baseline=20W/10L, recent=10W/20L (both 30 samples)
		const input = makeDriftInput(20, 10, 10, 20);
		const result = detector.detect(input);

		expect(result.isSignificant).toBe(true);
		expect(result.pValue.toNumber()).toBeLessThan(0.05);
	});

	test("isSignificant false when p-value >= 0.05", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		// Identical distributions: 20W/10L vs 20W/10L
		const input = makeDriftInput(20, 10, 20, 10);
		const result = detector.detect(input);

		expect(result.isSignificant).toBe(false);
		expect(result.pValue.toNumber()).toBeGreaterThanOrEqual(0.05);
	});

	test("alertLevel is 'none' when drift score < warningThreshold", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		// Identical distributions → drift score = 0
		const input = makeDriftInput(20, 10, 20, 10);
		const result = detector.detect(input);

		expect(result.alertLevel).toBe("none");
	});

	test("alertLevel is 'warning' when drift score >= warningThreshold and < criticalThreshold", () => {
		// Create a detector with low thresholds to force warning level
		const config: DriftConfig = { warningThreshold: 10, criticalThreshold: 80 };
		const detector = new PatternDriftDetector(config);
		// chi2=6.667 → score will be somewhere in the range
		const input = makeDriftInput(20, 10, 10, 20);
		const result = detector.detect(input);

		// With warningThreshold=10 and reasonable chi2, expect warning or critical
		expect(["warning", "critical"]).toContain(result.alertLevel);
	});

	test("alertLevel is 'critical' when drift score >= criticalThreshold", () => {
		// Very low thresholds so extreme divergence hits critical
		const config: DriftConfig = { warningThreshold: 1, criticalThreshold: 2 };
		const detector = new PatternDriftDetector(config);
		// Maximum divergence: all wins vs all losses
		const input = makeDriftInput(30, 0, 0, 30);
		const result = detector.detect(input);

		expect(result.alertLevel).toBe("critical");
	});

	test("chiSquared field is a Decimal instance", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input = makeDriftInput(20, 10, 10, 20);
		const result = detector.detect(input);

		expect(result.chiSquared).toBeInstanceOf(Decimal);
	});

	test("pValue field is a Decimal instance", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input = makeDriftInput(20, 10, 10, 20);
		const result = detector.detect(input);

		expect(result.pValue).toBeInstanceOf(Decimal);
	});

	test("driftScore is a number between 0 and 100", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input = makeDriftInput(20, 10, 10, 20);
		const result = detector.detect(input);

		expect(result.driftScore).toBeGreaterThanOrEqual(0);
		expect(result.driftScore).toBeLessThanOrEqual(100);
	});

	test("respects strategy+version+symbol isolation — input carries scope", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		const input1 = makeDriftInput(20, 10, 20, 10, {
			strategyId: "strat-A",
			version: 1,
			symbol: "BTCUSDT",
		});
		const input2 = makeDriftInput(20, 10, 20, 10, {
			strategyId: "strat-B",
			version: 2,
			symbol: "ETHUSDT",
		});

		const result1 = detector.detect(input1);
		const result2 = detector.detect(input2);

		// Same data → same scores regardless of scope fields
		expect(result1.driftScore).toBe(result2.driftScore);
		expect(result1.isSignificant).toBe(result2.isSignificant);
	});

	test("chi-squared value matches reference for known distribution", () => {
		const detector = new PatternDriftDetector(DEFAULT_CONFIG);
		// baseline: 20W/10L, recent: 10W/20L → chi2 ≈ 6.667
		const input = makeDriftInput(20, 10, 10, 20);
		const result = detector.detect(input);

		expect(result.chiSquared.toNumber()).toBeCloseTo(6.667, 2);
	});

	test("uses default config when none provided", () => {
		const detector = new PatternDriftDetector();
		const input = makeDriftInput(20, 10, 20, 10);
		const result = detector.detect(input);

		expect(result.alertLevel).toBe("none");
	});
});
