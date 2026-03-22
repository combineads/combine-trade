import { describe, expect, test } from "bun:test";
import { bb, ema, sma } from "../index.js";

describe("SMA", () => {
	test("SMA(5) of [1,2,3,4,5] = [3]", async () => {
		const result = await sma([1, 2, 3, 4, 5], 5);
		expect(result.length).toBe(1);
		expect(result[0]).toBeCloseTo(3, 5);
	});

	test("SMA(3) of [2,4,6,8,10] = [4, 6, 8]", async () => {
		const result = await sma([2, 4, 6, 8, 10], 3);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(4, 5);
		expect(result[1]).toBeCloseTo(6, 5);
		expect(result[2]).toBeCloseTo(8, 5);
	});

	test("SMA(1) returns input values", async () => {
		const input = [10, 20, 30];
		const result = await sma(input, 1);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(10, 5);
		expect(result[1]).toBeCloseTo(20, 5);
		expect(result[2]).toBeCloseTo(30, 5);
	});

	test("SMA with period > length returns fewer results", async () => {
		const result = await sma([1, 2], 5);
		expect(result.length).toBeLessThanOrEqual(2);
	});

	test("SMA of constant values returns constant", async () => {
		const result = await sma([5, 5, 5, 5, 5], 3);
		for (const v of result) {
			expect(v).toBeCloseTo(5, 5);
		}
	});
});

describe("EMA", () => {
	test("EMA(3) of [1,2,3,4,5] produces expected output", async () => {
		const result = await ema([1, 2, 3, 4, 5], 3);
		expect(result.length).toBeGreaterThan(0);
		// EMA converges toward recent values — last value should be close to 5
		const last = result[result.length - 1];
		expect(last).toBeDefined();
		expect(last!).toBeGreaterThan(3);
		expect(last!).toBeLessThanOrEqual(5);
	});

	test("EMA(1) returns input values", async () => {
		const input = [10, 20, 30];
		const result = await ema(input, 1);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(10, 5);
		expect(result[1]).toBeCloseTo(20, 5);
		expect(result[2]).toBeCloseTo(30, 5);
	});

	test("EMA of constant values returns constant", async () => {
		const result = await ema([7, 7, 7, 7, 7], 3);
		for (const v of result) {
			expect(v).toBeCloseTo(7, 5);
		}
	});

	test("EMA gives more weight to recent values", async () => {
		const result = await ema([1, 1, 1, 1, 10], 3);
		const last = result[result.length - 1];
		const prev = result[result.length - 2];
		expect(last).toBeDefined();
		expect(prev).toBeDefined();
		expect(last!).toBeGreaterThan(prev!);
	});

	test("EMA with period > length still returns values", async () => {
		const result = await ema([1, 2], 5);
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("Bollinger Bands", () => {
	test("BB returns upper, middle, lower bands", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const result = await bb(input, 5);
		expect(result.upper.length).toBeGreaterThan(0);
		expect(result.middle.length).toBeGreaterThan(0);
		expect(result.lower.length).toBeGreaterThan(0);
	});

	test("BB middle band equals SMA", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const bbResult = await bb(input, 5);
		const smaResult = await sma(input, 5);
		expect(bbResult.middle.length).toBe(smaResult.length);
		for (let i = 0; i < smaResult.length; i++) {
			expect(bbResult.middle[i]).toBeCloseTo(smaResult[i]!, 5);
		}
	});

	test("BB upper > middle > lower", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const result = await bb(input, 5);
		for (let i = 0; i < result.middle.length; i++) {
			expect(result.upper[i]).toBeGreaterThanOrEqual(result.middle[i]!);
			expect(result.middle[i]).toBeGreaterThanOrEqual(result.lower[i]!);
		}
	});

	test("BB of constant values has upper = middle = lower", async () => {
		const result = await bb([10, 10, 10, 10, 10], 3);
		for (let i = 0; i < result.middle.length; i++) {
			expect(result.upper[i]).toBeCloseTo(result.middle[i]!, 5);
			expect(result.lower[i]).toBeCloseTo(result.middle[i]!, 5);
		}
	});

	test("BB with higher stddev produces wider bands", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const narrow = await bb(input, 5, 1);
		const wide = await bb(input, 5, 3);
		const lastIdx = narrow.upper.length - 1;
		const narrowWidth = narrow.upper[lastIdx]! - narrow.lower[lastIdx]!;
		const wideWidth = wide.upper[lastIdx]! - wide.lower[lastIdx]!;
		expect(wideWidth).toBeGreaterThan(narrowWidth);
	});
});
