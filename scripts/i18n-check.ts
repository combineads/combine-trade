/**
 * i18n-check.ts
 *
 * Compares ko.json and en.json message files, reporting any keys that
 * exist in one locale but not the other.
 *
 * Usage:
 *   bun run scripts/i18n-check.ts
 *
 * Exit codes:
 *   0 — all keys match between ko and en (or warnings printed, no hard failure)
 *   0 — missing keys found (warning only, not a build blocker per spec)
 *
 * The script prints a report to stdout in all cases. Missing keys are warnings,
 * not build errors, so the exit code stays 0 even when mismatches exist.
 * This matches the task spec: "누락 시 exit code 0 (warning, 빌드 블록 아님)".
 */

import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all dot-path leaf keys from a nested object. */
export function collectKeys(
	obj: Record<string, unknown>,
	prefix = "",
): string[] {
	const keys: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === "object" && !Array.isArray(v)) {
			keys.push(...collectKeys(v as Record<string, unknown>, path));
		} else {
			keys.push(path);
		}
	}
	return keys.sort();
}

/** Return keys present in `a` but absent in `b`. */
export function missingInB(keysA: string[], keysB: string[]): string[] {
	const setB = new Set(keysB);
	return keysA.filter((k) => !setB.has(k));
}

// ---------------------------------------------------------------------------
// Core comparison logic (exported for unit tests)
// ---------------------------------------------------------------------------

export interface CompareResult {
	koKeys: string[];
	enKeys: string[];
	/** Keys in ko.json but not en.json */
	missingInEn: string[];
	/** Keys in en.json but not ko.json */
	missingInKo: string[];
	/** True when both files have identical key sets */
	isConsistent: boolean;
}

export function compareMessages(
	ko: Record<string, unknown>,
	en: Record<string, unknown>,
): CompareResult {
	const koKeys = collectKeys(ko);
	const enKeys = collectKeys(en);
	const missingInEn = missingInB(koKeys, enKeys);
	const missingInKo = missingInB(enKeys, koKeys);
	return {
		koKeys,
		enKeys,
		missingInEn,
		missingInKo,
		isConsistent: missingInEn.length === 0 && missingInKo.length === 0,
	};
}

// ---------------------------------------------------------------------------
// Entry point (runs only when executed directly)
// ---------------------------------------------------------------------------

if (import.meta.main) {
	const repoRoot = join(import.meta.dir, "..");
	const messagesDir = join(
		repoRoot,
		"packages",
		"ui",
		"src",
		"i18n",
		"messages",
	);

	const koPath = join(messagesDir, "ko.json");
	const enPath = join(messagesDir, "en.json");

	const koFile = Bun.file(koPath);
	const enFile = Bun.file(enPath);

	const ko = (await koFile.json()) as Record<string, unknown>;
	const en = (await enFile.json()) as Record<string, unknown>;

	const result = compareMessages(ko, en);

	console.log("=== i18n key consistency check ===");
	console.log(`ko.json: ${result.koKeys.length} keys`);
	console.log(`en.json: ${result.enKeys.length} keys`);
	console.log("");

	if (result.isConsistent) {
		console.log("✓ All keys match between ko.json and en.json");
	} else {
		if (result.missingInEn.length > 0) {
			console.log(
				`WARNING: ${result.missingInEn.length} key(s) in ko.json but missing from en.json:`,
			);
			for (const key of result.missingInEn) {
				console.log(`  - ${key}`);
			}
			console.log("");
		}
		if (result.missingInKo.length > 0) {
			console.log(
				`WARNING: ${result.missingInKo.length} key(s) in en.json but missing from ko.json:`,
			);
			for (const key of result.missingInKo) {
				console.log(`  - ${key}`);
			}
			console.log("");
		}
		console.log(
			"NOTE: Missing keys show fallback values in the UI. Fix them to ensure full translation coverage.",
		);
	}

	// Exit 0 per spec: missing keys are warnings, not build blockers.
	process.exit(0);
}
