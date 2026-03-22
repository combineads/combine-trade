import { describe, expect, test } from "bun:test";
import {
	normalize,
	normalizeBoolean,
	normalizeMinmax,
	normalizeNone,
	normalizePercent,
	normalizePercentile,
	normalizeSigmoid,
} from "../normalize.js";

describe("normalizePercent", () => {
	test("converts percentage to [0,1]", () => {
		expect(normalizePercent(50)).toBeCloseTo(0.5);
		expect(normalizePercent(0)).toBe(0);
		expect(normalizePercent(100)).toBe(1);
	});

	test("clamps values outside 0-100", () => {
		expect(normalizePercent(150)).toBe(1);
		expect(normalizePercent(-10)).toBe(0);
	});

	test("handles NaN → 0", () => {
		expect(normalizePercent(Number.NaN)).toBe(0);
	});

	test("handles Infinity", () => {
		expect(normalizePercent(Number.POSITIVE_INFINITY)).toBe(1);
		expect(normalizePercent(Number.NEGATIVE_INFINITY)).toBe(0);
	});
});

describe("normalizeSigmoid", () => {
	test("maps 0 to 0.5", () => {
		expect(normalizeSigmoid(0)).toBeCloseTo(0.5);
	});

	test("maps large positive to ~1", () => {
		expect(normalizeSigmoid(10)).toBeCloseTo(1, 4);
	});

	test("maps large negative to ~0", () => {
		expect(normalizeSigmoid(-10)).toBeCloseTo(0, 4);
	});

	test("output always in [0,1]", () => {
		for (const v of [-1000, -1, 0, 1, 1000]) {
			const result = normalizeSigmoid(v);
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		}
	});

	test("handles NaN → 0", () => {
		expect(normalizeSigmoid(Number.NaN)).toBe(0);
	});

	test("handles Infinity", () => {
		expect(normalizeSigmoid(Number.POSITIVE_INFINITY)).toBe(1);
		expect(normalizeSigmoid(Number.NEGATIVE_INFINITY)).toBe(0);
	});
});

describe("normalizeBoolean", () => {
	test("positive → 1", () => {
		expect(normalizeBoolean(1)).toBe(1);
		expect(normalizeBoolean(0.5)).toBe(1);
		expect(normalizeBoolean(100)).toBe(1);
	});

	test("zero and negative → 0", () => {
		expect(normalizeBoolean(0)).toBe(0);
		expect(normalizeBoolean(-1)).toBe(0);
	});

	test("handles NaN → 0", () => {
		expect(normalizeBoolean(Number.NaN)).toBe(0);
	});
});

describe("normalizeMinmax", () => {
	test("scales value within domain range", () => {
		expect(normalizeMinmax(50, 0, 100)).toBeCloseTo(0.5);
		expect(normalizeMinmax(0, 0, 100)).toBe(0);
		expect(normalizeMinmax(100, 0, 100)).toBe(1);
	});

	test("clamps outside range", () => {
		expect(normalizeMinmax(150, 0, 100)).toBe(1);
		expect(normalizeMinmax(-10, 0, 100)).toBe(0);
	});

	test("zero range (min === max) → 0", () => {
		expect(normalizeMinmax(5, 5, 5)).toBe(0);
	});

	test("handles NaN → 0", () => {
		expect(normalizeMinmax(Number.NaN, 0, 100)).toBe(0);
	});

	test("handles Infinity", () => {
		expect(normalizeMinmax(Number.POSITIVE_INFINITY, 0, 100)).toBe(1);
		expect(normalizeMinmax(Number.NEGATIVE_INFINITY, 0, 100)).toBe(0);
	});
});

describe("normalizePercentile", () => {
	test("computes percentile rank within history", () => {
		const history = [10, 20, 30, 40, 50];
		expect(normalizePercentile(30, history)).toBeCloseTo(0.5);
	});

	test("value below all history → 0", () => {
		const history = [10, 20, 30];
		expect(normalizePercentile(5, history)).toBe(0);
	});

	test("value above all history → 1", () => {
		const history = [10, 20, 30];
		expect(normalizePercentile(35, history)).toBe(1);
	});

	test("empty history → 0.5", () => {
		expect(normalizePercentile(10, [])).toBe(0.5);
	});

	test("single value in history", () => {
		expect(normalizePercentile(10, [10])).toBeCloseTo(0.5);
	});

	test("handles NaN → 0", () => {
		expect(normalizePercentile(Number.NaN, [1, 2, 3])).toBe(0);
	});
});

describe("normalizeNone", () => {
	test("passes through value in [0,1]", () => {
		expect(normalizeNone(0.5)).toBe(0.5);
		expect(normalizeNone(0)).toBe(0);
		expect(normalizeNone(1)).toBe(1);
	});

	test("throws for value outside [0,1]", () => {
		expect(() => normalizeNone(1.5)).toThrow();
		expect(() => normalizeNone(-0.1)).toThrow();
	});

	test("handles NaN → 0", () => {
		expect(normalizeNone(Number.NaN)).toBe(0);
	});
});

describe("normalize dispatcher", () => {
	test("dispatches to correct normalizer by method", () => {
		expect(normalize(50, { method: "percent" })).toBeCloseTo(0.5);
		expect(normalize(0, { method: "sigmoid" })).toBeCloseTo(0.5);
		expect(normalize(1, { method: "boolean" })).toBe(1);
		expect(normalize(50, { method: "minmax", min: 0, max: 100 })).toBeCloseTo(0.5);
		expect(normalize(0.7, { method: "none" })).toBe(0.7);
	});

	test("percentile with history", () => {
		const result = normalize(30, { method: "percentile" }, [10, 20, 30, 40, 50]);
		expect(result).toBeCloseTo(0.5);
	});

	test("minmax requires min/max config", () => {
		expect(() => normalize(50, { method: "minmax" })).toThrow("min and max");
	});

	test("unknown method throws", () => {
		expect(() => normalize(50, { method: "unknown" as never })).toThrow();
	});
});
