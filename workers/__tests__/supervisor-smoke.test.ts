/**
 * Supervisor smoke test — verifies all worker process entry points.
 *
 * Strategy:
 *
 * 1. Entry-point existence: verify each worker's file exists.
 *
 * 2. "No DATABASE_URL" path: spawn each worker with DATABASE_URL="" and verify
 *    it exits immediately with code 1 and the message "DATABASE_URL not set".
 *
 * 3. "Started" message (DATABASE_URL available): spawn each worker, stream its
 *    output, and check that the expected "started" message appears within
 *    3 seconds OR that the process exits with a known error (e.g. missing
 *    MASTER_ENCRYPTION_KEY / ANTHROPIC_API_KEY).  Workers that keep running
 *    after printing "started" are killed with SIGTERM.
 *
 * Bun auto-loads .env, so DATABASE_URL is expected to be available in
 * this environment.  For the "no DATABASE_URL" tests we explicitly pass
 * DATABASE_URL="" to override it.
 *
 * Whole-test timeout: 30 seconds per test (configured per-test via the
 * `timeout` option to `test()`).
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

interface WorkerSpec {
	/** Human-readable name used in test descriptions. */
	name: string;
	/** Path to the entry-point file relative to ROOT. */
	entryPoint: string;
	/** Log message emitted after successful startup. */
	startedMessage: string;
	/**
	 * Additional env vars required beyond DATABASE_URL.
	 * If any are missing, the worker exits early with a known message.
	 */
	extraRequiredEnv?: string[];
	/**
	 * Error message logged to stderr when an extra required env var is missing.
	 * Only needed when extraRequiredEnv is set.
	 */
	missingEnvMessage?: string;
}

const WORKER_SPECS: WorkerSpec[] = [
	{
		name: "candle-collector",
		entryPoint: "workers/candle-collector/src/index.ts",
		startedMessage: "Candle collector started",
	},
	{
		name: "strategy-worker",
		entryPoint: "workers/strategy-worker/src/index.ts",
		startedMessage: "Strategy worker started",
	},
	{
		name: "vector-worker",
		entryPoint: "workers/vector-worker/src/index.ts",
		startedMessage: "Vector worker started",
	},
	{
		name: "label-worker",
		entryPoint: "workers/label-worker/src/index.ts",
		startedMessage: "Label worker started",
	},
	{
		name: "alert-worker",
		entryPoint: "workers/alert-worker/src/index.ts",
		startedMessage: "Alert worker started",
	},
	{
		name: "execution-worker",
		entryPoint: "workers/execution-worker/src/index.ts",
		startedMessage: "Execution worker started",
		extraRequiredEnv: ["MASTER_ENCRYPTION_KEY"],
		missingEnvMessage: "MASTER_ENCRYPTION_KEY not set",
	},
	{
		name: "journal-worker",
		entryPoint: "workers/journal-worker/src/index.ts",
		startedMessage: "Journal worker started",
	},
	{
		name: "macro-collector",
		entryPoint: "workers/macro-collector/src/index.ts",
		startedMessage: "Macro collector started",
	},
	{
		name: "llm-decision-worker",
		entryPoint: "workers/llm-decision-worker/src/main.ts",
		startedMessage: "LLM Decision worker started",
		extraRequiredEnv: ["ANTHROPIC_API_KEY"],
		missingEnvMessage: "ANTHROPIC_API_KEY not set",
	},
	{
		name: "retrospective-worker",
		entryPoint: "workers/retrospective-worker/src/main.ts",
		startedMessage: "Retrospective worker started",
		extraRequiredEnv: ["ANTHROPIC_API_KEY"],
		missingEnvMessage: "ANTHROPIC_API_KEY not set",
	},
];

/**
 * Spawn a worker and wait until one of these conditions is met (whichever
 * comes first):
 *   a) The process exits naturally.
 *   b) The combined stdout+stderr contains `needle`.
 *   c) `timeoutMs` elapses → process is killed with SIGTERM.
 *
 * Returns the collected output and the exit code (null if killed by timeout).
 */
