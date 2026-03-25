import { describe, expect, test } from "bun:test";
import {
	type MetricsFlushDeps,
	MetricsFlushService,
	type MetricsRecord,
} from "../metrics-flush.js";
import { PipelineMetrics } from "../metrics.js";

function makeDeps(overrides: Partial<MetricsFlushDeps> = {}): MetricsFlushDeps & {
	written: MetricsRecord[][];
	purged: number[];
} {
	const written: MetricsRecord[][] = [];
	const purged: number[] = [];
	return {
		written,
		purged,
		writeMetrics:
			overrides.writeMetrics ??
			(async (records) => {
				written.push([...records]);
			}),
		purgeOlderThan:
			overrides.purgeOlderThan ??
			(async (days) => {
				purged.push(days);
			}),
	};
}

describe("MetricsFlushService", () => {
	test("flush() writes snapshot for each stage with data", async () => {
		const metrics = new PipelineMetrics();
		metrics.recordLatency("vector", 10);
		metrics.recordLatency("vector", 20);
		metrics.recordLatency("vector", 30);
		metrics.recordError("vector");
		metrics.recordEvent("strategy");

		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector", "strategy"] });

		await svc.flush();

		expect(deps.written.length).toBe(1);
		const batch = deps.written[0];
		expect(batch).toBeDefined();
		expect(batch?.length).toBe(2);

		const vectorRecord = batch?.find((r) => r.stage === "vector");
		expect(vectorRecord).toBeDefined();
		expect(vectorRecord?.p50).toBe(20);
		expect(vectorRecord?.p95).toBe(30);
		expect(vectorRecord?.p99).toBe(30);
		expect(vectorRecord?.errors).toBe(1);
		expect(vectorRecord?.events).toBe(0);

		const strategyRecord = batch?.find((r) => r.stage === "strategy");
		expect(strategyRecord).toBeDefined();
		expect(strategyRecord?.events).toBe(1);
		expect(strategyRecord?.errors).toBe(0);
	});

	test("flush() resets metrics after writing", async () => {
		const metrics = new PipelineMetrics();
		metrics.recordLatency("vector", 10);

		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector"] });

		await svc.flush();

		// After flush, metrics should be reset
		const snap = metrics.getSnapshot("vector");
		expect(snap.latency.count).toBe(0);
	});

	test("flush() skips stages with no data", async () => {
		const metrics = new PipelineMetrics();
		// No data recorded

		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector", "strategy"] });

		await svc.flush();

		// writeMetrics not called when no data
		expect(deps.written.length).toBe(0);
	});

	test("flush() never throws when writer fails", async () => {
		const metrics = new PipelineMetrics();
		metrics.recordLatency("vector", 10);

		const deps = makeDeps({
			writeMetrics: async () => {
				throw new Error("DB down");
			},
		});
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector"] });

		// Should not throw
		await expect(svc.flush()).resolves.toBeUndefined();
	});

	test("flush() includes capturedAt timestamp", async () => {
		const before = Date.now();
		const metrics = new PipelineMetrics();
		metrics.recordLatency("vector", 5);

		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector"] });
		await svc.flush();
		const after = Date.now();

		const record = deps.written[0]?.[0];
		expect(record).toBeDefined();
		expect(record?.capturedAt).toBeGreaterThanOrEqual(before);
		expect(record?.capturedAt).toBeLessThanOrEqual(after);
	});

	test("start() and stop() are idempotent", async () => {
		const metrics = new PipelineMetrics();
		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: [], intervalMs: 10_000 });

		// stop before start is safe
		svc.stop();

		svc.start();
		svc.start(); // second start is no-op

		svc.stop();
		svc.stop(); // second stop is safe
	});

	test("stop() clears the interval so no more flushes occur", async () => {
		const metrics = new PipelineMetrics();
		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector"], intervalMs: 50 });

		metrics.recordLatency("vector", 10);
		svc.start();
		svc.stop();

		// Wait longer than interval to confirm no more flushes
		await Bun.sleep(100);
		// Only stop()-triggered flush would have been attempted, but with no data after reset
		expect(deps.written.length).toBeLessThanOrEqual(1);
	});

	test("purgeOlderThan is delegated correctly", async () => {
		const metrics = new PipelineMetrics();
		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: [] });

		await svc.purge(30);

		expect(deps.purged).toEqual([30]);
	});

	test("MetricsRecord has required fields", async () => {
		const metrics = new PipelineMetrics();
		metrics.recordLatency("label", 100);
		metrics.recordLatency("label", 200);
		metrics.recordError("label");
		metrics.recordEvent("label");
		metrics.recordEvent("label");

		const deps = makeDeps();
		const svc = new MetricsFlushService(metrics, deps, { stages: ["label"] });
		await svc.flush();

		const record = deps.written[0]?.[0];
		expect(record).toBeDefined();
		// Must have all required fields
		expect(typeof record?.stage).toBe("string");
		expect(typeof record?.p50).toBe("number");
		expect(typeof record?.p95).toBe("number");
		expect(typeof record?.p99).toBe("number");
		expect(typeof record?.count).toBe("number");
		expect(typeof record?.errors).toBe("number");
		expect(typeof record?.events).toBe("number");
		expect(typeof record?.capturedAt).toBe("number");
	});

	test("flush() does not reset metrics if write fails", async () => {
		const metrics = new PipelineMetrics();
		metrics.recordLatency("vector", 42);

		const deps = makeDeps({
			writeMetrics: async () => {
				throw new Error("DB error");
			},
		});
		const svc = new MetricsFlushService(metrics, deps, { stages: ["vector"] });

		await svc.flush();

		// Metrics should NOT be reset if write failed
		const snap = metrics.getSnapshot("vector");
		expect(snap.latency.count).toBe(1);
		expect(snap.latency.p50).toBe(42);
	});
});
