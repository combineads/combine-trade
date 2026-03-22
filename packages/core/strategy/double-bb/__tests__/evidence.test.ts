import { describe, expect, test } from "bun:test";
import type { CandleBar } from "../detector.js";
import {
	type EvidenceInput,
	type EvidenceResult,
	type MaBias,
	evaluateEvidence,
} from "../evidence.js";

function makeCandle(overrides: Partial<CandleBar> = {}): CandleBar {
	return {
		open: 100,
		high: 102,
		low: 98,
		close: 101,
		volume: 1000,
		...overrides,
	};
}

function makeDefaultInput(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
	return {
		candle: makeCandle(),
		side: "bullish",
		ma20: 100,
		ma50: 99,
		ma100: 98,
		ma200: 97,
		prevMa20: 99.8,
		prevMa50: 98.9,
		h1Bias: "aligned" as MaBias,
		...overrides,
	};
}

describe("evaluateEvidence", () => {
	describe("candle_pattern family", () => {
		test("hammer detected: small body + long lower wick (bullish)", () => {
			// body = |96.5 - 96| = 0.5, range = 98 - 95 = 3
			// body ratio = 0.5/3 = 16.7% (<= 35%)
			// lower wick = min(96, 96.5) - 95 = 1.0, upper wick = 98 - 96.5 = 1.5
			// dominant wick (lower for bullish) = 1.0, ratio = 1.0/3 = 33%
			// Actually need dominant wick >= 55%
			// Better: body = 0.3, range = 2, lower wick = 1.3
			const candle = makeCandle({ open: 97.5, high: 98, low: 96, close: 97.8 });
			// body = 0.3, range = 2, body ratio = 15% (<= 35%)
			// lower wick = 97.5 - 96 = 1.5, ratio = 75% (>= 55%) ✓
			const input = makeDefaultInput({ candle, side: "bullish" });
			const result = evaluateEvidence(input);
			expect(result.candlePattern.hit).toBe(true);
			expect(result.candlePattern.pattern).toBe("hammer");
		});

		test("inverted hammer detected (bearish)", () => {
			// For bearish: dominant wick is upper
			const candle = makeCandle({ open: 102, high: 104, low: 101.8, close: 101.7 });
			// body = 0.3, range = 2.2, body ratio = 13.6% (<= 35%)
			// upper wick = 104 - 102 = 2.0, ratio = 91% (>= 55%) ✓
			const input = makeDefaultInput({ candle, side: "bearish" });
			const result = evaluateEvidence(input);
			expect(result.candlePattern.hit).toBe(true);
			expect(result.candlePattern.pattern).toBe("inverted_hammer");
		});

		test("doji detected: body <= 10% of range", () => {
			const candle = makeCandle({ open: 100.05, high: 101, low: 99, close: 100.0 });
			// body = 0.05, range = 2, ratio = 2.5% (<= 10%)
			const input = makeDefaultInput({ candle });
			const result = evaluateEvidence(input);
			expect(result.candlePattern.hit).toBe(true);
			expect(result.candlePattern.pattern).toBe("doji");
		});

		test("strong body detected: body >= 70% of range", () => {
			const candle = makeCandle({ open: 99.2, high: 101, low: 99, close: 100.8 });
			// body = 1.6, range = 2, ratio = 80% (>= 70%)
			const input = makeDefaultInput({ candle });
			const result = evaluateEvidence(input);
			expect(result.candlePattern.hit).toBe(true);
			expect(result.candlePattern.pattern).toBe("strong_body");
		});

		test("no candle pattern: moderate body", () => {
			const candle = makeCandle({ open: 99.5, high: 101, low: 99, close: 100.5 });
			// body = 1.0, range = 2, ratio = 50% — no pattern
			const input = makeDefaultInput({ candle });
			const result = evaluateEvidence(input);
			expect(result.candlePattern.hit).toBe(false);
		});
	});

	describe("ma_evidence family", () => {
		test("bullish MA ordering: MA20 > MA50 > MA100 > MA200 with rising slope", () => {
			const input = makeDefaultInput({
				side: "bullish",
				ma20: 103,
				ma50: 101,
				ma100: 99,
				ma200: 97,
				prevMa20: 102.5,
				prevMa50: 100.8,
			});
			const result = evaluateEvidence(input);
			expect(result.maEvidence.hit).toBe(true);
			expect(result.maEvidence.ordering).toBe(true);
			expect(result.maEvidence.slope).toBe("bullish");
		});

		test("bearish MA ordering: MA20 < MA50 < MA100 < MA200 with falling slope", () => {
			const input = makeDefaultInput({
				side: "bearish",
				ma20: 95,
				ma50: 97,
				ma100: 99,
				ma200: 101,
				prevMa20: 95.5,
				prevMa50: 97.2,
			});
			const result = evaluateEvidence(input);
			expect(result.maEvidence.hit).toBe(true);
			expect(result.maEvidence.ordering).toBe(true);
			expect(result.maEvidence.slope).toBe("bearish");
		});

		test("mixed MA ordering: hit is false", () => {
			const input = makeDefaultInput({
				side: "bullish",
				ma20: 101,
				ma50: 103, // out of order
				ma100: 99,
				ma200: 97,
				prevMa20: 100.5,
				prevMa50: 102.8,
			});
			const result = evaluateEvidence(input);
			expect(result.maEvidence.ordering).toBe(false);
		});
	});

	describe("separation family", () => {
		test("positive separation for bullish when price above MA20", () => {
			const candle = makeCandle({ close: 105 });
			const input = makeDefaultInput({ candle, ma20: 100 });
			const result = evaluateEvidence(input);
			expect(result.separation.distance).toBeGreaterThan(0);
			expect(result.separation.hit).toBe(true);
		});

		test("negative separation for bearish when price below MA20", () => {
			const candle = makeCandle({ close: 95 });
			const input = makeDefaultInput({ candle, side: "bearish", ma20: 100 });
			const result = evaluateEvidence(input);
			expect(result.separation.distance).toBeLessThan(0);
			expect(result.separation.hit).toBe(true);
		});

		test("hit is false when separation contradicts side", () => {
			// Bullish but price below MA20
			const candle = makeCandle({ close: 95 });
			const input = makeDefaultInput({ candle, side: "bullish", ma20: 100 });
			const result = evaluateEvidence(input);
			expect(result.separation.hit).toBe(false);
		});
	});

	describe("h1_bias family", () => {
		test("aligned bias is a hit", () => {
			const input = makeDefaultInput({ h1Bias: "aligned" });
			const result = evaluateEvidence(input);
			expect(result.h1Bias.hit).toBe(true);
			expect(result.h1Bias.bias).toBe("aligned");
		});

		test("counter_trend bias is not a hit", () => {
			const input = makeDefaultInput({ h1Bias: "counter_trend" });
			const result = evaluateEvidence(input);
			expect(result.h1Bias.hit).toBe(false);
			expect(result.h1Bias.bias).toBe("counter_trend");
		});

		test("neutral_bias is not a hit", () => {
			const input = makeDefaultInput({ h1Bias: "neutral_bias" });
			const result = evaluateEvidence(input);
			expect(result.h1Bias.hit).toBe(false);
			expect(result.h1Bias.bias).toBe("neutral_bias");
		});
	});

	describe("family count", () => {
		test("all 4 families hit when conditions aligned", () => {
			// Strong body candle, bullish MAs, positive separation, aligned bias
			const candle = makeCandle({ open: 99.2, high: 101, low: 99, close: 100.8 });
			const input = makeDefaultInput({
				candle,
				side: "bullish",
				ma20: 99,
				ma50: 98,
				ma100: 97,
				ma200: 96,
				prevMa20: 98.5,
				prevMa50: 97.8,
				h1Bias: "aligned",
			});
			const result = evaluateEvidence(input);
			expect(result.familyHitCount).toBe(4);
		});

		test("returns 0 families when nothing aligns", () => {
			// Moderate body, mixed MAs, contradicting separation, counter bias
			const candle = makeCandle({ open: 99.5, high: 101, low: 99, close: 100.5 });
			const input = makeDefaultInput({
				candle,
				side: "bullish",
				ma20: 101,
				ma50: 103,
				ma100: 99,
				ma200: 97,
				prevMa20: 101.5, // falling MA20 → bearish slope
				prevMa50: 103.2,
				h1Bias: "counter_trend",
			});
			const result = evaluateEvidence(input);
			// No candle pattern (50% body), mixed ordering, falling slope (bearish != bullish)
			// separation: close 100.5 < ma20 101 → negative for bullish → miss
			// bias: counter_trend → miss
			expect(result.familyHitCount).toBe(0);
		});
	});
});
