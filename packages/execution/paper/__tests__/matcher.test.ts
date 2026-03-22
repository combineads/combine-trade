import { describe, expect, test } from "bun:test";
import { scanForExit, simulateMarketFill } from "../matcher.js";
import type { PaperCandle } from "../types.js";

describe("Paper Order Matcher", () => {
	describe("simulateMarketFill", () => {
		test("LONG fill: open + slippage", () => {
			const fill = simulateMarketFill("LONG", "50000");
			// 50000 * (1 + 0.0005) = 50025
			expect(fill.fillPrice).toBe("50025");
			expect(fill.direction).toBe("LONG");
			expect(fill.slippageApplied).toBe("25");
		});

		test("SHORT fill: open - slippage", () => {
			const fill = simulateMarketFill("SHORT", "50000");
			// 50000 * (1 - 0.0005) = 49975
			expect(fill.fillPrice).toBe("49975");
			expect(fill.direction).toBe("SHORT");
		});

		test("custom slippage override", () => {
			const fill = simulateMarketFill("LONG", "50000", { slippagePct: 0.1 });
			// 50000 * (1 + 0.001) = 50050
			expect(fill.fillPrice).toBe("50050");
		});

		test("zero slippage", () => {
			const fill = simulateMarketFill("LONG", "50000", { slippagePct: 0 });
			expect(fill.fillPrice).toBe("50000");
			expect(fill.slippageApplied).toBe("0");
		});
	});

	describe("scanForExit", () => {
		const candles: PaperCandle[] = [
			{ open: "50100", high: "50500", low: "49800", close: "50200" },
			{ open: "50200", high: "50800", low: "49600", close: "50600" },
			{ open: "50600", high: "51200", low: "50400", close: "51000" },
		];

		test("LONG: SL hit on candle low", () => {
			// SL at 49900 — candle 0 low is 49800 which breaches SL
			const result = scanForExit("LONG", "50000", "49900", "52000", candles);
			expect(result.reason).toBe("SL");
			expect(result.exitPrice).toBe("49900");
			expect(result.exitBar).toBe(1);
		});

		test("LONG: TP hit on candle high", () => {
			// TP at 51100 — candle 2 high is 51200 which breaches TP
			const result = scanForExit("LONG", "50000", "48000", "51100", candles);
			expect(result.reason).toBe("TP");
			expect(result.exitPrice).toBe("51100");
			expect(result.exitBar).toBe(3);
		});

		test("SHORT: SL hit on candle high", () => {
			// SHORT entry at 50000, SL at 50400 — candle 0 high 50500 > 50400
			const result = scanForExit("SHORT", "50000", "50400", "48000", candles);
			expect(result.reason).toBe("SL");
			expect(result.exitPrice).toBe("50400");
			expect(result.exitBar).toBe(1);
		});

		test("SHORT: TP hit on candle low", () => {
			// SHORT entry at 50000, TP at 49700 — candle 1 low 49600 < 49700
			const result = scanForExit("SHORT", "50000", "52000", "49700", candles);
			expect(result.reason).toBe("TP");
			expect(result.exitPrice).toBe("49700");
			expect(result.exitBar).toBe(2);
		});

		test("same-bar SL+TP hit → SL wins (conservative)", () => {
			// Both SL and TP triggered on same candle
			const wideCandle: PaperCandle[] = [
				{ open: "50000", high: "52000", low: "48000", close: "50000" },
			];
			const result = scanForExit("LONG", "50000", "48500", "51500", wideCandle);
			expect(result.reason).toBe("SL");
			expect(result.exitPrice).toBe("48500");
			expect(result.slHitFirst).toBe(true);
		});

		test("no exit when price stays within range → TIME_EXIT", () => {
			const tightCandles: PaperCandle[] = [
				{ open: "50000", high: "50100", low: "49900", close: "50050" },
				{ open: "50050", high: "50150", low: "49950", close: "50100" },
			];
			const result = scanForExit("LONG", "50000", "49000", "52000", tightCandles);
			expect(result.reason).toBe("TIME_EXIT");
			expect(result.exitPrice).toBe("50100"); // last close
			expect(result.exitBar).toBe(2);
		});

		test("multi-candle scan finds first exit bar", () => {
			const manyCandles: PaperCandle[] = [
				{ open: "50000", high: "50100", low: "49900", close: "50050" },
				{ open: "50050", high: "50100", low: "49950", close: "50000" },
				{ open: "50000", high: "50100", low: "49950", close: "50050" },
				{ open: "50050", high: "51200", low: "49900", close: "51000" }, // TP hit here
			];
			const result = scanForExit("LONG", "50000", "49000", "51100", manyCandles);
			expect(result.reason).toBe("TP");
			expect(result.exitBar).toBe(4);
		});

		test("empty candles → TIME_EXIT at entry price", () => {
			const result = scanForExit("LONG", "50000", "49000", "51000", []);
			expect(result.reason).toBe("TIME_EXIT");
			expect(result.exitPrice).toBe("50000");
			expect(result.exitBar).toBe(0);
		});
	});
});
