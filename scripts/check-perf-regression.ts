/**
 * check-perf-regression.ts
 *
 * Compares current benchmark results against the stored baseline and fails
 * if any metric has degraded by more than 20%.
 *
 * Usage:
 *   bun run scripts/check-perf-regression.ts
 *
 * Reads:
 *   .harness/benchmarks/baseline.json — committed baseline values
 *   .harness/benchmarks/current.json  — written by `bun run bench` in CI
 *
 * Exit codes:
 *   0 — all benchmarks within threshold (or baseline absent on first run)
 *   1 — one or more benchmarks exceed the regression threshold
 *
 * Benchmark JSON format:
 * {
 *   "generated_at": "<ISO timestamp>",
 *   "commit": "<sha>",
 *   "benchmarks": {
 *     "<benchmark-name>": <duration-in-ms>   // lower is better
 *   }
 * }
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Named threshold constant (constraint: no magic numbers)
// ---------------------------------------------------------------------------

/** Multiplier above which a benchmark is considered a regression. */
export const REGRESSION_THRESHOLD = 1.2; // current / baseline > 1.20 → fail

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkFile {
	generated_at: string;
	commit: string;
	benchmarks: Record<string, number>;
}

export interface RegressionEntry {
	name: string;
	baseline: number;
	current: number;
	ratio: number;
}

export interface RegressionResult {
	passed: boolean;
	regressions: RegressionEntry[];
}

// ---------------------------------------------------------------------------
// parseBenchmarkJson
// ---------------------------------------------------------------------------

/**
 * Parse raw JSON text into a BenchmarkFile.
 * Returns null if the content is invalid or missing required fields.
 */
export function parseBenchmarkJson(raw: string): BenchmarkFile | null {
	if (!raw || raw.trim() === "") return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return null;
		}
		if (!("benchmarks" in parsed) || typeof parsed.benchmarks !== "object") {
			return null;
		}
		return parsed as BenchmarkFile;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// checkRegressions
// ---------------------------------------------------------------------------

/**
 * Compare current benchmark values against baseline values.
 *
 * Only benchmarks present in the baseline are evaluated — new benchmarks
 * in current that have no baseline entry are ignored (no false positives on
 * first measurement of a new benchmark).
 *
 * Ratio = current / baseline. Ratio > REGRESSION_THRESHOLD → fail.
 * Ratio <= REGRESSION_THRESHOLD → pass (includes exactly at threshold).
 */
export function checkRegressions(
	baseline: Record<string, number>,
	current: Record<string, number>,
): RegressionResult {
	const regressions: RegressionEntry[] = [];

	for (const [name, baselineValue] of Object.entries(baseline)) {
		const currentValue = current[name];
		if (currentValue === undefined) {
			// Benchmark was removed — skip (no failure for missing entries)
			continue;
		}

		const ratio = currentValue / baselineValue;
		if (ratio > REGRESSION_THRESHOLD) {
			regressions.push({ name, baseline: baselineValue, current: currentValue, ratio });
		}
	}

	return { passed: regressions.length === 0, regressions };
}

// ---------------------------------------------------------------------------
// buildComparisonTable
// ---------------------------------------------------------------------------

/**
 * Build a human-readable comparison table string for the console output.
 */
export function buildComparisonTable(
	baseline: Record<string, number>,
	current: Record<string, number>,
	regressions: RegressionEntry[],
): string {
	const regressionNames = new Set(regressions.map((r) => r.name));
	const allNames = new Set([...Object.keys(baseline), ...Object.keys(current)]);

	const header = `${"Benchmark".padEnd(40)} ${"Baseline".padStart(10)} ${"Current".padStart(10)} ${"Ratio".padStart(8)}  Status`;
	const separator = "-".repeat(header.length);
	const rows: string[] = [header, separator];

	for (const name of allNames) {
		const b = baseline[name];
		const c = current[name];

		if (b === undefined) {
			// New benchmark — show as NEW
			rows.push(`${name.padEnd(40)} ${"—".padStart(10)} ${String(c).padStart(10)} ${"—".padStart(8)}  NEW`);
			continue;
		}
		if (c === undefined) {
			rows.push(`${name.padEnd(40)} ${String(b).padStart(10)} ${"—".padStart(10)} ${"—".padStart(8)}  MISSING`);
			continue;
		}

		const ratio = c / b;
		const status = regressionNames.has(name) ? "FAIL" : "PASS";
		rows.push(
			`${name.padEnd(40)} ${String(b).padStart(10)} ${String(c).padStart(10)} ${ratio.toFixed(3).padStart(8)}  ${status}`,
		);
	}

	return rows.join("\n");
}

// ---------------------------------------------------------------------------
// main — CLI entry point
// ---------------------------------------------------------------------------

const HARNESS_DIR = join(process.cwd(), ".harness", "benchmarks");
const BASELINE_PATH = join(HARNESS_DIR, "baseline.json");
const CURRENT_PATH = join(HARNESS_DIR, "current.json");

function main(): void {
	// No baseline → first run → warn and exit 0
	if (!existsSync(BASELINE_PATH)) {
		console.warn(`[check-perf-regression] WARNING: baseline not found at ${BASELINE_PATH}`);
		console.warn("[check-perf-regression] Skipping performance regression gate (no baseline).");
		process.exit(0);
	}

	// No current results → likely bench wasn't run → fail with clear message
	if (!existsSync(CURRENT_PATH)) {
		console.error(`[check-perf-regression] ERROR: current benchmark results not found at ${CURRENT_PATH}`);
		console.error("[check-perf-regression] Run `bun run bench` first to generate current.json");
		process.exit(1);
	}

	const baselineRaw = readFileSync(BASELINE_PATH, "utf-8");
	const currentRaw = readFileSync(CURRENT_PATH, "utf-8");

	const baselineFile = parseBenchmarkJson(baselineRaw);
	if (!baselineFile) {
		console.error(`[check-perf-regression] ERROR: could not parse baseline JSON at ${BASELINE_PATH}`);
		process.exit(1);
	}

	const currentFile = parseBenchmarkJson(currentRaw);
	if (!currentFile) {
		console.error(`[check-perf-regression] ERROR: could not parse current JSON at ${CURRENT_PATH}`);
		process.exit(1);
	}

	const result = checkRegressions(baselineFile.benchmarks, currentFile.benchmarks);
	const table = buildComparisonTable(baselineFile.benchmarks, currentFile.benchmarks, result.regressions);

	console.log("[check-perf-regression] Benchmark comparison:");
	console.log(table);

	if (result.passed) {
		console.log("\n[check-perf-regression] All benchmarks within threshold.");
		process.exit(0);
	} else {
		console.error(`\n[check-perf-regression] REGRESSION DETECTED: ${result.regressions.length} benchmark(s) degraded >20%:`);
		for (const reg of result.regressions) {
			console.error(
				`  ${reg.name}: ${reg.baseline}ms → ${reg.current}ms (${((reg.ratio - 1) * 100).toFixed(1)}% slower)`,
			);
		}
		process.exit(1);
	}
}

// Run only when executed directly (not when imported by tests)
if (import.meta.main) {
	main();
}
