import { describe, expect, test } from "bun:test";
import type { CandleBar, BollingerBands } from "../detector.js";
import type { MaBias } from "../evidence.js";
import {
	type DoubleBBEvaluationInput,
	evaluateDoubleBB,
} from "../evaluate.js";

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

function makeBB(overrides: Partial<BollingerBands> = {}): BollingerBands {
	return {
		upper: 105,
		middle: 100,
		lower: 95,
		...overrides,
	};
}

function makeInput(overrides: Partial<DoubleBBEvaluationInput> = {}): DoubleBBEvaluationInput {
	return {
		candle: makeCandle({ open: 103, high: 105, low: 102.5, close: 104.5 }),
		bb20: makeBB({ upper: 105, middle: 100, lower: 95 }),
		bb4: makeBB({ upper: 105.5, middle: 104, lower: 102.5 }),
		prevBb4: makeBB({ upper: 104, middle: 103, lower: 102 }),
		ma20: 103,
		ma50: 101,
		ma100: 99,
		ma200: 97,
		prevMa20: 102.5,
		prevMa50: 100.8,
		h1Bias: "aligned" as MaBias,
		volume: 1500,
		avgVolume20: 1000,
		atr14: 2,
		direction: "both",
		...overrides,
	};
}

describe("evaluateDoubleBB (orchestrator)", () => {
	test("full pass: returns evaluation with pattern, features, targets", () => {
		const input = makeInput();
		const result = evaluateDoubleBB(input);

		expect(result).not.toBeNull();
		expect(result?.pattern).toBeDefined();
		expect(result?.pattern.variant).toBe("trend_continuation");
		expect(result?.pattern.side).toBe("bullish");
		expect(Object.keys(result?.features ?? {})).toHaveLength(10);
		expect(result?.targets.takeProfit).toBeDefined();
		expect(result?.targets.stopLoss).toBeDefined();
		expect(result?.targets.maxHoldBars).toBe(60);
	});

	test("all features in [0, 1] range", () => {
		const result = evaluateDoubleBB(makeInput());
		expect(result).not.toBeNull();

		for (const [, value] of Object.entries(result?.features ?? {})) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});

	test("returns null when no pattern detected (price in middle)", () => {
		const input = makeInput({
			candle: makeCandle({ open: 100, high: 101, low: 99, close: 100.5 }),
			bb4: makeBB({ upper: 101, middle: 100, lower: 99 }),
			prevBb4: makeBB({ upper: 101, middle: 100, lower: 99 }),
		});
		const result = evaluateDoubleBB(input);
		expect(result).toBeNull();
	});

	test("returns null when evidence is weak (< 3 families)", () => {
		// Trend pattern with counter_trend bias + mixed MAs → weak evidence
		const input = makeInput({
			h1Bias: "counter_trend",
			ma20: 101,
			ma50: 103, // out of order
			prevMa20: 101.5, // falling
			prevMa50: 103.2,
		});
		const result = evaluateDoubleBB(input);
		expect(result).toBeNull();
	});

	test("direction filter: LONG ignores bearish patterns", () => {
		// Bearish trend setup
		const input = makeInput({
			candle: makeCandle({ open: 97, high: 97.5, low: 95, close: 95.5 }),
			bb20: makeBB({ upper: 105, middle: 100, lower: 95 }),
			bb4: makeBB({ upper: 97, middle: 96, lower: 94.5 }),
			prevBb4: makeBB({ upper: 98, middle: 97, lower: 96 }),
			ma20: 97,
			ma50: 99,
			ma100: 101,
			ma200: 103,
			prevMa20: 97.5,
			prevMa50: 99.2,
			h1Bias: "aligned",
			direction: "long",
		});
		const result = evaluateDoubleBB(input);
		expect(result).toBeNull();
	});

	test("LONG targets: TP above entry, SL below entry", () => {
		const input = makeInput();
		const result = evaluateDoubleBB(input);
		expect(result).not.toBeNull();

		// Entry = close = 104.5, ATR = 2
		expect(result?.targets.takeProfit).toBe(104.5 + 2 * 2);
		expect(result?.targets.stopLoss).toBe(104.5 - 2 * 1);
	});

	test("SHORT targets: TP below entry, SL above entry", () => {
		// Bearish breakout
		const input = makeInput({
			candle: makeCandle({ open: 96, high: 96.5, low: 92, close: 92.5 }),
			bb20: makeBB({ upper: 105, middle: 100, lower: 95 }),
			bb4: makeBB({ upper: 96, middle: 94, lower: 92 }),
			prevBb4: makeBB({ upper: 97, middle: 96, lower: 95 }),
			prevBb20: makeBB({ upper: 104, middle: 100, lower: 96 }),
			ma20: 95,
			ma50: 97,
			ma100: 99,
			ma200: 101,
			prevMa20: 95.5,
			prevMa50: 97.2,
			h1Bias: "aligned",
			direction: "both",
		});
		const result = evaluateDoubleBB(input);
		expect(result).not.toBeNull();
		expect(result?.pattern.side).toBe("bearish");

		// Entry = close = 92.5, ATR = 2
		expect(result?.targets.takeProfit).toBe(92.5 - 2 * 2);
		expect(result?.targets.stopLoss).toBe(92.5 + 2 * 1);
	});
});
