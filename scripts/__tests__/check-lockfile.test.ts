import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for scripts/check-lockfile.ts
 *
 * Strategy: run the script as a subprocess with a controlled temporary
 * directory so we can simulate absent/stale/current lockfiles without
 * touching the real repo root.
 *
 * The script reads LOCKFILE_CHECK_ROOT env var as the working directory
 * when set, falling back to process.cwd() in production use.
 *
 * Uses bun.lock (Bun >=1.2 text format). The script also supports bun.lockb.
 */

const SCRIPT = join(import.meta.dir, "../check-lockfile.ts");
const TMP_BASE = join(import.meta.dir, "../../.tmp-lockfile-test");

function tmpDir(suffix: string): string {
	return join(TMP_BASE, suffix);
}

function setup(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

function teardown(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

function runScript(cwd: string): { exitCode: number; stderr: string; stdout: string } {
	const proc = Bun.spawnSync(["bun", "run", SCRIPT], {
		cwd,
		env: { ...process.env, LOCKFILE_CHECK_ROOT: cwd },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: proc.exitCode ?? 1,
		stdout: new TextDecoder().decode(proc.stdout),
		stderr: new TextDecoder().decode(proc.stderr),
	};
}

describe("check-lockfile.ts", () => {
	beforeEach(() => {
		mkdirSync(TMP_BASE, { recursive: true });
	});

	afterEach(() => {
		teardown(TMP_BASE);
	});

	test("exits 1 when bun.lock is absent", () => {
		const dir = tmpDir("absent");
		setup(dir);
		// Write package.json but no lockfile
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));

		const result = runScript(dir);

		expect(result.exitCode).toBe(1);
		expect(result.stderr + result.stdout).toContain("bun.lock");
	});

	test("exits 0 when bun.lock exists and is up-to-date", () => {
		const dir = tmpDir("current");
		setup(dir);
		// Write package.json
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
		// Write lockfile that is newer than package.json
		writeFileSync(join(dir, "bun.lock"), "lockfile-content");

		const result = runScript(dir);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("OK");
	});

	test("exits 1 with descriptive message when lockfile is missing", () => {
		const dir = tmpDir("message");
		setup(dir);
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));

		const result = runScript(dir);

		expect(result.exitCode).toBe(1);
		const output = result.stderr + result.stdout;
		// Must contain actionable guidance
		expect(output).toMatch(/bun install/i);
	});

	test("script is read-only — does not modify any files", () => {
		const dir = tmpDir("readonly");
		setup(dir);
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
		writeFileSync(join(dir, "bun.lock"), "lockfile-content");

		const lockfileContentBefore = Bun.file(join(dir, "bun.lock")).size;

		runScript(dir);

		// Lockfile must not be modified
		const lockfileContentAfter = Bun.file(join(dir, "bun.lock")).size;
		expect(lockfileContentAfter).toBe(lockfileContentBefore);
	});

	test("exits 1 when package.json is newer than bun.lock (stale lockfile)", async () => {
		const dir = tmpDir("stale");
		setup(dir);

		// Write lockfile first
		writeFileSync(join(dir, "bun.lock"), "old-lockfile");

		// Small delay to ensure different mtime
		await Bun.sleep(10);

		// Write package.json after — it will have a newer mtime
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "test", version: "1.0.0", dependencies: { express: "^4.0.0" } }),
		);

		const result = runScript(dir);

		// package.json is newer than bun.lock → lockfile is stale → must exit 1
		expect(result.exitCode).toBe(1);
		expect(result.stderr + result.stdout).toContain("bun.lock");
	});

	test("accepts bun.lockb (binary format) as valid lockfile", () => {
		const dir = tmpDir("binary");
		setup(dir);
		// Write package.json first, then lockb after
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
		writeFileSync(join(dir, "bun.lockb"), Buffer.from([0x89, 0x62, 0x75, 0x6e]));

		const result = runScript(dir);

		expect(result.exitCode).toBe(0);
	});
});
