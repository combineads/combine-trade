import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import type { UseCandleDataResult } from "../src/hooks/use-candle-data";

// Since this is a React hook, we test the logic functions directly
// rather than rendering with a test renderer

describe("useCandleData types and logic", () => {
	test("module exports useCandleData hook and types", async () => {
		const mod = await import("../src/hooks/use-candle-data");
		expect(mod.useCandleData).toBeDefined();
		expect(typeof mod.useCandleData).toBe("function");
	});

	test("mergeBars sorts bars chronologically and deduplicates by time", async () => {
		const mod = await import("../src/hooks/use-candle-data");
		const existing = [
			{ time: 100, open: 1, high: 2, low: 0, close: 1 },
			{ time: 200, open: 2, high: 3, low: 1, close: 2 },
		];
		const incoming = [
			{ time: 200, open: 2.5, high: 3.5, low: 1.5, close: 2.5 }, // duplicate - should replace
			{ time: 300, open: 3, high: 4, low: 2, close: 3 },
		];
		const result = mod.mergeBars(existing, incoming);
		expect(result).toHaveLength(3);
		expect(result[0].time).toBe(100);
		expect(result[1].time).toBe(200);
		expect(result[1].close).toBe(2.5); // updated value
		expect(result[2].time).toBe(300);
	});

	test("mergeBars handles empty arrays", async () => {
		const mod = await import("../src/hooks/use-candle-data");
		expect(mod.mergeBars([], [])).toEqual([]);
		const bars = [{ time: 100, open: 1, high: 2, low: 0, close: 1 }];
		expect(mod.mergeBars(bars, [])).toEqual(bars);
		expect(mod.mergeBars([], bars)).toEqual(bars);
	});

	test("parseCandleResponse transforms API response to OHLCVBar array", async () => {
		const mod = await import("../src/hooks/use-candle-data");
		const apiResponse = {
			data: [
				{ openTime: "2026-01-01T00:00:00Z", open: "100", high: "110", low: "90", close: "105", volume: "1000" },
			],
			meta: { total: 1, page: 1, pageSize: 500, totalPages: 1 },
		};
		const bars = mod.parseCandleResponse(apiResponse.data);
		expect(bars).toHaveLength(1);
		expect(bars[0].open).toBe(100);
		expect(bars[0].high).toBe(110);
		expect(bars[0].time).toBeGreaterThan(0);
	});
});
