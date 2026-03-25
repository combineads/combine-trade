import { afterAll, describe, expect, test } from "bun:test";
import {
	createCorrelationContext,
	endStage,
	getPipelineLatencyMs,
	startStage,
} from "../correlation.js";
import { PipelineMetrics } from "../metrics.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandleClosedEvent {
	symbol: string;
	openTime: number;
	close: string;
	correlationId: string;
}

interface BenchmarkCaseResult {
	name: string;
	events: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
	heapDeltaMb: number;
	passed: boolean;
}

// ---------------------------------------------------------------------------
// Core helper: simulate one pipeline event through all stages
// ---------------------------------------------------------------------------

async function simulatePipelineEvent(
	stages: string[],
	stageDelayMs: Record<string, number>,
): Promise<number> {
	let ctx = createCorrelationContext();

	for (const stage of stages) {
		ctx = startStage(ctx, stage);
		const delay = stageDelayMs[stage] ?? 0;
		if (delay > 0) {
			await Bun.sleep(delay);
		}
		ctx = endStage(ctx, stage);
	}

	return getPipelineLatencyMs(ctx);
}

// ---------------------------------------------------------------------------
// Benchmark harness
// ---------------------------------------------------------------------------

const PIPELINE_STAGES = ["candle", "strategy", "vector", "decision", "alert"] as const;

const benchmarkResults: BenchmarkCaseResult[] = [];

async function runBenchmarkCase(
	name: string,
	eventCount: number,
	stages: string[],
	delays: Record<string, number>,
): Promise<BenchmarkCaseResult> {
	const metrics = new PipelineMetrics();

	// Measure heap before run
	Bun.gc(true);
	const heapBefore = process.memoryUsage().heapUsed;

	for (let i = 0; i < eventCount; i++) {
		// Each event gets a fresh correlation context (via simulatePipelineEvent)
		// and a realistic payload — the payload is created here to reflect real
		// per-event overhead even though stages don't process it.
		const _event: CandleClosedEvent = {
			symbol: "BTC/USDT",
			openTime: Date.now() - 60_000,
			close: "65432.10",
			correlationId: crypto.randomUUID(),
		};

		const latencyMs = await simulatePipelineEvent(stages, delays);
		metrics.recordLatency("e2e", latencyMs);
	}

	Bun.gc(true);
	const heapAfter = process.memoryUsage().heapUsed;
	const heapDeltaMb = Math.max(0, (heapAfter - heapBefore) / 1_048_576);

	const snap = metrics.getSnapshot("e2e");
	const result: BenchmarkCaseResult = {
		name,
		events: eventCount,
		p50Ms: snap.latency.p50,
		p95Ms: snap.latency.p95,
		p99Ms: snap.latency.p99,
		heapDeltaMb,
		passed: false, // will be set per-case
	};

	return result;
}

// ---------------------------------------------------------------------------
// afterAll: write JSON report
// ---------------------------------------------------------------------------

afterAll(async () => {
	const report = {
		runAt: new Date().toISOString(),
		cases: benchmarkResults,
	};

	const reportPath = new URL("../latency-benchmark-report.json", import.meta.url).pathname;
	await Bun.write(reportPath, JSON.stringify(report, null, 2));
});

// ---------------------------------------------------------------------------
// Case A — zero-delay (smoke check, always runs)
// Overhead only: all stage delays = 0 ms
// ---------------------------------------------------------------------------

describe("latency-benchmark", () => {
	test("Case A — zero-delay overhead: p50 < 10 ms, p99 < 50 ms, heap < 50 MB", async () => {
		const stages = [...PIPELINE_STAGES];
		const delays: Record<string, number> = {};

		const result = await runBenchmarkCase("Case A — zero-delay", 200, stages, delays);

		expect(result.p50Ms).toBeLessThan(10);
		expect(result.p99Ms).toBeLessThan(50);
		expect(result.heapDeltaMb).toBeLessThan(50);

		result.passed = result.p50Ms < 10 && result.p99Ms < 50 && result.heapDeltaMb < 50;
		benchmarkResults.push(result);
	}, 30_000);

	// Case B — fast path (always runs):
	// candle=5ms, strategy=50ms, vector=100ms, decision=20ms, alert=10ms = 185ms total
	// With 200 events this takes ~200 × 185ms = 37 seconds max, feasible.
	test("Case B — fast path (185 ms/event): p99 < 500 ms", async () => {
		const stages = [...PIPELINE_STAGES];
		const delays: Record<string, number> = {
			candle: 5,
			strategy: 50,
			vector: 100,
			decision: 20,
			alert: 10,
		};

		const result = await runBenchmarkCase("Case B — fast path", 200, stages, delays);

		expect(result.p99Ms).toBeLessThan(500);

		result.passed = result.p99Ms < 500;
		benchmarkResults.push(result);
	}, 120_000);

	// Case C — realistic SLA (gated: BENCHMARK_LATENCY=1):
	// candle=10ms, strategy=100ms, vector=200ms, decision=50ms, alert=30ms = 390ms total
	const runLongBenchmarks = process.env.BENCHMARK_LATENCY === "1";

	(runLongBenchmarks ? test : test.skip)(
		"Case C — realistic SLA (390 ms/event): p99 < 1000 ms",
		async () => {
			const stages = [...PIPELINE_STAGES];
			const delays: Record<string, number> = {
				candle: 10,
				strategy: 100,
				vector: 200,
				decision: 50,
				alert: 30,
			};

			const result = await runBenchmarkCase("Case C — realistic SLA", 200, stages, delays);

			expect(result.p99Ms).toBeLessThan(1000);

			result.passed = result.p99Ms < 1000;
			benchmarkResults.push(result);
		},
		300_000,
	);

	// Case D — degraded (gated: BENCHMARK_LATENCY=1):
	// vector=800ms — validates benchmark sensitivity
	(runLongBenchmarks ? test : test.skip)(
		"Case D — degraded (800 ms vector): p99 > 800 ms",
		async () => {
			const stages = [...PIPELINE_STAGES];
			const delays: Record<string, number> = {
				candle: 0,
				strategy: 0,
				vector: 800,
				decision: 0,
				alert: 0,
			};

			const result = await runBenchmarkCase("Case D — degraded", 200, stages, delays);

			// This case validates that the benchmark actually measures latency.
			// p99 must be > 800 ms because each event sleeps 800 ms in the vector stage.
			expect(result.p99Ms).toBeGreaterThan(800);

			result.passed = result.p99Ms > 800;
			benchmarkResults.push(result);
		},
		300_000,
	);
});
