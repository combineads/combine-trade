import { describe, expect, test } from "bun:test";
import { type FeatureInput, computeFeatures, computeTargets } from "../features.js";

function makeFeatureInput(overrides: Partial<FeatureInput> = {}): FeatureInput {
	return {
		pattern: { variant: "trend_continuation", side: "bullish" },
		evidence: {
			candlePattern: { hit: true, pattern: "hammer" },
			maEvidence: { hit: true, ordering: true, slope: "bullish" },
			separation: { hit: true, distance: 0.02 },
			h1Bias: { hit: true, bias: "aligned" },
			familyHitCount: 4,
		},
		close: 100,
		bb20Upper: 105,
		bb20Lower: 95,
		volume: 1500,
		avgVolume20: 1000,
		candleRange: 3,
		atr14: 2,
		...overrides,
	};
}

describe("computeFeatures", () => {
	test("returns exactly 10 features", () => {
		const input = makeFeatureInput();
		const features = computeFeatures(input);
		expect(Object.keys(features)).toHaveLength(10);
	});

	test("all features are in [0, 1] range", () => {
		const input = makeFeatureInput();
		const features = computeFeatures(input);
		for (const [_key, value] of Object.entries(features)) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});

	test("double_bb_variant: trend=0.33, reversal=0.67, breakout=1.0", () => {
		expect(
			computeFeatures(
				makeFeatureInput({ pattern: { variant: "trend_continuation", side: "bullish" } }),
			).double_bb_variant,
		).toBeCloseTo(0.33, 1);

		expect(
			computeFeatures(makeFeatureInput({ pattern: { variant: "reversal", side: "bullish" } }))
				.double_bb_variant,
		).toBeCloseTo(0.67, 1);

		expect(
			computeFeatures(makeFeatureInput({ pattern: { variant: "breakout", side: "bullish" } }))
				.double_bb_variant,
		).toBeCloseTo(1.0, 1);
	});

	test("candle_pattern_score: hit=1, miss=0", () => {
		const hitInput = makeFeatureInput({
			evidence: {
				candlePattern: { hit: true, pattern: "hammer" },
				maEvidence: { hit: true, ordering: true, slope: "bullish" },
				separation: { hit: true, distance: 0.02 },
				h1Bias: { hit: true, bias: "aligned" },
				familyHitCount: 4,
			},
		});
		expect(computeFeatures(hitInput).candle_pattern_score).toBe(1);

		const missInput = makeFeatureInput({
			evidence: {
				candlePattern: { hit: false, pattern: "none" },
				maEvidence: { hit: true, ordering: true, slope: "bullish" },
				separation: { hit: true, distance: 0.02 },
				h1Bias: { hit: true, bias: "aligned" },
				familyHitCount: 3,
			},
		});
		expect(computeFeatures(missInput).candle_pattern_score).toBe(0);
	});

	test("h1_bias_alignment: counter=0, neutral=0.5, aligned=1.0", () => {
		const aligned = makeFeatureInput({
			evidence: {
				candlePattern: { hit: true, pattern: "hammer" },
				maEvidence: { hit: true, ordering: true, slope: "bullish" },
				separation: { hit: true, distance: 0.02 },
				h1Bias: { hit: true, bias: "aligned" },
				familyHitCount: 4,
			},
		});
		expect(computeFeatures(aligned).h1_bias_alignment).toBe(1.0);

		const neutral = makeFeatureInput({
			evidence: {
				candlePattern: { hit: true, pattern: "hammer" },
				maEvidence: { hit: true, ordering: true, slope: "bullish" },
				separation: { hit: true, distance: 0.02 },
				h1Bias: { hit: false, bias: "neutral_bias" },
				familyHitCount: 3,
			},
		});
		expect(computeFeatures(neutral).h1_bias_alignment).toBe(0.5);

		const counter = makeFeatureInput({
			evidence: {
				candlePattern: { hit: true, pattern: "hammer" },
				maEvidence: { hit: true, ordering: true, slope: "bullish" },
				separation: { hit: true, distance: 0.02 },
				h1Bias: { hit: false, bias: "counter_trend" },
				familyHitCount: 3,
			},
		});
		expect(computeFeatures(counter).h1_bias_alignment).toBe(0);
	});

	test("price_in_bb20: percent position within BB20 bands", () => {
		// Close at BB20 lower → 0
		const atLower = computeFeatures(makeFeatureInput({ close: 95, bb20Upper: 105, bb20Lower: 95 }));
		expect(atLower.price_in_bb20).toBeCloseTo(0, 1);

		// Close at BB20 upper → 1
		const atUpper = computeFeatures(
			makeFeatureInput({ close: 105, bb20Upper: 105, bb20Lower: 95 }),
		);
		expect(atUpper.price_in_bb20).toBeCloseTo(1, 1);

		// Close at BB20 middle → 0.5
		const atMiddle = computeFeatures(
			makeFeatureInput({ close: 100, bb20Upper: 105, bb20Lower: 95 }),
		);
		expect(atMiddle.price_in_bb20).toBeCloseTo(0.5, 1);
	});

	test("volume_ratio: percentile-based, clamped to [0, 1]", () => {
		// Normal volume
		const normal = computeFeatures(makeFeatureInput({ volume: 1000, avgVolume20: 1000 }));
		expect(normal.volume_ratio).toBeGreaterThanOrEqual(0);
		expect(normal.volume_ratio).toBeLessThanOrEqual(1);

		// High volume should give higher ratio
		const high = computeFeatures(makeFeatureInput({ volume: 3000, avgVolume20: 1000 }));
		expect(high.volume_ratio).toBeGreaterThan(normal.volume_ratio);
	});

	test("ma_ordering_score and ma_reaction_score are boolean 0/1", () => {
		const features = computeFeatures(makeFeatureInput());
		expect(features.ma_ordering_score === 0 || features.ma_ordering_score === 1).toBe(true);
		expect(features.ma_reaction_score === 0 || features.ma_reaction_score === 1).toBe(true);
	});
});

describe("computeTargets", () => {
	test("LONG: TP = entry + ATR*2, SL = entry - ATR*1", () => {
		const result = computeTargets("bullish", 100, 2);

		expect(result.takeProfit).toBe(104);
		expect(result.stopLoss).toBe(98);
		expect(result.maxHoldBars).toBe(60);
	});

	test("SHORT: TP = entry - ATR*2, SL = entry + ATR*1", () => {
		const result = computeTargets("bearish", 100, 2);

		expect(result.takeProfit).toBe(96);
		expect(result.stopLoss).toBe(102);
		expect(result.maxHoldBars).toBe(60);
	});

	test("custom maxHoldBars", () => {
		const result = computeTargets("bullish", 100, 2, 30);

		expect(result.maxHoldBars).toBe(30);
	});
});
