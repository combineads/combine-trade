/**
 * bench.ts
 *
 * Benchmark runner for Combine Trade performance gates.
 *
 * Writes results to .harness/benchmarks/current.json in the format expected
 * by check-perf-regression.ts:
 *
 *   {
 *     "generated_at": "<ISO timestamp>",
 *     "commit": "<sha>",
 *     "benchmarks": {
 *       "<benchmark-name>": <duration-in-ms>
 *     }
 *   }
 *
 * Usage:
 *   bun run scripts/bench.ts
 *   bun run bench -- --reporter=json > .harness/benchmarks/current.json
 *
 * Extend this file with real benchmark cases as the pipeline is built out.
 * See docs/QUALITY.md § Performance tests for target thresholds.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT_DIR = join(ROOT, ".harness", "benchmarks");
const OUT_PATH = join(OUT_DIR, "current.json");

interface BenchmarkResult {
	generated_at: string;
	commit: string;
	benchmarks: Record<string, number>;
}

/** Run a single benchmark function and return elapsed milliseconds. */
async function measureMs(fn: () => Promise<void> | void): Promise<number> {
	const start = performance.now();
	await fn();
	return performance.now() - start;
}

async function main(): Promise<void> {
	const benchmarks: Record<string, number> = {};

	// ---------------------------------------------------------------------------
	// Placeholder benchmarks — replace with real measurements as services are built
	// ---------------------------------------------------------------------------

	// Example: no-op warmup benchmark to verify the runner works
	benchmarks["runner-overhead"] = await measureMs(() => {
		// intentionally empty — measures pure runner overhead
	});

	// ---------------------------------------------------------------------------
	// Write results
	// ---------------------------------------------------------------------------

	// Resolve commit SHA (best-effort — empty string if git unavailable)
	let commit = "";
	try {
		const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" });
		const text = await new Response(proc.stdout).text();
		commit = text.trim();
	} catch {
		/* ignore */
	}

	const result: BenchmarkResult = {
		generated_at: new Date().toISOString(),
		commit,
		benchmarks,
	};

	const json = JSON.stringify(result, null, 2);

	// Write to file when not redirected (normal script invocation)
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_PATH, json, "utf-8");
}

await main();
