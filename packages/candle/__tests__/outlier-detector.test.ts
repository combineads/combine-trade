import { describe, expect, test } from "bun:test";
import type { Candle } from "../types.js";
import { detectOutliers } from "../outlier-detector.js";

function makeCandle(
	overrides: Partial<Pick<Candle, "open" | "high" | "low" | "close" | "volume">> = {},
	minuteOffset = 0,
): Candle {
	const base = new Date("2026-01-01T00:00:00Z");
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime: new Date(base.getTime() + minuteOffset * 60_000),
		open: "42000",
		high: "42200",
		low: "41800",
		close: "42100",
		volume: "100",
		isClosed: true,
		...overrides,
	};
}

describe("detectOutliers", () => {
	test("returns empty array for empty input", () => {
		expect(detectOutliers([])).toHaveLength(0);
	});

	test("returns empty array for single normal candle", () => {
		const candles = [makeCandle()];
		expect(detectOutliers(candles)).toHaveLength(0);
	});

	test("returns empty array for continuous normal candles", () => {
		const candles = [
			makeCandle({ close: "42000" }, 0),
			makeCandle({ close: "42100", open: "42000", high: "42200", low: "41900" }, 1),
			makeCandle({ close: "42200", open: "42100", high: "42300", low: "42000" }, 2),
		];
		expect(detectOutliers(candles)).toHaveLength(0);
	});

	// --- Negative price ---
	test("flags candle with negative close", () => {
		const candles = [makeCandle({ close: "-100" })];
		const results = detectOutliers(candles);
		expect(results).toHaveLength(1);
		expect(results[0]!.index).toBe(0);
		expect(results[0]!.reasons).toContain("negative_price");
	});

	test("flags candle with negative open", () => {
		const candles = [makeCandle({ open: "-50" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("negative_price");
	});

	test("flags candle with negative high", () => {
		const candles = [makeCandle({ high: "-1" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("negative_price");
	});

	test("flags candle with negative low", () => {
		const candles = [makeCandle({ low: "-1" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("negative_price");
	});

	// --- Zero OHLC ---
	test("flags candle with zero open", () => {
		const candles = [makeCandle({ open: "0" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("zero_ohlc");
	});

	test("flags candle with zero high", () => {
		const candles = [makeCandle({ high: "0" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("zero_ohlc");
	});

	test("flags candle with zero low", () => {
		const candles = [makeCandle({ low: "0" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("zero_ohlc");
	});

	test("flags candle with zero close", () => {
		const candles = [makeCandle({ close: "0" })];
		const results = detectOutliers(candles);
		expect(results[0]!.reasons).toContain("zero_ohlc");
	});

	// --- Price spike (> 50% from previous close) ---
	test("flags candle where close is 60% above previous close", () => {
		const candles = [
			makeCandle({ close: "40000" }, 0),
			// 60% spike: 40000 * 1.6 = 64000
			makeCandle({ close: "64000", open: "40000", high: "65000", low: "39000" }, 1),
		];
		const results = detectOutliers(candles);
		expect(results).toHaveLength(1);
		expect(results[0]!.index).toBe(1);
		expect(results[0]!.reasons).toContain("price_spike");
	});

	test("flags candle where close is 60% below previous close", () => {
		const candles = [
			makeCandle({ close: "40000" }, 0),
			// 60% drop: 40000 * 0.4 = 16000
			makeCandle({ close: "16000", open: "40000", high: "41000", low: "15000" }, 1),
		];
		const results = detectOutliers(candles);
		expect(results).toHaveLength(1);
		expect(results[0]!.index).toBe(1);
		expect(results[0]!.reasons).toContain("price_spike");
	});

	test("does not flag candle with 40% change (below 50% threshold)", () => {
		const candles = [
			makeCandle({ close: "40000" }, 0),
			// 40% spike: 40000 * 1.4 = 56000
			makeCandle({ close: "56000", open: "40000", high: "57000", low: "39000" }, 1),
		];
		const results = detectOutliers(candles);
		expect(results).toHaveLength(0);
	});

	test("does not flag first candle for price spike (no previous close)", () => {
		const candles = [makeCandle({ close: "99999" })];
		const results = detectOutliers(candles);
		// Only zero_ohlc / negative checks apply for first candle
		expect(results.every((r) => !r.reasons.includes("price_spike"))).toBe(true);
	});

	// --- Volume spike (> 10x average) ---
	test("flags candle where volume is 11x the average of previous candles", () => {
		// Build 5 candles with volume 100, then one with 1100 (11x)
		const candles = [
			makeCandle({ volume: "100" }, 0),
			makeCandle({ volume: "100" }, 1),
			makeCandle({ volume: "100" }, 2),
			makeCandle({ volume: "100" }, 3),
			makeCandle({ volume: "100" }, 4),
			makeCandle({ volume: "1100" }, 5), // 11x average of 100
		];
		const results = detectOutliers(candles);
		expect(results).toHaveLength(1);
		expect(results[0]!.index).toBe(5);
		expect(results[0]!.reasons).toContain("volume_spike");
	});

	test("does not flag candle at exactly 10x average", () => {
		const candles = [
			makeCandle({ volume: "100" }, 0),
			makeCandle({ volume: "100" }, 1),
			makeCandle({ volume: "100" }, 2),
			makeCandle({ volume: "1000" }, 3), // exactly 10x
		];
		const results = detectOutliers(candles);
		expect(results.every((r) => !r.reasons.includes("volume_spike"))).toBe(true);
	});

	test("does not flag first candle for volume spike (no history)", () => {
		const candles = [makeCandle({ volume: "999999" })];
		const results = detectOutliers(candles);
		expect(results.every((r) => !r.reasons.includes("volume_spike"))).toBe(true);
	});

	// --- Multiple reasons on same candle ---
	test("accumulates multiple reasons on same candle", () => {
		const candles = [
			makeCandle({ close: "40000" }, 0),
			// price spike + zero open
			makeCandle({ close: "80000", open: "0", high: "81000", low: "39000" }, 1),
		];
		const results = detectOutliers(candles);
		expect(results).toHaveLength(1);
		expect(results[0]!.reasons).toContain("price_spike");
		expect(results[0]!.reasons).toContain("zero_ohlc");
	});

	// --- Result structure ---
	test("result includes candle reference", () => {
		const candles = [makeCandle({ close: "-1" })];
		const results = detectOutliers(candles);
		expect(results[0]!.candle).toBe(candles[0]);
	});

	test("result index matches candle position in array", () => {
		const candles = [
			makeCandle({}, 0),
			makeCandle({}, 1),
			makeCandle({ close: "-1" }, 2),
		];
		const results = detectOutliers(candles);
		expect(results[0]!.index).toBe(2);
	});

	// --- Original array not mutated ---
	test("does not mutate input candles array", () => {
		const candles = [makeCandle({ close: "-1" })];
		const original = [...candles];
		detectOutliers(candles);
		expect(candles).toHaveLength(original.length);
		expect(candles[0]).toBe(original[0]);
	});
});
