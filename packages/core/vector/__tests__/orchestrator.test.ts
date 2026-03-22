import { describe, expect, test } from "bun:test";
import { normalizeFeatures } from "../orchestrator.js";
import type { FeatureInput } from "../types.js";

describe("normalizeFeatures", () => {
	test("normalizes multiple features with different methods", () => {
		const features: FeatureInput[] = [
			{ name: "rsi", value: 70, normalization: { method: "percent" } },
			{ name: "trend", value: 0, normalization: { method: "sigmoid" } },
			{ name: "is_bullish", value: 1, normalization: { method: "boolean" } },
		];

		const vector = normalizeFeatures(features);
		expect(vector).toHaveLength(3);
		expect(vector[0]).toBeCloseTo(0.7);
		expect(vector[1]).toBeCloseTo(0.5);
		expect(vector[2]).toBe(1);
	});

	test("preserves feature order", () => {
		const features: FeatureInput[] = [
			{ name: "a", value: 0.1, normalization: { method: "none" } },
			{ name: "b", value: 0.9, normalization: { method: "none" } },
			{ name: "c", value: 0.5, normalization: { method: "none" } },
		];

		const vector = normalizeFeatures(features);
		expect(vector[0]).toBe(0.1);
		expect(vector[1]).toBe(0.9);
		expect(vector[2]).toBe(0.5);
	});

	test("empty features → empty vector", () => {
		expect(normalizeFeatures([])).toEqual([]);
	});

	test("single feature", () => {
		const features: FeatureInput[] = [
			{ name: "price_pct", value: 50, normalization: { method: "minmax", min: 0, max: 100 } },
		];

		const vector = normalizeFeatures(features);
		expect(vector).toHaveLength(1);
		expect(vector[0]).toBeCloseTo(0.5);
	});

	test("minmax with config", () => {
		const features: FeatureInput[] = [
			{ name: "price", value: 50000, normalization: { method: "minmax", min: 40000, max: 60000 } },
		];

		const vector = normalizeFeatures(features);
		expect(vector[0]).toBeCloseTo(0.5);
	});

	test("normalization failure includes feature name", () => {
		const features: FeatureInput[] = [
			{ name: "bad_feature", value: 50, normalization: { method: "minmax" } },
		];

		expect(() => normalizeFeatures(features)).toThrow("bad_feature");
	});

	test("all values in output are [0,1]", () => {
		const features: FeatureInput[] = [
			{ name: "f1", value: -100, normalization: { method: "sigmoid" } },
			{ name: "f2", value: 200, normalization: { method: "percent" } },
			{ name: "f3", value: -5, normalization: { method: "boolean" } },
		];

		const vector = normalizeFeatures(features);
		for (const v of vector) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});
});
