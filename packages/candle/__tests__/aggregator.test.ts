import { describe, expect, test } from "bun:test";
import Decimal from "decimal.js";
import type { Candle } from "../types.js";
import {
	aggregateCandles,
	getAggregationBarOpenTime,
	isTimeframeClosed,
} from "../aggregator.js";

function makeCandle1m(
	minuteOffset: number,
	overrides: Partial<{ open: string; high: string; low: string; close: string; volume: string }> = {},
): Candle {
	const baseTime = new Date("2026-01-01T00:00:00Z");
	const openTime = new Date(baseTime.getTime() + minuteOffset * 60_000);
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime,
		open: overrides.open ?? "100",
		high: overrides.high ?? "102",
		low: overrides.low ?? "99",
		close: overrides.close ?? "101",
		volume: overrides.volume ?? "1000",
		isClosed: true,
	};
}

describe("aggregateCandles", () => {
	test("aggregates 3×1m into 1 correct 3m candle", () => {
		const candles = [
			makeCandle1m(0, { open: "100", high: "105", low: "98", close: "103", volume: "1000" }),
			makeCandle1m(1, { open: "103", high: "107", low: "101", close: "104", volume: "1500" }),
			makeCandle1m(2, { open: "104", high: "106", low: "100", close: "102", volume: "1200" }),
		];

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.timeframe).toBe("3m");
		expect(bar.open).toBe("100");   // first candle's open
		expect(bar.high).toBe("107");   // max of all highs
		expect(bar.low).toBe("98");     // min of all lows
		expect(bar.close).toBe("102");  // last candle's close
		expect(bar.volume).toBe("3700"); // sum: 1000+1500+1200
		expect(bar.isClosed).toBe(true);
	});

	test("aggregates 5×1m into 1 correct 5m candle", () => {
		const candles = [
			makeCandle1m(0, { open: "50", high: "55", low: "48", close: "53", volume: "100" }),
			makeCandle1m(1, { open: "53", high: "56", low: "51", close: "54", volume: "200" }),
			makeCandle1m(2, { open: "54", high: "58", low: "52", close: "57", volume: "150" }),
			makeCandle1m(3, { open: "57", high: "59", low: "55", close: "56", volume: "180" }),
			makeCandle1m(4, { open: "56", high: "57", low: "54", close: "55", volume: "120" }),
		];

		const result = aggregateCandles(candles, "5m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.open).toBe("50");
		expect(bar.high).toBe("59");
		expect(bar.low).toBe("48");
		expect(bar.close).toBe("55");
		expect(bar.volume).toBe("750");
		expect(bar.isClosed).toBe(true);
	});

	test("aggregates 15×1m into 1 correct 15m candle", () => {
		const candles: Candle[] = [];
		for (let i = 0; i < 15; i++) {
			candles.push(
				makeCandle1m(i, {
					open: String(100 + i),
					high: String(103 + i),
					low: String(99 + i),
					close: String(101 + i),
					volume: "100",
				}),
			);
		}

		const result = aggregateCandles(candles, "15m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.open).toBe("100"); // first open
		expect(bar.high).toBe("117"); // 103+14
		expect(bar.low).toBe("99");   // first low
		expect(bar.close).toBe("115"); // 101+14
		expect(bar.volume).toBe("1500"); // 15 × 100
	});

	test("aggregates 60×1m into 1 correct 1h candle", () => {
		const candles: Candle[] = [];
		for (let i = 0; i < 60; i++) {
			candles.push(
				makeCandle1m(i, {
					open: String(100 + i * 0.1),
					high: String(101 + i * 0.1),
					low: String(99),
					close: String(100.5 + i * 0.1),
					volume: "50",
				}),
			);
		}

		const result = aggregateCandles(candles, "1h");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.open).toBe("100");
		expect(bar.close).toBe(String(100.5 + 59 * 0.1));
		expect(bar.volume).toBe("3000"); // 60 × 50
		expect(bar.isClosed).toBe(true);
	});

	test("partial bar at end is isClosed=false", () => {
		// Only 2 of 3 bars for a 3m candle
		const candles = [
			makeCandle1m(0, { open: "100", high: "105", low: "98", close: "103", volume: "1000" }),
			makeCandle1m(1, { open: "103", high: "107", low: "101", close: "104", volume: "1500" }),
		];

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		expect(result[0]!.isClosed).toBe(false);
		expect(result[0]!.open).toBe("100");
		expect(result[0]!.close).toBe("104");
	});

	test("multiple complete bars", () => {
		// 6 candles → 2 complete 3m bars
		const candles = [
			makeCandle1m(0, { open: "100", high: "105", low: "98", close: "103", volume: "1000" }),
			makeCandle1m(1, { open: "103", high: "107", low: "101", close: "104", volume: "1500" }),
			makeCandle1m(2, { open: "104", high: "106", low: "100", close: "102", volume: "1200" }),
			makeCandle1m(3, { open: "102", high: "108", low: "99", close: "106", volume: "2000" }),
			makeCandle1m(4, { open: "106", high: "110", low: "104", close: "109", volume: "2500" }),
			makeCandle1m(5, { open: "109", high: "111", low: "107", close: "110", volume: "1800" }),
		];

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(2);
		expect(result[0]!.isClosed).toBe(true);
		expect(result[1]!.isClosed).toBe(true);
		expect(result[1]!.open).toBe("102");
		expect(result[1]!.close).toBe("110");
	});

	test("empty input returns empty array", () => {
		const result = aggregateCandles([], "5m");
		expect(result).toHaveLength(0);
	});
});

