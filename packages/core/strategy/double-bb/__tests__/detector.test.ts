import { describe, expect, test } from "bun:test";
import { type BollingerBands, type CandleBar, detectDoubleBB } from "../detector.js";

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

describe("detectDoubleBB", () => {
	describe("trend continuation", () => {
		test("bullish trend: price near BB20 upper, BB4 bands moving up", () => {
			const candle = makeCandle({ open: 103, high: 105, low: 102.5, close: 104.5 });
			const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 });
			const bb4 = makeBB({ upper: 105.5, middle: 104, lower: 102.5 });
			const prevBb4 = makeBB({ upper: 104, middle: 103, lower: 102 });

			const result = detectDoubleBB(candle, bb20, bb4, prevBb4);

			expect(result).not.toBeNull();
			expect(result?.variant).toBe("trend_continuation");
			expect(result?.side).toBe("bullish");
		});

		test("bearish trend: price near BB20 lower, BB4 bands moving down", () => {
			const candle = makeCandle({ open: 97, high: 97.5, low: 95, close: 95.5 });
			const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 });
			const bb4 = makeBB({ upper: 97, middle: 96, lower: 94.5 });
			const prevBb4 = makeBB({ upper: 98, middle: 97, lower: 96 });

			const result = detectDoubleBB(candle, bb20, bb4, prevBb4);

			expect(result).not.toBeNull();
			expect(result?.variant).toBe("trend_continuation");
			expect(result?.side).toBe("bearish");
		});
	});

	describe("reversal", () => {
		test("bullish reversal: touch BB20 lower with long lower wick", () => {
			// Hammer candle near BB20 lower: small body, long lower wick
			const candle = makeCandle({ open: 96, high: 96.5, low: 94.5, close: 96.3 });
			const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 });
			const bb4 = makeBB({ upper: 97, middle: 96, lower: 94 });
			const prevBb4 = makeBB({ upper: 96.5, middle: 95.5, lower: 94.5 });

			const result = detectDoubleBB(candle, bb20, bb4, prevBb4);

			expect(result).not.toBeNull();
			expect(result?.variant).toBe("reversal");
			expect(result?.side).toBe("bullish");
		});

		test("bearish reversal: touch BB20 upper with long upper wick", () => {
			// Inverted hammer near BB20 upper
			const candle = makeCandle({ open: 104.5, high: 106, low: 104, close: 104.2 });
			const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 });
			const bb4 = makeBB({ upper: 106, middle: 105, lower: 103.5 });
			const prevBb4 = makeBB({ upper: 105.5, middle: 104.5, lower: 103 });

			const result = detectDoubleBB(candle, bb20, bb4, prevBb4);

			expect(result).not.toBeNull();
			expect(result?.variant).toBe("reversal");
			expect(result?.side).toBe("bearish");
		});
	});

	describe("breakout", () => {
		test("bullish breakout: strong body above BB20 upper with BB20 expansion", () => {
			// Strong bullish candle breaking above BB20 upper
			const candle = makeCandle({ open: 104, high: 108, low: 103.5, close: 107.5 });
			const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 }); // width = 10
			const bb4 = makeBB({ upper: 108, middle: 106, lower: 104 });
			const prevBb4 = makeBB({ upper: 105, middle: 103, lower: 101 });
			const prevBb20 = makeBB({ upper: 104, middle: 100, lower: 96 }); // prev width = 8, current = 10 → expanding

			const result = detectDoubleBB(candle, bb20, bb4, prevBb4, prevBb20);

			expect(result).not.toBeNull();
			expect(result?.variant).toBe("breakout");
			expect(result?.side).toBe("bullish");
		});

		test("bearish breakout: strong body below BB20 lower with expansion", () => {
			const candle = makeCandle({ open: 96, high: 96.5, low: 92, close: 92.5 });
			const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 }); // width = 10
			const bb4 = makeBB({ upper: 96, middle: 94, lower: 92 });
			const prevBb4 = makeBB({ upper: 97, middle: 96, lower: 95 });
			const prevBb20 = makeBB({ upper: 104, middle: 100, lower: 96 }); // prev width = 8

			const result = detectDoubleBB(candle, bb20, bb4, prevBb4, prevBb20);

			expect(result).not.toBeNull();
			expect(result?.variant).toBe("breakout");
			expect(result?.side).toBe("bearish");
		});
	});

	test("no pattern when price is in middle zone", () => {
		const candle = makeCandle({ open: 100, high: 101, low: 99, close: 100.5 });
		const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 });
		const bb4 = makeBB({ upper: 101, middle: 100, lower: 99 });
		const prevBb4 = makeBB({ upper: 101, middle: 100, lower: 99 });

		const result = detectDoubleBB(candle, bb20, bb4, prevBb4);

		expect(result).toBeNull();
	});

	test("breakout takes priority over reversal", () => {
		// Strong candle above BB20 upper that could also look like reversal area
		const candle = makeCandle({ open: 104, high: 108, low: 103.5, close: 107.5 });
		const bb20 = makeBB({ upper: 105, middle: 100, lower: 95 });
		const bb4 = makeBB({ upper: 108, middle: 106, lower: 104 });
		const prevBb4 = makeBB({ upper: 105, middle: 103, lower: 101 });
		const prevBb20 = makeBB({ upper: 104, middle: 100, lower: 96 });

		const result = detectDoubleBB(candle, bb20, bb4, prevBb4, prevBb20);

		expect(result?.variant).toBe("breakout");
	});
});
