/**
 * Tests for scripts/check-perf-regression.ts
 *
 * These tests exercise the pure comparison functions that detect benchmark
 * regressions. The functions are imported directly, so no subprocess is spawned.
 */
import { describe, expect, test } from "bun:test";
import {
	REGRESSION_THRESHOLD,
	buildComparisonTable,
	checkRegressions,
	parseBenchmarkJson,
} from "../check-perf-regression";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("regression threshold constant", () => {
	test("REGRESSION_THRESHOLD is 1.20", () => {
		expect(REGRESSION_THRESHOLD).toBe(1.2);
	});
});

// ---------------------------------------------------------------------------
// parseBenchmarkJson
// ---------------------------------------------------------------------------

describe("parseBenchmarkJson", () => {
	test("returns null for invalid JSON", () => {
		expect(parseBenchmarkJson("not json")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(parseBenchmarkJson("")).toBeNull();
	});

	test("returns null when benchmarks key is missing", () => {
		const raw = JSON.stringify({ generated_at: "2026-01-01" });
		expect(parseBenchmarkJson(raw)).toBeNull();
	});

	test("parses a valid baseline file", () => {
		const raw = JSON.stringify({
			generated_at: "2026-01-01T00:00:00Z",
			commit: "abc123",
			benchmarks: { "vector-search": 50 },
		});
		const result = parseBenchmarkJson(raw);
		expect(result).not.toBeNull();
		expect(result?.benchmarks["vector-search"]).toBe(50);
	});

	test("parses a baseline with empty benchmarks", () => {
		const raw = JSON.stringify({
			generated_at: "2026-01-01T00:00:00Z",
			commit: "abc123",
			benchmarks: {},
		});
		const result = parseBenchmarkJson(raw);
		expect(result).not.toBeNull();
		expect(Object.keys(result?.benchmarks ?? {})).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// checkRegressions — pass scenarios
// ---------------------------------------------------------------------------

describe("checkRegressions — passing", () => {
	test("passes when current values match baseline exactly", () => {
		const baseline = { "vector-search": 50, "decision-engine": 30 };
		const current = { "vector-search": 50, "decision-engine": 30 };
		const result = checkRegressions(baseline, current);
		expect(result.passed).toBe(true);
		expect(result.regressions).toHaveLength(0);
	});

	test("passes when current is exactly 20% slower (boundary — not exceeding)", () => {
		const baseline = { "vector-search": 100 };
		// 100 * 1.20 = 120 — exactly at threshold, should pass (not exceed)
		const current = { "vector-search": 120 };
		const result = checkRegressions(baseline, current);
		expect(result.passed).toBe(true);
	});

	test("passes when current is faster than baseline", () => {
		const baseline = { "vector-search": 100 };
		const current = { "vector-search": 80 };
		const result = checkRegressions(baseline, current);
		expect(result.passed).toBe(true);
	});

	test("passes when baseline has no benchmarks (empty object)", () => {
		const result = checkRegressions({}, { "vector-search": 100 });
		expect(result.passed).toBe(true);
		expect(result.regressions).toHaveLength(0);
	});

	test("ignores benchmarks present in current but not in baseline", () => {
		const baseline = { "vector-search": 50 };
		const current = { "vector-search": 55, "new-bench": 999 };
		const result = checkRegressions(baseline, current);
		expect(result.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// checkRegressions — failure scenarios
// ---------------------------------------------------------------------------

describe("checkRegressions — failing", () => {
	test("fails when current exceeds baseline by more than 20%", () => {
		const baseline = { "vector-search": 100 };
		const current = { "vector-search": 121 }; // 21% slower
		const result = checkRegressions(baseline, current);
		expect(result.passed).toBe(false);
		expect(result.regressions).toHaveLength(1);
		expect(result.regressions[0].name).toBe("vector-search");
	});

	test("fails with multiple regressions detected", () => {
		const baseline = { "vector-search": 50, "decision-engine": 30 };
		const current = { "vector-search": 70, "decision-engine": 40 }; // both >20% slower
		const result = checkRegressions(baseline, current);
		expect(result.passed).toBe(false);
		expect(result.regressions).toHaveLength(2);
	});

	test("regression entry includes ratio", () => {
		const baseline = { "vector-search": 100 };
		const current = { "vector-search": 150 }; // 50% slower
		const result = checkRegressions(baseline, current);
		expect(result.regressions[0].ratio).toBeCloseTo(1.5, 2);
	});

	test("regression entry includes baseline and current values", () => {
		const baseline = { "bench-a": 200 };
		const current = { "bench-a": 260 };
		const result = checkRegressions(baseline, current);
		expect(result.regressions[0].baseline).toBe(200);
		expect(result.regressions[0].current).toBe(260);
	});
});

// ---------------------------------------------------------------------------
// buildComparisonTable
// ---------------------------------------------------------------------------

describe("buildComparisonTable", () => {
	test("returns a non-empty string", () => {
		const baseline = { "vector-search": 100 };
		const current = { "vector-search": 110 };
		const rows = buildComparisonTable(baseline, current, []);
		expect(typeof rows).toBe("string");
		expect(rows.length).toBeGreaterThan(0);
	});

	test("includes benchmark name in output", () => {
		const baseline = { "vector-search": 100 };
		const current = { "vector-search": 130 };
		const regressions = [{ name: "vector-search", baseline: 100, current: 130, ratio: 1.3 }];
		const rows = buildComparisonTable(baseline, current, regressions);
		expect(rows).toContain("vector-search");
	});

	test("marks regressions with FAIL indicator", () => {
		const baseline = { "bench-x": 100 };
		const current = { "bench-x": 130 };
		const regressions = [{ name: "bench-x", baseline: 100, current: 130, ratio: 1.3 }];
		const rows = buildComparisonTable(baseline, current, regressions);
		expect(rows).toContain("FAIL");
	});

	test("marks passing benchmarks with PASS indicator", () => {
		const baseline = { "bench-y": 100 };
		const current = { "bench-y": 110 };
		const rows = buildComparisonTable(baseline, current, []);
		expect(rows).toContain("PASS");
	});
});