describe("getAggregationBarOpenTime", () => {
	test("3m: aligns to 3-minute boundary", () => {
		const t = new Date("2026-01-01T00:04:00Z");
		const result = getAggregationBarOpenTime(t, "3m");
		expect(result.toISOString()).toBe("2026-01-01T00:03:00.000Z");
	});

	test("5m: aligns to 5-minute boundary", () => {
		const t = new Date("2026-01-01T00:07:00Z");
		const result = getAggregationBarOpenTime(t, "5m");
		expect(result.toISOString()).toBe("2026-01-01T00:05:00.000Z");
	});

	test("15m: aligns to 15-minute boundary", () => {
		const t = new Date("2026-01-01T00:22:00Z");
		const result = getAggregationBarOpenTime(t, "15m");
		expect(result.toISOString()).toBe("2026-01-01T00:15:00.000Z");
	});

	test("1h: aligns to hour boundary", () => {
		const t = new Date("2026-01-01T01:45:00Z");
		const result = getAggregationBarOpenTime(t, "1h");
		expect(result.toISOString()).toBe("2026-01-01T01:00:00.000Z");
	});
});

describe("isTimeframeClosed", () => {
	test("3m bar closes when 3rd minute finishes", () => {
		// Bar opens at 00:00, closes when 00:02 candle is closed
		// The bar is closed when current time >= 00:03
		const openTime = new Date("2026-01-01T00:00:00Z");
		expect(isTimeframeClosed(openTime, "3m", 3)).toBe(true);
		expect(isTimeframeClosed(openTime, "3m", 2)).toBe(false);
	});

	test("5m bar needs all 5 candles", () => {
		const openTime = new Date("2026-01-01T00:00:00Z");
		expect(isTimeframeClosed(openTime, "5m", 5)).toBe(true);
		expect(isTimeframeClosed(openTime, "5m", 4)).toBe(false);
	});

	test("1h bar needs all 60 candles", () => {
		const openTime = new Date("2026-01-01T00:00:00Z");
		expect(isTimeframeClosed(openTime, "1h", 60)).toBe(true);
		expect(isTimeframeClosed(openTime, "1h", 59)).toBe(false);
	});
});