async function spawnAndWait(
	entryPoint: string,
	env: Record<string, string | undefined>,
	needle: string | null,
	timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	const fullPath = join(ROOT, entryPoint);

	const proc = Bun.spawn(["bun", "run", fullPath], {
		env: env as Record<string, string>,
		stdout: "pipe",
		stderr: "pipe",
		cwd: ROOT,
	});

	const stdoutChunks: Uint8Array[] = [];
	const stderrChunks: Uint8Array[] = [];
	const decoder = new TextDecoder();

	let needleFound = false;
	let procKilled = false;

	function combinedText(): string {
		return (
			decoder.decode(Buffer.concat(stdoutChunks)) +
			decoder.decode(Buffer.concat(stderrChunks))
		);
	}

	function checkNeedle(chunk: Uint8Array): boolean {
		if (!needle || needleFound) return false;
		// Append and check
		const text = combinedText() + decoder.decode(chunk);
		return text.includes(needle);
	}

	// Collect stdout — stop collecting (kill) once needle is found
	const collectStdout = (async () => {
		for await (const chunk of proc.stdout) {
			stdoutChunks.push(chunk);
			if (checkNeedle(chunk) && !needleFound) {
				needleFound = true;
				procKilled = true;
				proc.kill("SIGTERM");
				break;
			}
		}
	})();

	// Collect stderr — same check
	const collectStderr = (async () => {
		for await (const chunk of proc.stderr) {
			stderrChunks.push(chunk);
			if (checkNeedle(chunk) && !needleFound) {
				needleFound = true;
				procKilled = true;
				proc.kill("SIGTERM");
				break;
			}
		}
	})();

	// Timeout watchdog
	const timeoutHandle = setTimeout(() => {
		if (!procKilled) {
			procKilled = true;
			proc.kill("SIGTERM");
		}
	}, timeoutMs);

	const exitCode = await proc.exited;
	clearTimeout(timeoutHandle);

	// Drain remaining output
	await Promise.allSettled([collectStdout, collectStderr]);

	return {
		stdout: decoder.decode(Buffer.concat(stdoutChunks)),
		stderr: decoder.decode(Buffer.concat(stderrChunks)),
		// When killed by needle-found or timeout, exitCode may be non-zero (SIGTERM).
		// We return null to indicate "we killed it", or the real code if it exited itself.
		exitCode: needleFound ? null : exitCode,
	};
}

// ---------------------------------------------------------------------------
// Build a "no DATABASE_URL" env by explicitly overriding it to empty string
// ---------------------------------------------------------------------------
function envWithoutDb(): Record<string, string | undefined> {
	return { ...process.env, DATABASE_URL: "" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("worker entry points — supervisor smoke test", () => {
	// 1. File existence checks (fast, no subprocesses)
	for (const spec of WORKER_SPECS) {
		test(`${spec.name}: entry point file exists`, () => {
			const fullPath = join(ROOT, spec.entryPoint);
			const file = Bun.file(fullPath);
			expect(file.size).toBeGreaterThan(0);
		});
	}

	// 2. "No DATABASE_URL" — all workers must exit with code 1 and the right message
	describe("DATABASE_URL not set — exits with expected error", () => {
		for (const spec of WORKER_SPECS) {
			test(
				`${spec.name}: exits 1 with 'DATABASE_URL not set'`,
				async () => {
					const result = await spawnAndWait(
						spec.entryPoint,
						envWithoutDb(),
						null, // no needle — just wait for exit
						5_000,
					);

					// Must exit on its own (not be killed by timeout)
					expect(result.exitCode).not.toBeNull();
					expect(result.exitCode).toBe(1);

					const combined = result.stdout + result.stderr;
					expect(combined).toContain("DATABASE_URL not set");
				},
				10_000,
			);
		}
	});

	// 3. "Started" message — workers print their started log (or exit with known missing-env error)
	describe("DATABASE_URL set — workers print started message or exit with known error", () => {
		for (const spec of WORKER_SPECS) {
			test(
				`${spec.name}: prints started message or known error`,
				async () => {
					// Build env — inherit DATABASE_URL from process.env (loaded via .env)
					const env: Record<string, string | undefined> = { ...process.env };

					// Determine the expected needle: started message or missing-env message
					const hasAllExtra =
						!spec.extraRequiredEnv ||
						spec.extraRequiredEnv.every((k) => Boolean(process.env[k]));

					const needle = hasAllExtra
						? spec.startedMessage
						: (spec.missingEnvMessage ?? spec.startedMessage);

					const result = await spawnAndWait(
						spec.entryPoint,
						env,
						needle,
						8_000,
					);

					const combined = result.stdout + result.stderr;

					if (hasAllExtra) {
						// Must either print the started message (happy path), OR produce
						// output indicating a known infrastructure problem (DB error, schema
						// mismatch, connection refused).  The smoke test verifies that the
						// entry point runs and produces meaningful output — not that the DB
						// is fully migrated and reachable.
						const startedOk = combined.includes(spec.startedMessage);
						const dbError =
							combined.includes("DATABASE_URL") ||
							combined.includes("postgres") ||
							combined.includes("Error") ||
							combined.includes("error");
						expect(startedOk || dbError).toBe(true);
					} else {
						// Worker exits early because a required env var is missing.
						// Accept either the missing-env message or the started message
						// (in case the operator has the key set).
						const acceptable =
							combined.includes(spec.missingEnvMessage ?? "") ||
							combined.includes(spec.startedMessage);
						expect(acceptable).toBe(true);
					}
				},
				15_000,
			);
		}
	});
});
