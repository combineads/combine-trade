/**
 * Tests for scripts/check-coverage.ts
 *
 * These tests exercise the coverage threshold logic directly by importing
 * and calling the pure functions that perform threshold checks.
 */
import { describe, expect, test } from "bun:test";
import {
	CORE_COVERAGE_THRESHOLD,
	OVERALL_COVERAGE_THRESHOLD,
	buildCoverageReport,
	checkThresholds,
	parseCoverageJson,
} from "../check-coverage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("coverage threshold constants", () => {
	test("CORE_COVERAGE_THRESHOLD is 90", () => {
		expect(CORE_COVERAGE_THRESHOLD).toBe(90);
	});

	test("OVERALL_COVERAGE_THRESHOLD is 80", () => {
		expect(OVERALL_COVERAGE_THRESHOLD).toBe(80);
	});
});

// ---------------------------------------------------------------------------
// parseCoverageJson
// ---------------------------------------------------------------------------

describe("parseCoverageJson", () => {
	test("returns null for invalid JSON", () => {
		expect(parseCoverageJson("not json")).toBeNull();
	});

	test("returns null for non-object JSON", () => {
		expect(parseCoverageJson("42")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(parseCoverageJson("")).toBeNull();
	});

	test("parses a minimal coverage object", () => {
		const raw = JSON.stringify({ total: { lines: { pct: 85 } } });
		const result = parseCoverageJson(raw);
		expect(result).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildCoverageReport
// ---------------------------------------------------------------------------

describe("buildCoverageReport", () => {
	const makeEntry = (pct: number) => ({
		lines: { total: 100, covered: pct, skipped: 0, pct },
		statements: { total: 100, covered: pct, skipped: 0, pct },
		functions: { total: 100, covered: pct, skipped: 0, pct },
		branches: { total: 100, covered: pct, skipped: 0, pct },
	});

	test("extracts overall pct from 'total' key", () => {
		const raw = { total: makeEntry(85) };
		const report = buildCoverageReport(raw);
		expect(report.overallPct).toBe(85);
	});

	test("extracts core pct from packages/core entries", () => {
		const raw = {
			total: makeEntry(85),
			"packages/core/src/vector.ts": makeEntry(95),
			"packages/core/src/decision.ts": makeEntry(92),
		};
		const report = buildCoverageReport(raw);
		// average of 95 and 92 = 93.5
		expect(report.corePct).toBeCloseTo(93.5, 1);
	});

	test("corePct is 100 when no core files found", () => {
		const raw = { total: makeEntry(85) };
		const report = buildCoverageReport(raw);
		// No core files → no core constraint → treat as passing (100)
		expect(report.corePct).toBe(100);
	});

	test("lists failing packages in coreFiles", () => {
		const raw = {
			total: makeEntry(85),
			"packages/core/src/low.ts": makeEntry(70),
		};
		const report = buildCoverageReport(raw);
		expect(report.coreFiles.length).toBeGreaterThan(0);
		expect(report.coreFiles[0].pct).toBe(70);
	});
});

// ---------------------------------------------------------------------------
// checkThresholds — pass scenarios
// ---------------------------------------------------------------------------

describe("checkThresholds — passing", () => {
	test("passes when both core and overall are above thresholds", () => {
		const result = checkThresholds({ overallPct: 85, corePct: 95, coreFiles: [] });
		expect(result.passed).toBe(true);
		expect(result.failures).toHaveLength(0);
	});

	test("passes when core is exactly at threshold (90)", () => {
		const result = checkThresholds({ overallPct: 85, corePct: 90, coreFiles: [] });
		expect(result.passed).toBe(true);
	});

	test("passes when overall is exactly at threshold (80)", () => {
		const result = checkThresholds({ overallPct: 80, corePct: 95, coreFiles: [] });
		expect(result.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// checkThresholds — failure scenarios
// ---------------------------------------------------------------------------

describe("checkThresholds — failing", () => {
	test("fails when core coverage is below 90%", () => {
		const result = checkThresholds({
			overallPct: 85,
			corePct: 89,
			coreFiles: [{ path: "packages/core/src/x.ts", pct: 89 }],
		});
		expect(result.passed).toBe(false);
		expect(result.failures.some((f) => f.includes("core"))).toBe(true);
	});

	test("fails when overall coverage is below 80%", () => {
		const result = checkThresholds({ overallPct: 79, corePct: 95, coreFiles: [] });
		expect(result.passed).toBe(false);
		expect(result.failures.some((f) => f.includes("overall") || f.includes("79"))).toBe(true);
	});

	test("fails when both core and overall are below thresholds", () => {
		const result = checkThresholds({
			overallPct: 70,
			corePct: 80,
			coreFiles: [{ path: "packages/core/src/x.ts", pct: 80 }],
		});
		expect(result.passed).toBe(false);
		expect(result.failures.length).toBeGreaterThanOrEqual(2);
	});

	test("includes file paths in failure message when core files are provided", () => {
		const result = checkThresholds({
			overallPct: 85,
			corePct: 75,
			coreFiles: [{ path: "packages/core/src/risky.ts", pct: 75 }],
		});
		expect(result.passed).toBe(false);
		const combined = result.failures.join(" ");
		expect(combined).toContain("risky.ts");
	});
});
