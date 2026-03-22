import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import { labelBacktestEvent, toForwardCandles } from "../labeler.js";
import type { BacktestEvent } from "../types.js";

const BASE_TIME = 1704067200000;
const MINUTE = 60_000;

function makeCandle(index: number, overrides: Partial<Candle> = {}): Candle {
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime: new Date(BASE_TIME + index * MINUTE),
		open: "50000",
		high: "50100",
		low: "49900",
		close: "50050",
		volume: "100",
		isClosed: true,
		...overrides,
	};
}

function makeEvent(candleIndex: number): BacktestEvent {
	return {
		eventId: "bt-evt-1",
		strategyId: "strat-1",
		version: 1,
		symbol: "BTCUSDT",
		exchange: "binance",
		timeframe: "1m",
		entryPrice: "50000",
		direction: "long",
		openTime: new Date(BASE_TIME + candleIndex * MINUTE),
		candleIndex,
	};
}

describe("toForwardCandles", () => {
	test("returns correct slice starting at fromIndex + 1", () => {
		const candles = Array.from({ length: 10 }, (_, i) => makeCandle(i));
		const forward = toForwardCandles(candles, 2, 5);
		expect(forward).toHaveLength(5);
		// First forward candle is index 3
		expect(forward[0]!.open).toBe(candles[3]!.open);
	});

	test("limits to maxHoldBars even when more candles available", () => {
		const candles = Array.from({ length: 20 }, (_, i) => makeCandle(i));
		const forward = toForwardCandles(candles, 0, 3);
		expect(forward).toHaveLength(3);
	});

	test("returns fewer candles when not enough available", () => {
		const candles = Array.from({ length: 5 }, (_, i) => makeCandle(i));
		// From index 3, only 1 candle forward (index 4)
		const forward = toForwardCandles(candles, 3, 5);
		expect(forward).toHaveLength(1);
	});

	test("returns empty array when fromIndex is last candle", () => {
		const candles = Array.from({ length: 5 }, (_, i) => makeCandle(i));
		const forward = toForwardCandles(candles, 4, 5);
		expect(forward).toHaveLength(0);
	});
});

describe("labelBacktestEvent", () => {
	test("LONG TP hit returns WIN", () => {
		const candles = [
			makeCandle(0), // event candle
			makeCandle(1, { open: "50100", high: "50200", low: "49900", close: "50100" }),
			makeCandle(2, { open: "50100", high: "51100", low: "50000", close: "50800" }), // TP hit (entry 50000 * 1.02 = 51000)
			makeCandle(3, { open: "50800", high: "51000", low: "50500", close: "50700" }),
			makeCandle(4, { open: "50700", high: "50900", low: "50400", close: "50600" }),
			makeCandle(5, { open: "50600", high: "50800", low: "50300", close: "50500" }),
		];

		const event = makeEvent(0);
		const result = labelBacktestEvent(event, candles, { tpPct: 2, slPct: 1, maxHoldBars: 5 });

		expect(result.resultType).toBe("WIN");
	});

	test("event at last candle → TIME_EXIT with holdBars=0", () => {
		const candles = Array.from({ length: 5 }, (_, i) => makeCandle(i));
		const event = makeEvent(4); // last candle

		const result = labelBacktestEvent(event, candles, { tpPct: 2, slPct: 1, maxHoldBars: 5 });

		expect(result.resultType).toBe("TIME_EXIT");
		expect(result.holdBars).toBe(0);
		expect(result.pnlPct).toBe(0);
	});

	test("LONG SL hit on first forward candle → LOSS", () => {
		const candles = [
			makeCandle(0), // event candle
			makeCandle(1, { open: "49800", high: "49900", low: "49400", close: "49500" }), // SL hit (entry 50000 * 0.99 = 49500)
			makeCandle(2, { open: "49500", high: "49600", low: "49400", close: "49500" }),
			makeCandle(3, { open: "49500", high: "49600", low: "49400", close: "49500" }),
			makeCandle(4, { open: "49500", high: "49600", low: "49400", close: "49500" }),
			makeCandle(5, { open: "49500", high: "49600", low: "49400", close: "49500" }),
		];

		const event = makeEvent(0);
		const result = labelBacktestEvent(event, candles, { tpPct: 2, slPct: 1, maxHoldBars: 5 });

		expect(result.resultType).toBe("LOSS");
		expect(result.holdBars).toBe(1);
	});

	test("SHORT direction TP hit", () => {
		const candles = [
			makeCandle(0), // event candle
			// For short: TP when low <= 50000 * (1 - 0.02) = 49000
			makeCandle(1, { open: "49900", high: "50100", low: "48900", close: "49000" }),
			makeCandle(2, { open: "49000", high: "49200", low: "48800", close: "49100" }),
			makeCandle(3, { open: "49100", high: "49300", low: "48900", close: "49000" }),
			makeCandle(4, { open: "49000", high: "49200", low: "48800", close: "49100" }),
			makeCandle(5, { open: "49100", high: "49300", low: "48900", close: "49000" }),
		];

		const event: BacktestEvent = { ...makeEvent(0), direction: "short" };
		const result = labelBacktestEvent(event, candles, { tpPct: 2, slPct: 1, maxHoldBars: 5 });

		expect(result.resultType).toBe("WIN");
	});

	test("fewer forward candles than maxHoldBars → uses available candles", () => {
		const candles = [
			makeCandle(0), // event candle
			makeCandle(1, { open: "50100", high: "50200", low: "49900", close: "50100" }),
			// Only 2 forward candles, maxHoldBars=5
		];

		const event = makeEvent(0);
		const result = labelBacktestEvent(event, candles, { tpPct: 5, slPct: 5, maxHoldBars: 5 });

		// Wide TP/SL won't be hit in 1 candle → TIME_EXIT
		expect(result.resultType).toBe("TIME_EXIT");
		expect(result.holdBars).toBe(1);
	});
});
