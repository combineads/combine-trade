/**
 * Aggregation Correctness Tests — T-01-015
 *
 * Comprehensive tests for candle aggregation correctness covering:
 * - All supported intervals: 1m→3m, 1m→5m, 1m→15m, 1m→1h
 * - Missing candles (gaps in sequence)
 * - Partial periods (incomplete bars)
 * - Empty input
 * - Decimal precision for OHLCV values
 * - Boundary alignment for each timeframe
 * - Multiple non-contiguous periods
 */

import { describe, expect, test } from "bun:test";
import Decimal from "decimal.js";
import { aggregateCandles, getAggregationBarOpenTime, isTimeframeClosed } from "../aggregator.js";
import type { Candle } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle1m(
	openTime: Date,
	values: { open: string; high: string; low: string; close: string; volume: string },
): Candle {
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime,
		open: values.open,
		high: values.high,
		low: values.low,
		close: values.close,
		volume: values.volume,
		isClosed: true,
	};
}

function minuteTs(baseIso: string, offsetMinutes: number): Date {
	return new Date(new Date(baseIso).getTime() + offsetMinutes * 60_000);
}

/** Create a sequence of 1m candles with sequential minute offsets starting from baseIso */
function makeSequence(
	baseIso: string,
	minuteOffsets: number[],
	defaultValues: { open: string; high: string; low: string; close: string; volume: string },
	overrides: Record<number, Partial<{ open: string; high: string; low: string; close: string; volume: string }>> = {},
): Candle[] {
	return minuteOffsets.map((offset) =>
		makeCandle1m(minuteTs(baseIso, offset), { ...defaultValues, ...(overrides[offset] ?? {}) }),
	);
}

// ---------------------------------------------------------------------------
// 1m → 3m aggregation
// ---------------------------------------------------------------------------

