import { describe, expect, test } from "bun:test";
import {
	createCorrelationContext,
	endStage,
	getPipelineLatencyMs,
	startStage,
} from "@combine/shared/pipeline/correlation.js";
import { handleFailure, shouldRetry, type DeadLetterDeps } from "@combine/shared/pipeline/dead-letter.js";
import { runCatchUp, type CatchUpDeps } from "@combine/shared/pipeline/catch-up.js";
import { PipelineMetrics } from "@combine/shared/pipeline/metrics.js";

describe("Pipeline orchestration integration", () => {
	test("correlation context tracks full pipeline flow", () => {
		let ctx = createCorrelationContext();
		expect(ctx.correlationId).toBeDefined();

		// Simulate: candle → strategy → vector → decision → alert
		const stages = ["candle", "strategy", "vector", "decision", "alert"];
		for (const stage of stages) {
			ctx = startStage(ctx, stage);
			ctx = endStage(ctx, stage);
		}

		expect(ctx.stages.size).toBe(5);
		for (const stage of stages) {
			const s = ctx.stages.get(stage)!;
			expect(s.startMs).toBeGreaterThan(0);
			expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
		}

		const latency = getPipelineLatencyMs(ctx);
		expect(latency).toBeGreaterThanOrEqual(0);
	});

	test("dead-letter: retries 3 times then dead-letters", async () => {
		const saved: Array<Record<string, unknown>> = [];
		const deps: DeadLetterDeps = {
			loadRetryCount: async () => 2,
			saveDeadLetter: async (entry) => { saved.push(entry); },
		};

		// Retry count 2 → still retryable
		const r1 = await handleFailure("evt-1", "vector", new Error("timeout"), deps);
		expect(r1.action).toBe("retry");
		expect(saved).toHaveLength(0);

		// Retry count 3 → dead-letter
		const deps2: DeadLetterDeps = {
			loadRetryCount: async () => 3,
			saveDeadLetter: async (entry) => { saved.push(entry); },
		};
		const r2 = await handleFailure("evt-1", "vector", new Error("timeout"), deps2);
		expect(r2.action).toBe("dead_letter");
		expect(saved).toHaveLength(1);
	});

	test("catch-up: processes missed events with error isolation", async () => {
		const events = [
			{ id: "e1", data: "ok" },
			{ id: "e2", data: "fail" },
			{ id: "e3", data: "ok" },
		];
		const processed: string[] = [];
		const marked: string[] = [];

		const deps: CatchUpDeps<(typeof events)[0]> = {
			findUnprocessedEvents: async () => events,
			processEvent: async (evt) => {
				if (evt.data === "fail") throw new Error("process error");
				processed.push(evt.id);
			},
			markProcessed: async (evt) => { marked.push(evt.id); },
			getEventId: (evt) => evt.id,
		};

		const result = await runCatchUp(deps);
		expect(result.processed).toBe(2);
		expect(result.failed).toBe(1);
		expect(processed).toEqual(["e1", "e3"]);
		expect(marked).toEqual(["e1", "e3"]);
	});

	test("metrics: record and snapshot across stages", () => {
		const metrics = new PipelineMetrics();

		// Simulate pipeline metrics
		metrics.recordLatency("candle", 5);
		metrics.recordLatency("strategy", 15);
		metrics.recordLatency("vector", 50);
		metrics.recordLatency("decision", 2);
		metrics.recordLatency("alert", 100);

		metrics.recordEvent("candle");
		metrics.recordEvent("strategy");
		metrics.recordEvent("vector");
		metrics.recordError("alert");

		const vectorSnap = metrics.getSnapshot("vector");
		expect(vectorSnap.latency.count).toBe(1);
		expect(vectorSnap.latency.p50).toBe(50);
		expect(vectorSnap.events).toBe(1);

		const alertSnap = metrics.getSnapshot("alert");
		expect(alertSnap.errors).toBe(1);
		expect(alertSnap.latency.p50).toBe(100);

		// Reset and verify
		metrics.reset();
		expect(metrics.getSnapshot("vector").latency.count).toBe(0);
	});

	test("correlation + metrics composed: track latency per stage", () => {
		let ctx = createCorrelationContext();
		const metrics = new PipelineMetrics();

		// Simulate pipeline with timing
		const stages = ["candle", "strategy", "vector"];
		for (const stage of stages) {
			ctx = startStage(ctx, stage);
			// Simulate work
			ctx = endStage(ctx, stage);
			const s = ctx.stages.get(stage)!;
			metrics.recordLatency(stage, s.endMs - s.startMs);
			metrics.recordEvent(stage);
		}

		expect(ctx.stages.size).toBe(3);
		for (const stage of stages) {
			const snap = metrics.getSnapshot(stage);
			expect(snap.latency.count).toBe(1);
			expect(snap.events).toBe(1);
		}
	});
});
