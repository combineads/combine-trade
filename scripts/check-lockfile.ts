/**
 * check-lockfile.ts
 *
 * Verifies that bun.lock (or bun.lockb for older Bun versions) exists and is
 * not stale relative to package.json. Staleness is determined by file
 * modification time: if package.json is newer than the lockfile, the lockfile
 * is considered out of sync.
 *
 * Supports both bun.lock (Bun >=1.2, text format) and bun.lockb (binary).
 * Checks bun.lock first.
 *
 * This script is read-only — it never modifies any files.
 *
 * Usage:
 *   bun run scripts/check-lockfile.ts
 *
 * Environment:
 *   LOCKFILE_CHECK_ROOT — override the repo root directory (used in tests)
 *
 * Exit codes:
 *   0 — lockfile exists and is up-to-date
 *   1 — lockfile is missing or stale
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.env.LOCKFILE_CHECK_ROOT ?? process.cwd();
const packageJsonPath = join(root, "package.json");

// Support both bun.lock (Bun >=1.2) and bun.lockb (older binary format)
const candidates = [join(root, "bun.lock"), join(root, "bun.lockb")];
const lockfilePath = candidates.find((p) => existsSync(p)) ?? null;

function fail(message: string): never {
	process.stderr.write(`[check-lockfile] ERROR: ${message}\n`);
	process.stderr.write('[check-lockfile] Run "bun install" and commit the updated lockfile\n');
	process.exit(1);
}

// Check that a lockfile exists
if (lockfilePath === null) {
	fail('bun.lock is missing — run "bun install" and commit the lockfile');
}

// Check package.json exists (if it doesn't, we can't compare)
if (!existsSync(packageJsonPath)) {
	// No package.json means nothing to compare against — treat as OK
	process.stdout.write("[check-lockfile] OK: no package.json found, skipping staleness check\n");
	process.exit(0);
}

const lockfileStat = statSync(lockfilePath);
const packageJsonStat = statSync(packageJsonPath);

// If package.json was modified after the lockfile, the lockfile is stale
if (packageJsonStat.mtimeMs > lockfileStat.mtimeMs) {
	fail(
		`${lockfilePath} is out of sync with package.json — run "bun install" and commit the updated lockfile`,
	);
}

process.stdout.write(`[check-lockfile] OK: ${lockfilePath} is up-to-date\n`);
process.exit(0);