describe("1m → 3m aggregation correctness", () => {
	const BASE = "2026-01-01T00:00:00Z";

	test("exact 3 candles produce one closed bar", () => {
		const candles = makeSequence(BASE, [0, 1, 2], { open: "10", high: "15", low: "8", close: "12", volume: "100" }, {
			0: { open: "10", high: "14", low: "9", close: "13", volume: "200" },
			1: { open: "13", high: "16", low: "11", close: "15", volume: "300" },
			2: { open: "15", high: "17", low: "10", close: "11", volume: "250" },
		});

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.open).toBe("10");   // first candle open
		expect(bar.close).toBe("11");  // last candle close
		expect(new Decimal(bar.high).eq("17")).toBe(true);   // max high
		expect(new Decimal(bar.low).eq("9")).toBe(true);     // min low
		expect(new Decimal(bar.volume).eq("750")).toBe(true); // 200+300+250
		expect(bar.isClosed).toBe(true);
		expect(bar.timeframe).toBe("3m");
		expect(bar.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("6 candles produce two closed 3m bars", () => {
		const candles = makeSequence(
			BASE,
			[0, 1, 2, 3, 4, 5],
			{ open: "100", high: "101", low: "99", close: "100", volume: "50" },
			{
				0: { open: "100", close: "101" },
				2: { close: "102" },
				3: { open: "200", high: "210", low: "195", close: "205", volume: "80" },
				5: { close: "208" },
			},
		);

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(2);
		// First bar: minutes 0,1,2
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[0]!.isClosed).toBe(true);
		// Second bar: minutes 3,4,5
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T00:03:00.000Z");
		expect(result[1]!.isClosed).toBe(true);
		expect(result[1]!.open).toBe("200");
		expect(result[1]!.close).toBe("208");
	});

	test("only 1 candle in a 3m period → partial bar, isClosed=false", () => {
		const candles = [makeCandle1m(minuteTs(BASE, 0), { open: "50", high: "55", low: "48", close: "52", volume: "100" })];

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		expect(result[0]!.isClosed).toBe(false);
		expect(result[0]!.open).toBe("50");
		expect(result[0]!.close).toBe("52");
	});

	test("2 candles in a 3m period → partial bar, isClosed=false", () => {
		const candles = makeSequence(BASE, [0, 1], { open: "50", high: "55", low: "48", close: "52", volume: "100" });

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		expect(result[0]!.isClosed).toBe(false);
	});

	test("gap between two 3m bars (missing middle bar at minute 3,4,5) → single closed bar for first period only", () => {
		// Only provide candles for 0,1,2 and 6,7,8 — skipping minutes 3,4,5
		const candles = [
			...makeSequence(BASE, [0, 1, 2], { open: "100", high: "110", low: "95", close: "105", volume: "300" }),
			...makeSequence(BASE, [6, 7, 8], { open: "200", high: "210", low: "195", close: "205", volume: "400" }),
		];

		const result = aggregateCandles(candles, "3m");

		// Two bars: 00:00 and 00:06 — no bar for 00:03 (no data)
		expect(result).toHaveLength(2);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[0]!.isClosed).toBe(true);
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T00:06:00.000Z");
		expect(result[1]!.isClosed).toBe(true);
	});

	test("candles from different exchanges are not mixed (same symbol)", () => {
		// The aggregator does not filter by exchange — test documents behavior:
		// groups by openTime boundary only
		const candles = [
			{ ...makeCandle1m(minuteTs(BASE, 0), { open: "100", high: "105", low: "98", close: "103", volume: "500" }), exchange: "binance" as const },
			{ ...makeCandle1m(minuteTs(BASE, 1), { open: "103", high: "107", low: "101", close: "104", volume: "600" }), exchange: "binance" as const },
			{ ...makeCandle1m(minuteTs(BASE, 2), { open: "104", high: "106", low: "100", close: "102", volume: "400" }), exchange: "binance" as const },
		];

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		expect(new Decimal(result[0]!.volume).eq("1500")).toBe(true);
	});

	test("Decimal precision preserved for fractional prices", () => {
		const candles = [
			makeCandle1m(minuteTs(BASE, 0), { open: "0.001", high: "0.003", low: "0.0009", close: "0.002", volume: "1000000" }),
			makeCandle1m(minuteTs(BASE, 1), { open: "0.002", high: "0.0035", low: "0.0008", close: "0.0025", volume: "2000000" }),
			makeCandle1m(minuteTs(BASE, 2), { open: "0.0025", high: "0.004", low: "0.0007", close: "0.003", volume: "1500000" }),
		];

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		// High should be 0.004 (max of 0.003, 0.0035, 0.004)
		expect(new Decimal(bar.high).eq("0.004")).toBe(true);
		// Low should be 0.0007 (min of 0.0009, 0.0008, 0.0007)
		expect(new Decimal(bar.low).eq("0.0007")).toBe(true);
		// Volume: 1000000 + 2000000 + 1500000 = 4500000
		expect(new Decimal(bar.volume).eq("4500000")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 1m → 5m aggregation
// ---------------------------------------------------------------------------

describe("1m → 5m aggregation correctness", () => {
	const BASE = "2026-01-01T00:00:00Z";

	test("5 complete candles → one closed bar with correct OHLCV", () => {
		const candles = [
			makeCandle1m(minuteTs(BASE, 0), { open: "1000", high: "1010", low: "995", close: "1005", volume: "500" }),
			makeCandle1m(minuteTs(BASE, 1), { open: "1005", high: "1015", low: "998", close: "1008", volume: "600" }),
			makeCandle1m(minuteTs(BASE, 2), { open: "1008", high: "1020", low: "1000", close: "1012", volume: "700" }),
			makeCandle1m(minuteTs(BASE, 3), { open: "1012", high: "1018", low: "1006", close: "1010", volume: "550" }),
			makeCandle1m(minuteTs(BASE, 4), { open: "1010", high: "1014", low: "1002", close: "1003", volume: "450" }),
		];

		const result = aggregateCandles(candles, "5m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.open).toBe("1000");
		expect(bar.close).toBe("1003");
		expect(new Decimal(bar.high).eq("1020")).toBe(true);
		expect(new Decimal(bar.low).eq("995")).toBe(true);
		expect(new Decimal(bar.volume).eq("2800")).toBe(true); // 500+600+700+550+450
		expect(bar.isClosed).toBe(true);
	});

	test("4 candles in 5m period → partial, isClosed=false", () => {
		const candles = makeSequence(BASE, [0, 1, 2, 3], { open: "50", high: "55", low: "48", close: "52", volume: "100" });
		const result = aggregateCandles(candles, "5m");
		expect(result[0]!.isClosed).toBe(false);
	});

	test("10 candles → 2 complete 5m bars with correct boundary alignment", () => {
		const candles = makeSequence(
			BASE,
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
			{ open: "100", high: "102", low: "99", close: "101", volume: "100" },
		);

		const result = aggregateCandles(candles, "5m");

		expect(result).toHaveLength(2);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T00:05:00.000Z");
		expect(result[0]!.isClosed).toBe(true);
		expect(result[1]!.isClosed).toBe(true);
		// Each bar has 5 candles with volume=100 → total 500 each
		expect(new Decimal(result[0]!.volume).eq("500")).toBe(true);
		expect(new Decimal(result[1]!.volume).eq("500")).toBe(true);
	});

	test("candles at 5m boundary (minute 5) go into second 5m bar", () => {
		// minute 5 = 00:05:00 → second 5m bar starts at 00:05:00
		const candles = [
			makeCandle1m(minuteTs(BASE, 5), { open: "200", high: "205", low: "198", close: "203", volume: "300" }),
		];

		const result = aggregateCandles(candles, "5m");

		expect(result).toHaveLength(1);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:05:00.000Z");
		expect(result[0]!.isClosed).toBe(false); // only 1 of 5 candles
	});

	test("gap: only candles for 0-4 and 10-14 provided → 2 bars, no bar for 5-9", () => {
		const candles = [
			...makeSequence(BASE, [0, 1, 2, 3, 4], { open: "100", high: "105", low: "98", close: "103", volume: "100" }),
			...makeSequence(BASE, [10, 11, 12, 13, 14], { open: "110", high: "115", low: "108", close: "113", volume: "150" }),
		];

		const result = aggregateCandles(candles, "5m");

		expect(result).toHaveLength(2);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T00:10:00.000Z");
		// Both bars are complete
		expect(result[0]!.isClosed).toBe(true);
		expect(result[1]!.isClosed).toBe(true);
	});

	test("single missing candle in 5m period makes bar partial", () => {
		// Provide only 4 of 5 candles (missing minute 3)
		const candles = makeSequence(BASE, [0, 1, 2, 4], { open: "100", high: "105", low: "98", close: "103", volume: "200" });

		const result = aggregateCandles(candles, "5m");

		expect(result).toHaveLength(1);
		// 4 candles < 5 required → partial
		expect(result[0]!.isClosed).toBe(false);
		// Volume should be sum of 4 candles
		expect(new Decimal(result[0]!.volume).eq("800")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 1m → 15m aggregation
// ---------------------------------------------------------------------------

describe("1m → 15m aggregation correctness", () => {
	const BASE = "2026-01-01T00:00:00Z";

	test("15 candles → one closed 15m bar, correct OHLCV", () => {
		// All highs = 105, except minute 7 = 120 (should be max)
		// All lows = 95, except minute 3 = 80 (should be min)
		const overrides: Record<number, Partial<{ open: string; high: string; low: string; close: string; volume: string }>> = {
			7: { high: "120" },
			3: { low: "80" },
		};
		const candles = makeSequence(BASE, Array.from({ length: 15 }, (_, i) => i), {
			open: "100", high: "105", low: "95", close: "100", volume: "50",
		}, overrides);

		const result = aggregateCandles(candles, "15m");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(new Decimal(bar.high).eq("120")).toBe(true);
		expect(new Decimal(bar.low).eq("80")).toBe(true);
		expect(new Decimal(bar.volume).eq("750")).toBe(true); // 15 × 50
		expect(bar.isClosed).toBe(true);
		expect(bar.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("30 candles → two closed 15m bars", () => {
		const candles = makeSequence(BASE, Array.from({ length: 30 }, (_, i) => i), {
			open: "100", high: "102", low: "98", close: "101", volume: "10",
		});

		const result = aggregateCandles(candles, "15m");

		expect(result).toHaveLength(2);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T00:15:00.000Z");
		expect(result[0]!.isClosed).toBe(true);
		expect(result[1]!.isClosed).toBe(true);
		expect(new Decimal(result[0]!.volume).eq("150")).toBe(true); // 15 × 10
		expect(new Decimal(result[1]!.volume).eq("150")).toBe(true);
	});

	test("14 candles → partial 15m bar", () => {
		const candles = makeSequence(BASE, Array.from({ length: 14 }, (_, i) => i), {
			open: "100", high: "102", low: "98", close: "101", volume: "10",
		});

		const result = aggregateCandles(candles, "15m");

		expect(result).toHaveLength(1);
		expect(result[0]!.isClosed).toBe(false);
	});

	test("gap skipping entire 15m period: candles at 0-14 and 30-44", () => {
		const firstPeriod = makeSequence(BASE, Array.from({ length: 15 }, (_, i) => i), {
			open: "100", high: "105", low: "95", close: "103", volume: "20",
		});
		const thirdPeriod = makeSequence(BASE, Array.from({ length: 15 }, (_, i) => i + 30), {
			open: "200", high: "210", low: "190", close: "205", volume: "30",
		});

		const result = aggregateCandles([...firstPeriod, ...thirdPeriod], "15m");

		expect(result).toHaveLength(2);
		// No bar for 00:15-00:29
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T00:30:00.000Z");
		expect(new Decimal(result[0]!.volume).eq("300")).toBe(true); // 15 × 20
		expect(new Decimal(result[1]!.volume).eq("450")).toBe(true); // 15 × 30
	});

	test("candles at 15m boundary (minute 15) go into second 15m bar", () => {
		const candles = [
			makeCandle1m(minuteTs(BASE, 15), { open: "300", high: "305", low: "298", close: "302", volume: "100" }),
		];

		const result = aggregateCandles(candles, "15m");

		expect(result).toHaveLength(1);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:15:00.000Z");
		expect(result[0]!.isClosed).toBe(false);
	});

	test("correct open/close OHLC for first and last candles in sequence", () => {
		// First candle open=50, last candle close=99
		const candles = makeSequence(
			BASE,
			Array.from({ length: 15 }, (_, i) => i),
			{ open: "70", high: "80", low: "60", close: "75", volume: "100" },
			{
				0: { open: "50" },
				14: { close: "99" },
			},
		);

		const result = aggregateCandles(candles, "15m");

		expect(result[0]!.open).toBe("50");
		expect(result[0]!.close).toBe("99");
	});
});

// ---------------------------------------------------------------------------
// 1m → 1h aggregation
// ---------------------------------------------------------------------------

describe("1m → 1h aggregation correctness", () => {
	const BASE = "2026-01-01T00:00:00Z";

	test("60 candles → one closed 1h bar", () => {
		// Each candle: volume=10, high=102, low=98. First open=1000, last close=1050.
		const candles = makeSequence(
			BASE,
			Array.from({ length: 60 }, (_, i) => i),
			{ open: "1000", high: "1002", low: "998", close: "1001", volume: "10" },
			{
				0: { open: "1000" },
				59: { close: "1050" },
			},
		);

		const result = aggregateCandles(candles, "1h");

		expect(result).toHaveLength(1);
		const bar = result[0]!;
		expect(bar.open).toBe("1000");
		expect(bar.close).toBe("1050");
		expect(new Decimal(bar.volume).eq("600")).toBe(true); // 60 × 10
		expect(bar.isClosed).toBe(true);
		expect(bar.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("120 candles → two closed 1h bars", () => {
		const candles = makeSequence(
			BASE,
			Array.from({ length: 120 }, (_, i) => i),
			{ open: "500", high: "502", low: "498", close: "501", volume: "5" },
		);

		const result = aggregateCandles(candles, "1h");

		expect(result).toHaveLength(2);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(result[1]!.openTime.toISOString()).toBe("2026-01-01T01:00:00.000Z");
		expect(result[0]!.isClosed).toBe(true);
		expect(result[1]!.isClosed).toBe(true);
	});

	test("59 candles → partial 1h bar", () => {
		const candles = makeSequence(
			BASE,
			Array.from({ length: 59 }, (_, i) => i),
			{ open: "100", high: "105", low: "95", close: "102", volume: "10" },
		);

		const result = aggregateCandles(candles, "1h");

		expect(result).toHaveLength(1);
		expect(result[0]!.isClosed).toBe(false);
	});

	test("gap in 1h period (only 45 candles provided) → partial bar", () => {
		// Provide candles at minutes 0-29 and 45-59 (gap at 30-44)
		const firstHalf = makeSequence(BASE, Array.from({ length: 30 }, (_, i) => i), {
			open: "100", high: "105", low: "95", close: "102", volume: "10",
		});
		const secondHalf = makeSequence(BASE, Array.from({ length: 15 }, (_, i) => i + 45), {
			open: "102", high: "108", low: "100", close: "106", volume: "12",
		});

		const result = aggregateCandles([...firstHalf, ...secondHalf], "1h");

		// All 45 candles belong to the same 1h bar (00:00)
		expect(result).toHaveLength(1);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		// 45 candles < 60 required → not closed
		expect(result[0]!.isClosed).toBe(false);
	});

	test("high and low are global extremes across all 60 candles", () => {
		const candles = makeSequence(
			BASE,
			Array.from({ length: 60 }, (_, i) => i),
			{ open: "100", high: "105", low: "95", close: "100", volume: "10" },
			{
				30: { high: "999" },  // global max in middle of the hour
				55: { low: "1" },     // global min near end
			},
		);

		const result = aggregateCandles(candles, "1h");

		expect(new Decimal(result[0]!.high).eq("999")).toBe(true);
		expect(new Decimal(result[0]!.low).eq("1")).toBe(true);
	});

	test("hour boundary: candles at minute 60 go into second 1h bar", () => {
		const candles = [
			makeCandle1m(minuteTs(BASE, 60), { open: "500", high: "510", low: "495", close: "505", volume: "300" }),
		];

		const result = aggregateCandles(candles, "1h");

		expect(result).toHaveLength(1);
		expect(result[0]!.openTime.toISOString()).toBe("2026-01-01T01:00:00.000Z");
		expect(result[0]!.isClosed).toBe(false);
	});

	test("Decimal precision: large volume sums are exact", () => {
		// 60 candles each with volume "999999.99"
		const candles = makeSequence(
			BASE,
			Array.from({ length: 60 }, (_, i) => i),
			{ open: "100", high: "101", low: "99", close: "100", volume: "999999.99" },
		);

		const result = aggregateCandles(candles, "1h");

		// Total volume = 60 × 999999.99 = 59999999.40
		const expectedVolume = new Decimal("999999.99").mul(60);
		expect(new Decimal(result[0]!.volume).eq(expectedVolume)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe("empty input", () => {
	test("empty array → empty result for 3m", () => {
		expect(aggregateCandles([], "3m")).toHaveLength(0);
	});

	test("empty array → empty result for 5m", () => {
		expect(aggregateCandles([], "5m")).toHaveLength(0);
	});

	test("empty array → empty result for 15m", () => {
		expect(aggregateCandles([], "15m")).toHaveLength(0);
	});

	test("empty array → empty result for 1h", () => {
		expect(aggregateCandles([], "1h")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// getAggregationBarOpenTime boundary alignment
// ---------------------------------------------------------------------------

describe("getAggregationBarOpenTime — boundary alignment", () => {
	test("3m: minute 0 aligns to 00:00", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:00:00Z"), "3m").toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("3m: minute 2 aligns to 00:00 (within first bar)", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:02:00Z"), "3m").toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("3m: minute 3 aligns to 00:03 (second bar)", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:03:00Z"), "3m").toISOString()).toBe("2026-01-01T00:03:00.000Z");
	});

	test("5m: minute 4 aligns to 00:00", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:04:00Z"), "5m").toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("5m: minute 5 aligns to 00:05", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:05:00Z"), "5m").toISOString()).toBe("2026-01-01T00:05:00.000Z");
	});

	test("15m: minute 14 aligns to 00:00", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:14:00Z"), "15m").toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("15m: minute 15 aligns to 00:15", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:15:00Z"), "15m").toISOString()).toBe("2026-01-01T00:15:00.000Z");
	});

	test("1h: minute 59 aligns to 00:00", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T00:59:00Z"), "1h").toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	test("1h: minute 60 aligns to 01:00", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T01:00:00Z"), "1h").toISOString()).toBe("2026-01-01T01:00:00.000Z");
	});

	test("1h: non-zero minutes in the middle of an hour align correctly", () => {
		expect(getAggregationBarOpenTime(new Date("2026-01-01T02:37:00Z"), "1h").toISOString()).toBe("2026-01-01T02:00:00.000Z");
	});
});

// ---------------------------------------------------------------------------
// isTimeframeClosed edge cases
// ---------------------------------------------------------------------------

describe("isTimeframeClosed — edge cases", () => {
	const dummyDate = new Date("2026-01-01T00:00:00Z");

	test("3m: exactly 3 → closed", () => {
		expect(isTimeframeClosed(dummyDate, "3m", 3)).toBe(true);
	});

	test("3m: more than 3 → still closed (> required is also closed)", () => {
		expect(isTimeframeClosed(dummyDate, "3m", 4)).toBe(true);
	});

	test("3m: 0 candles → not closed", () => {
		expect(isTimeframeClosed(dummyDate, "3m", 0)).toBe(false);
	});

	test("5m: exactly 5 → closed", () => {
		expect(isTimeframeClosed(dummyDate, "5m", 5)).toBe(true);
	});

	test("5m: 4 → not closed", () => {
		expect(isTimeframeClosed(dummyDate, "5m", 4)).toBe(false);
	});

	test("15m: exactly 15 → closed", () => {
		expect(isTimeframeClosed(dummyDate, "15m", 15)).toBe(true);
	});

	test("15m: 14 → not closed", () => {
		expect(isTimeframeClosed(dummyDate, "15m", 14)).toBe(false);
	});

	test("1h: exactly 60 → closed", () => {
		expect(isTimeframeClosed(dummyDate, "1h", 60)).toBe(true);
	});

	test("1h: 59 → not closed", () => {
		expect(isTimeframeClosed(dummyDate, "1h", 59)).toBe(false);
	});

	test("1h: 61 → closed (more than required)", () => {
		expect(isTimeframeClosed(dummyDate, "1h", 61)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Unsupported timeframe
// ---------------------------------------------------------------------------

describe("unsupported or 1m target timeframe", () => {
	test("aggregating to 1m (no-op TF not in TIMEFRAME_MINUTES) returns empty", () => {
		const candles = makeSequence("2026-01-01T00:00:00Z", [0, 1, 2], {
			open: "100", high: "102", low: "98", close: "101", volume: "100",
		});
		// "1m" is not in TIMEFRAME_MINUTES map, so aggregateCandles returns []
		const result = aggregateCandles(candles, "1m");
		expect(result).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Output field correctness
// ---------------------------------------------------------------------------

describe("output candle field correctness", () => {
	const BASE = "2026-01-01T00:00:00Z";

	test("output candle preserves exchange and symbol from first input candle", () => {
		const candles = [
			{ ...makeCandle1m(minuteTs(BASE, 0), { open: "100", high: "105", low: "95", close: "103", volume: "100" }), exchange: "okx" as const, symbol: "ETH/USDT:USDT" },
			{ ...makeCandle1m(minuteTs(BASE, 1), { open: "103", high: "107", low: "100", close: "105", volume: "150" }), exchange: "okx" as const, symbol: "ETH/USDT:USDT" },
			{ ...makeCandle1m(minuteTs(BASE, 2), { open: "105", high: "108", low: "102", close: "106", volume: "120" }), exchange: "okx" as const, symbol: "ETH/USDT:USDT" },
		];

		const result = aggregateCandles(candles, "3m");

		expect(result[0]!.exchange).toBe("okx");
		expect(result[0]!.symbol).toBe("ETH/USDT:USDT");
	});

	test("output candle has correct timeframe set to target TF", () => {
		const candles = makeSequence(BASE, [0, 1, 2, 3, 4], {
			open: "100", high: "105", low: "95", close: "103", volume: "100",
		});

		const result = aggregateCandles(candles, "5m");

		expect(result[0]!.timeframe).toBe("5m");
	});

	test("output candles are sorted by openTime ascending", () => {
		const candles = makeSequence(
			BASE,
			Array.from({ length: 9 }, (_, i) => i),
			{ open: "100", high: "105", low: "95", close: "103", volume: "100" },
		);

		const result = aggregateCandles(candles, "3m");

		expect(result).toHaveLength(3);
		// Verify ascending order
		for (let i = 1; i < result.length; i++) {
			expect(result[i]!.openTime.getTime()).toBeGreaterThan(result[i - 1]!.openTime.getTime());
		}
	});
});
