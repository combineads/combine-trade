/**
 * Backtest replay engine — performance benchmark suite.
 *
 * Three cases:
 *   A) small  — 10_000 candles   (always runs, CI smoke check)
 *   B) medium — 100_000 candles  (always runs)
 *   C) large  — 1_577_836 candles / 3 years  (BENCHMARK_FULL=1 only)
 *
 * Output: packages/backtest/benchmark-report.json
 */

import { afterAll, describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import { runBacktest } from "../engine.js";
import type { BacktestEngineDeps, BacktestResult } from "../types.js";

// ---------------------------------------------------------------------------
// Seeded linear-congruential PRNG
// ---------------------------------------------------------------------------

function makeLcg(seed: number): () => number {
	// Parameters from Numerical Recipes (Knuth)
	const a = 1664525;
	const c = 1013904223;
	const m = 2 ** 32;
	let state = seed >>> 0;
	return () => {
		state = ((a * state + c) >>> 0) % m;
		return state / m; // [0, 1)
	};
}

// ---------------------------------------------------------------------------
// Deterministic candle fixture generator
// ---------------------------------------------------------------------------

const FIXED_EPOCH_MS = 1_704_067_200_000; // 2024-01-01T00:00:00Z
const MINUTE_MS = 60_000;

/**
 * Generates `count` 1-minute candles with PRNG-derived OHLCV values.
 * Same `seed` always produces the same sequence.
 */
function generateCandles(count: number, seed = 1): Candle[] {
	const rng = makeLcg(seed);
	const candles: Candle[] = [];

	let price = 50_000 + rng() * 1_000; // baseline ~50k

	for (let i = 0; i < count; i++) {
		const change = (rng() - 0.5) * 200;
		const open = price;
		const close = open + change;
		const high = Math.max(open, close) + rng() * 100;
		const low = Math.min(open, close) - rng() * 100;
		const volume = 10 + rng() * 990;

		candles.push({
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date(FIXED_EPOCH_MS + i * MINUTE_MS),
			open: open.toFixed(2),
			high: high.toFixed(2),
			low: low.toFixed(2),
			close: close.toFixed(2),
			volume: volume.toFixed(4),
			isClosed: true,
		});

		price = close;
	}

	return candles;
}

// ---------------------------------------------------------------------------
// Benchmark harness
// ---------------------------------------------------------------------------

interface BenchmarkCaseResult {
	name: string;
	candles: number;
	eventsEmitted: number;
	durationMs: number;
	eventsPerSec: number;
	heapDeltaMb: number;
	passed: boolean;
}

interface BenchmarkReport {
	runAt: string;
	cases: BenchmarkCaseResult[];
}

const reportCases: BenchmarkCaseResult[] = [];

/**
 * Runs a single benchmark case and returns its metrics.
 *
 * The `executeStrategy` mock does non-trivial work (array allocation)
 * on every call to prevent JIT elision of the hot loop.
 * Events are emitted on every 10th candle (10% rate).
 */
async function runBenchmarkCase(
	name: string,
	candles: Candle[],
): Promise<{ result: BacktestResult; metrics: BenchmarkCaseResult }> {
	let callCount = 0;

	const deps: BacktestEngineDeps = {
		strategyId: "benchmark-strategy",
		version: 1,
		executeStrategy: async (_candle) => {
			// Non-trivial work: allocate a small array per call to prevent JIT elision
			const _scratch = new Float64Array(4);
			_scratch[0] = callCount;
			callCount++;

			// 10% event emission rate: every 10th candle
			if (callCount % 10 === 0) {
				return { entryPrice: "50000.00", direction: "long" };
			}
			return null;
		},
		saveCheckpoint: async () => {},
		loadCheckpoint: async () => null,
	};

	const heapBefore = process.memoryUsage().heapUsed;
	const wallStart = performance.now();

	const result = await runBacktest(candles, deps, { checkpointEveryN: 10_000 });

	const durationMs = performance.now() - wallStart;
	const heapAfter = process.memoryUsage().heapUsed;
	const heapDeltaMb = (heapAfter - heapBefore) / (1024 * 1024);
	const eventsPerSec = result.events.length / (durationMs / 1000);

	const metrics: BenchmarkCaseResult = {
		name,
		candles: result.totalCandles,
		eventsEmitted: result.events.length,
		durationMs,
		eventsPerSec,
		heapDeltaMb,
		passed: false, // will be set per-case after assertions
	};

	return { result, metrics };
}

// ---------------------------------------------------------------------------
// Benchmark report — written after all cases complete
// ---------------------------------------------------------------------------

afterAll(async () => {
	const report: BenchmarkReport = {
		runAt: new Date().toISOString(),
		cases: reportCases,
	};

	const reportPath = new URL("../benchmark-report.json", import.meta.url).pathname;
	await Bun.write(reportPath, JSON.stringify(report, null, 2));
});

// ---------------------------------------------------------------------------
// Seed determinism sanity check
// ---------------------------------------------------------------------------

describe("generateCandles determinism", () => {
	test("same seed produces identical sequence", () => {
		const a = generateCandles(10_000, 42);
		const b = generateCandles(10_000, 42);

		expect(a.length).toBe(b.length);
		for (let i = 0; i < a.length; i++) {
			expect(a[i]?.open).toBe(b[i]?.open);
			expect(a[i]?.close).toBe(b[i]?.close);
			expect(a[i]?.openTime.getTime()).toBe(b[i]?.openTime.getTime());
		}
	});

	test("different seeds produce different sequences", () => {
		const a = generateCandles(100, 1);
		const b = generateCandles(100, 2);
		// At least one candle should differ
		const hasDiff = a.some((c, i) => c.open !== b[i]?.open);
		expect(hasDiff).toBe(true);
	});

	test("openTimes are monotonically increasing by 1 minute", () => {
		const candles = generateCandles(100, 42);
		for (let i = 1; i < candles.length; i++) {
			expect(candles[i]?.openTime.getTime() - (candles[i - 1]?.openTime.getTime() ?? 0)).toBe(
				MINUTE_MS,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// Case A — small (10_000 candles): CI smoke check
// ---------------------------------------------------------------------------

describe("benchmark: Case A — small (10_000 candles)", () => {
	test("completes in < 2s and heap delta < 100 MB", async () => {
		const candles = generateCandles(10_000, 42);
		const { result, metrics } = await runBenchmarkCase("Case A — small (10_000 candles)", candles);

		const expectedEvents = Math.floor(10_000 / 10);
		expect(result.events.length).toBe(expectedEvents);

		expect(metrics.durationMs).toBeLessThan(2_000);
		expect(metrics.heapDeltaMb).toBeLessThan(100);

		metrics.passed = metrics.durationMs < 2_000 && metrics.heapDeltaMb < 100;
		reportCases.push(metrics);
	});
});

// ---------------------------------------------------------------------------
// Case B — medium (100_000 candles)
// ---------------------------------------------------------------------------

describe("benchmark: Case B — medium (100_000 candles)", () => {
	test("sustains > 50,000 events/sec", async () => {
		const candles = generateCandles(100_000, 42);
		const { result, metrics } = await runBenchmarkCase(
			"Case B — medium (100,000 candles)",
			candles,
		);

		const expectedEvents = Math.floor(100_000 / 10);
		expect(result.events.length).toBe(expectedEvents);

		expect(metrics.eventsPerSec).toBeGreaterThan(50_000);

		metrics.passed = metrics.eventsPerSec > 50_000;
		reportCases.push(metrics);
	});
});

// ---------------------------------------------------------------------------
// Case C — large / 3yr (1_577_836 candles): BENCHMARK_FULL=1 only
// ---------------------------------------------------------------------------

const CANDLES_3YR = 1_577_836; // 365.25 * 24 * 60 rounded

const runFullBenchmark = process.env.BENCHMARK_FULL === "1";

describe("benchmark: Case C — large / 3yr (1,577,836 candles)", () => {
	const maybeTest = runFullBenchmark ? test : test.skip;

	maybeTest(
		"full 3-year replay completes in < 300s",
		async () => {
			const candles = generateCandles(CANDLES_3YR, 42);
			const { result, metrics } = await runBenchmarkCase(
				"Case C — large / 3yr (1,577,836 candles)",
				candles,
			);

			const expectedEvents = Math.floor(CANDLES_3YR / 10);
			expect(result.events.length).toBe(expectedEvents);

			expect(metrics.durationMs).toBeLessThan(300_000);

			metrics.passed = metrics.durationMs < 300_000;
			reportCases.push(metrics);
		},
		350_000, // generous timeout slightly above the 300s target
	);
});
