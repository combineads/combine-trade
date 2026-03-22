import { describe, expect, test } from "bun:test";
import { PipelineMetrics } from "../metrics.js";

describe("PipelineMetrics", () => {
	test("recordLatency and getSnapshot", () => {
		const m = new PipelineMetrics();
		m.recordLatency("vector", 10);
		m.recordLatency("vector", 20);
		m.recordLatency("vector", 30);

		const snap = m.getSnapshot("vector");
		expect(snap.latency.count).toBe(3);
		expect(snap.latency.p50).toBe(20);
	});

	test("p95 and p99 with 100 samples", () => {
		const m = new PipelineMetrics();
		for (let i = 1; i <= 100; i++) {
			m.recordLatency("strategy", i);
		}

		const snap = m.getSnapshot("strategy");
		expect(snap.latency.count).toBe(100);
		expect(snap.latency.p50).toBe(50);
		expect(snap.latency.p95).toBe(95);
		expect(snap.latency.p99).toBe(99);
	});

	test("recordError increments error count", () => {
		const m = new PipelineMetrics();
		m.recordError("vector");
		m.recordError("vector");
		m.recordError("vector");

		const snap = m.getSnapshot("vector");
		expect(snap.errors).toBe(3);
	});

	test("recordEvent increments event count", () => {
		const m = new PipelineMetrics();
		m.recordEvent("decision");
		m.recordEvent("decision");

		const snap = m.getSnapshot("decision");
		expect(snap.events).toBe(2);
	});

	test("unknown stage returns zeroed snapshot", () => {
		const m = new PipelineMetrics();
		const snap = m.getSnapshot("nonexistent");
		expect(snap.latency.count).toBe(0);
		expect(snap.latency.p50).toBe(0);
		expect(snap.latency.p95).toBe(0);
		expect(snap.latency.p99).toBe(0);
		expect(snap.errors).toBe(0);
		expect(snap.events).toBe(0);
	});

	test("reset clears all metrics", () => {
		const m = new PipelineMetrics();
		m.recordLatency("vector", 10);
		m.recordError("vector");
		m.recordEvent("vector");

		m.reset();

		const snap = m.getSnapshot("vector");
		expect(snap.latency.count).toBe(0);
		expect(snap.errors).toBe(0);
		expect(snap.events).toBe(0);
	});

	test("getSnapshot does not mutate internal state", () => {
		const m = new PipelineMetrics();
		m.recordLatency("vector", 10);

		const snap1 = m.getSnapshot("vector");
		const snap2 = m.getSnapshot("vector");
		expect(snap1.latency.count).toBe(snap2.latency.count);
	});

	test("multiple stages tracked independently", () => {
		const m = new PipelineMetrics();
		m.recordLatency("vector", 10);
		m.recordLatency("strategy", 50);
		m.recordError("strategy");

		expect(m.getSnapshot("vector").latency.count).toBe(1);
		expect(m.getSnapshot("strategy").latency.count).toBe(1);
		expect(m.getSnapshot("vector").errors).toBe(0);
		expect(m.getSnapshot("strategy").errors).toBe(1);
	});
});
