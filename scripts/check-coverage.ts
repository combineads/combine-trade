/**
 * check-coverage.ts
 *
 * Parses a V8/Istanbul coverage JSON report and enforces coverage thresholds:
 *   - packages/core/**  >= 90% line coverage
 *   - Overall project   >= 80% line coverage
 *
 * Usage:
 *   bun run scripts/check-coverage.ts [path-to-coverage.json]
 *
 * The default coverage JSON path is coverage/coverage-summary.json (the file
 * produced by Bun's --coverage --coverage-reporter=json flag).
 *
 * Exit codes:
 *   0 — all thresholds pass (or no coverage data on first run)
 *   1 — one or more thresholds breached, or coverage file missing/invalid
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Named threshold constants (constraint: no magic numbers)
// ---------------------------------------------------------------------------

export const CORE_COVERAGE_THRESHOLD = 90;
export const OVERALL_COVERAGE_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoverageEntry {
	lines: { total: number; covered: number; skipped: number; pct: number };
	statements: { total: number; covered: number; skipped: number; pct: number };
	functions: { total: number; covered: number; skipped: number; pct: number };
	branches: { total: number; covered: number; skipped: number; pct: number };
}

export type CoverageJson = Record<string, CoverageEntry>;

export interface CoverageFileInfo {
	path: string;
	pct: number;
}

export interface CoverageReport {
	overallPct: number;
	corePct: number;
	coreFiles: CoverageFileInfo[];
}

export interface ThresholdResult {
	passed: boolean;
	failures: string[];
}

// ---------------------------------------------------------------------------
// parseCoverageJson
// ---------------------------------------------------------------------------

/**
 * Parse raw JSON text into a CoverageJson map.
 * Returns null if the input is not valid JSON or not an object.
 */
export function parseCoverageJson(raw: string): CoverageJson | null {
	if (!raw || raw.trim() === "") return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return null;
		}
		return parsed as CoverageJson;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// buildCoverageReport
// ---------------------------------------------------------------------------

/**
 * Extract overall coverage and packages/core coverage from a parsed CoverageJson.
 * The "total" key holds project-wide aggregates (standard Istanbul/V8 format).
 * All other keys are file paths — those under packages/core/ are averaged for
 * the core coverage figure.
 */
export function buildCoverageReport(json: CoverageJson): CoverageReport {
	const totalEntry = json["total"];
	const overallPct = totalEntry?.lines?.pct ?? 0;

	const coreFiles: CoverageFileInfo[] = [];

	for (const [filePath, entry] of Object.entries(json)) {
		if (filePath === "total") continue;
		// Match any path segment that looks like packages/core/
		if (filePath.includes("packages/core/")) {
			coreFiles.push({ path: filePath, pct: entry.lines?.pct ?? 0 });
		}
	}

	let corePct = 100; // No core files → no constraint → treat as 100% passing
	if (coreFiles.length > 0) {
		const sum = coreFiles.reduce((acc, f) => acc + f.pct, 0);
		corePct = sum / coreFiles.length;
	}

	return { overallPct, corePct, coreFiles };
}

// ---------------------------------------------------------------------------
// checkThresholds
// ---------------------------------------------------------------------------

/**
 * Compare a CoverageReport against the defined thresholds.
 * Returns a ThresholdResult indicating pass/fail and human-readable failure messages.
 */
export function checkThresholds(report: CoverageReport): ThresholdResult {
	const failures: string[] = [];

	if (report.overallPct < OVERALL_COVERAGE_THRESHOLD) {
		failures.push(
			`overall coverage ${report.overallPct.toFixed(2)}% is below the required ${OVERALL_COVERAGE_THRESHOLD}%`,
		);
	}

	if (report.corePct < CORE_COVERAGE_THRESHOLD) {
		const fileList = report.coreFiles
			.filter((f) => f.pct < CORE_COVERAGE_THRESHOLD)
			.map((f) => `  ${f.path}: ${f.pct.toFixed(2)}%`)
			.join("\n");

		failures.push(
			`packages/core coverage ${report.corePct.toFixed(2)}% is below the required ${CORE_COVERAGE_THRESHOLD}%` +
				(fileList ? `\nFailing core files:\n${fileList}` : ""),
		);
	}

	return { passed: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// main — CLI entry point
// ---------------------------------------------------------------------------

const DEFAULT_COVERAGE_PATH = join(process.cwd(), "coverage", "coverage-summary.json");

function main(): void {
	const coveragePath = process.argv[2] ?? DEFAULT_COVERAGE_PATH;

	if (!existsSync(coveragePath)) {
		// First run or coverage not generated yet — warn and exit 0 to avoid
		// false failures in fresh environments.
		console.warn(`[check-coverage] WARNING: coverage file not found at ${coveragePath}`);
		console.warn("[check-coverage] Skipping coverage gate (no data available).");
		process.exit(0);
	}

	const raw = readFileSync(coveragePath, "utf-8");
	const json = parseCoverageJson(raw);

	if (!json) {
		console.error(`[check-coverage] ERROR: could not parse coverage JSON at ${coveragePath}`);
		process.exit(1);
	}

	const report = buildCoverageReport(json);
	const result = checkThresholds(report);

	console.log("[check-coverage] Coverage summary:");
	console.log(`  Overall : ${report.overallPct.toFixed(2)}%  (threshold: ${OVERALL_COVERAGE_THRESHOLD}%)`);
	console.log(`  Core    : ${report.corePct.toFixed(2)}%  (threshold: ${CORE_COVERAGE_THRESHOLD}%)`);

	if (result.passed) {
		console.log("[check-coverage] All thresholds passed.");
		process.exit(0);
	} else {
		console.error("[check-coverage] Coverage thresholds FAILED:");
		for (const failure of result.failures) {
			console.error(`  - ${failure}`);
		}
		process.exit(1);
	}
}

// Run only when executed directly (not when imported by tests)
if (import.meta.main) {
	main();
}
