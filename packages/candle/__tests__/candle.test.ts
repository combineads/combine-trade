import { describe, expect, test } from "bun:test";
import type { Candle } from "../types.js";
import { isContinuous, validateContinuity } from "../validation.js";

function makeCandle(openTimeMs: number, timeframe: "1m" | "1h" = "1m"): Candle {
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe,
		openTime: new Date(openTimeMs),
		open: "50000",
		high: "50100",
		low: "49900",
		close: "50050",
		volume: "100",
		isClosed: true,
	};
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const BASE = Date.UTC(2024, 0, 1, 0, 0, 0);

describe("Candle continuity validation", () => {
	test("continuous 1m sequence has no gaps", () => {
		const candles = [
			makeCandle(BASE),
			makeCandle(BASE + MINUTE),
			makeCandle(BASE + 2 * MINUTE),
			makeCandle(BASE + 3 * MINUTE),
			makeCandle(BASE + 4 * MINUTE),
		];
		expect(validateContinuity(candles)).toEqual([]);
		expect(isContinuous(candles)).toBe(true);
	});

	test("single gap detected in 1m sequence", () => {
		const candles = [
			makeCandle(BASE),
			makeCandle(BASE + MINUTE),
			// gap: missing BASE + 2 * MINUTE
			makeCandle(BASE + 3 * MINUTE),
		];
		const gaps = validateContinuity(candles);
		expect(gaps.length).toBe(1);
		expect(gaps[0]!.expectedTime.getTime()).toBe(BASE + 2 * MINUTE);
		expect(isContinuous(candles)).toBe(false);
	});

	test("multiple gaps detected", () => {
		const candles = [
			makeCandle(BASE),
			// gap: missing BASE + MINUTE, BASE + 2 * MINUTE
			makeCandle(BASE + 3 * MINUTE),
			// gap: missing BASE + 4 * MINUTE
			makeCandle(BASE + 5 * MINUTE),
		];
		const gaps = validateContinuity(candles);
		expect(gaps.length).toBe(3);
	});

	test("1h timeframe gap detection works", () => {
		const candles = [
			makeCandle(BASE, "1h"),
			makeCandle(BASE + HOUR, "1h"),
			// gap: missing BASE + 2 * HOUR
			makeCandle(BASE + 3 * HOUR, "1h"),
		];
		const gaps = validateContinuity(candles);
		expect(gaps.length).toBe(1);
		expect(gaps[0]!.expectedTime.getTime()).toBe(BASE + 2 * HOUR);
	});

	test("empty input returns no gaps", () => {
		expect(validateContinuity([])).toEqual([]);
		expect(isContinuous([])).toBe(true);
	});

	test("single candle returns no gaps", () => {
		expect(validateContinuity([makeCandle(BASE)])).toEqual([]);
		expect(isContinuous([makeCandle(BASE)])).toBe(true);
	});
});
