import { describe, expect, test } from "bun:test";
import type { Candle } from "../types.js";
import { isContinuous, validateContinuity } from "../validation.js";

function makeCandle(minuteOffset: number, timeframe: "1m" | "5m" | "15m" | "1h" = "1m"): Candle {
	const baseTime = new Date("2026-01-01T00:00:00Z");
	const tfMs: Record<string, number> = {
		"1m": 60_000,
		"5m": 300_000,
		"15m": 900_000,
		"1h": 3_600_000,
	};
	const openTime = new Date(baseTime.getTime() + minuteOffset * tfMs[timeframe]!);
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe,
		openTime,
		open: "100",
		high: "102",
		low: "99",
		close: "101",
		volume: "1000",
		isClosed: true,
	};
}

describe("validateContinuity", () => {
	test("returns empty array for continuous 1m candles", () => {
		const candles = [makeCandle(0), makeCandle(1), makeCandle(2), makeCandle(3), makeCandle(4)];
		const gaps = validateContinuity(candles);
		expect(gaps).toHaveLength(0);
	});

	test("detects single gap in 1m candles", () => {
		// minute 0, 1, 3 (missing minute 2)
		const candles = [makeCandle(0), makeCandle(1), makeCandle(3)];
		const gaps = validateContinuity(candles);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]!.expectedTime).toEqual(new Date("2026-01-01T00:02:00Z"));
	});

	test("detects multiple consecutive gaps", () => {
		// minute 0, 4 (missing 1, 2, 3)
		const candles = [makeCandle(0), makeCandle(4)];
		const gaps = validateContinuity(candles);
		expect(gaps).toHaveLength(3);
		expect(gaps[0]!.expectedTime).toEqual(new Date("2026-01-01T00:01:00Z"));
		expect(gaps[1]!.expectedTime).toEqual(new Date("2026-01-01T00:02:00Z"));
		expect(gaps[2]!.expectedTime).toEqual(new Date("2026-01-01T00:03:00Z"));
	});

	test("returns empty array for empty input", () => {
		const gaps = validateContinuity([]);
		expect(gaps).toHaveLength(0);
	});

	test("returns empty array for single candle", () => {
		const gaps = validateContinuity([makeCandle(0)]);
		expect(gaps).toHaveLength(0);
	});

	test("works with 5m timeframe", () => {
		// bar 0 (00:00), bar 2 (00:10) — missing bar 1 (00:05)
		const candles = [makeCandle(0, "5m"), makeCandle(2, "5m")];
		const gaps = validateContinuity(candles);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]!.expectedTime).toEqual(new Date("2026-01-01T00:05:00Z"));
	});

	test("works with 15m timeframe", () => {
		// bar 0 (00:00), bar 3 (00:45) — missing bars 1, 2 (00:15, 00:30)
		const candles = [makeCandle(0, "15m"), makeCandle(3, "15m")];
		const gaps = validateContinuity(candles);
		expect(gaps).toHaveLength(2);
		expect(gaps[0]!.expectedTime).toEqual(new Date("2026-01-01T00:15:00Z"));
		expect(gaps[1]!.expectedTime).toEqual(new Date("2026-01-01T00:30:00Z"));
	});

	test("works with 1h timeframe", () => {
		const candles = [makeCandle(0, "1h"), makeCandle(1, "1h"), makeCandle(2, "1h")];
		const gaps = validateContinuity(candles);
		expect(gaps).toHaveLength(0);
	});

	test("each gap has correct timeframe", () => {
		const candles = [makeCandle(0, "5m"), makeCandle(2, "5m")];
		const gaps = validateContinuity(candles);
		expect(gaps[0]!.timeframe).toBe("5m");
	});
});

describe("isContinuous", () => {
	test("returns true for continuous candles", () => {
		const candles = [makeCandle(0), makeCandle(1), makeCandle(2)];
		expect(isContinuous(candles)).toBe(true);
	});

	test("returns false for candles with gaps", () => {
		const candles = [makeCandle(0), makeCandle(2)];
		expect(isContinuous(candles)).toBe(false);
	});

	test("returns true for empty input", () => {
		expect(isContinuous([])).toBe(true);
	});

	test("returns true for single candle", () => {
		expect(isContinuous([makeCandle(0)])).toBe(true);
	});
});
