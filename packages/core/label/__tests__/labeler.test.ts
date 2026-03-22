import { describe, expect, test } from "bun:test";
import { labelEvent } from "../labeler.js";
import type { CandleBar, LabelInput } from "../types.js";

function makeCandle(high: number, low: number, close: number, open?: number): CandleBar {
	return {
		open: (open ?? close).toString(),
		high: high.toString(),
		low: low.toString(),
		close: close.toString(),
	};
}

describe("labelEvent", () => {
	// LONG scenarios
	test("LONG: TP hit → WIN", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 2, // TP at 102
			slPct: 1, // SL at 99
			maxHoldBars: 10,
			forwardCandles: [
				makeCandle(101, 99.5, 101), // no hit
				makeCandle(102.5, 100, 102), // TP hit (high >= 102)
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("WIN");
		expect(result.holdBars).toBe(2);
		expect(result.exitPrice).toBe("102");
		expect(result.pnlPct).toBeCloseTo(2.0);
		expect(result.slHitFirst).toBe(false);
	});

	test("LONG: SL hit → LOSS", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 2, // TP at 102
			slPct: 1, // SL at 99
			maxHoldBars: 10,
			forwardCandles: [
				makeCandle(101, 100, 100.5), // no hit
				makeCandle(100, 98, 98.5), // SL hit (low <= 99)
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("LOSS");
		expect(result.holdBars).toBe(2);
		expect(result.exitPrice).toBe("99");
		expect(result.pnlPct).toBeCloseTo(-1.0);
		expect(result.slHitFirst).toBe(false);
	});

	test("LONG: simultaneous TP+SL → LOSS (sl_hit_first)", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 2, // TP at 102
			slPct: 1, // SL at 99
			maxHoldBars: 10,
			forwardCandles: [
				makeCandle(103, 98, 100), // both TP and SL hit in same bar
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("LOSS");
		expect(result.slHitFirst).toBe(true);
		expect(result.exitPrice).toBe("99");
		expect(result.pnlPct).toBeCloseTo(-1.0);
	});

	test("LONG: max hold bars → TIME_EXIT", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 5, // TP at 105
			slPct: 5, // SL at 95
			maxHoldBars: 3,
			forwardCandles: [
				makeCandle(101, 99, 100.5),
				makeCandle(102, 98, 101),
				makeCandle(103, 97, 101.5),
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("TIME_EXIT");
		expect(result.holdBars).toBe(3);
		expect(result.exitPrice).toBe("101.5"); // close of last bar
		expect(result.pnlPct).toBeCloseTo(1.5);
	});

	// SHORT scenarios
	test("SHORT: TP hit → WIN", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "short",
			tpPct: 2, // TP at 98
			slPct: 1, // SL at 101
			maxHoldBars: 10,
			forwardCandles: [
				makeCandle(100.5, 99, 99.5), // no hit
				makeCandle(99, 97.5, 98), // TP hit (low <= 98)
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("WIN");
		expect(result.holdBars).toBe(2);
		expect(result.exitPrice).toBe("98");
		expect(result.pnlPct).toBeCloseTo(2.0); // SHORT profit = (entry - exit) / entry * 100
	});

	test("SHORT: SL hit → LOSS", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "short",
			tpPct: 2, // TP at 98
			slPct: 1, // SL at 101
			maxHoldBars: 10,
			forwardCandles: [
				makeCandle(100.5, 99, 99.5), // no hit
				makeCandle(101.5, 100, 101), // SL hit (high >= 101)
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("LOSS");
		expect(result.exitPrice).toBe("101");
		expect(result.pnlPct).toBeCloseTo(-1.0);
	});

	// MFE/MAE tests
	test("mfe_pct tracks maximum favorable excursion (LONG)", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 5,
			slPct: 5,
			maxHoldBars: 4,
			forwardCandles: [
				makeCandle(103, 99, 102), // MFE = +3%
				makeCandle(104, 100, 101), // MFE = +4%
				makeCandle(102, 98, 100), // MAE = -2%
				makeCandle(101, 99, 100.5),
			],
		};

		const result = labelEvent(input);
		expect(result.mfePct).toBeCloseTo(4.0); // max high was 104 → (104-100)/100 = 4%
		expect(result.maePct).toBeCloseTo(2.0); // max low was 98 → (100-98)/100 = 2%
	});

	test("mfe_pct tracks maximum favorable excursion (SHORT)", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "short",
			tpPct: 5,
			slPct: 5,
			maxHoldBars: 3,
			forwardCandles: [
				makeCandle(101, 97, 98), // MFE = +3% (favorable is down for short)
				makeCandle(100, 96, 97), // MFE = +4%
				makeCandle(102, 98, 99),
			],
		};

		const result = labelEvent(input);
		expect(result.mfePct).toBeCloseTo(4.0); // (100-96)/100 = 4%
		expect(result.maePct).toBeCloseTo(2.0); // (102-100)/100 = 2%
	});

	// Edge cases
	test("empty forward candles → TIME_EXIT with entry price", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 2,
			slPct: 1,
			maxHoldBars: 0,
			forwardCandles: [],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("TIME_EXIT");
		expect(result.holdBars).toBe(0);
		expect(result.exitPrice).toBe("100");
		expect(result.pnlPct).toBeCloseTo(0);
	});

	test("first candle hits TP immediately", () => {
		const input: LabelInput = {
			entryPrice: "100",
			direction: "long",
			tpPct: 1, // TP at 101
			slPct: 5, // SL at 95
			maxHoldBars: 10,
			forwardCandles: [
				makeCandle(102, 100, 101.5), // TP hit
			],
		};

		const result = labelEvent(input);
		expect(result.resultType).toBe("WIN");
		expect(result.holdBars).toBe(1);
	});
});
