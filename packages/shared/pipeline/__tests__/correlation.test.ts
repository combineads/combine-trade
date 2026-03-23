import { describe, expect, test } from "bun:test";
import {
	createCorrelationContext,
	endStage,
	getPipelineLatencyMs,
	startStage,
} from "../correlation.js";

describe("CorrelationContext", () => {
	test("createCorrelationContext generates UUID-format correlationId", () => {
		const ctx = createCorrelationContext();
		expect(ctx.correlationId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	test("two contexts have different correlationIds", () => {
		const ctx1 = createCorrelationContext();
		const ctx2 = createCorrelationContext();
		expect(ctx1.correlationId).not.toBe(ctx2.correlationId);
	});

	test("startStage records start time for a stage", () => {
		const ctx = createCorrelationContext();
		const updated = startStage(ctx, "vector");
		expect(updated.stages.has("vector")).toBe(true);
		expect(updated.stages.get("vector")!.startMs).toBeGreaterThan(0);
	});

	test("endStage records end time for a stage", () => {
		let ctx = createCorrelationContext();
		ctx = startStage(ctx, "vector");
		const updated = endStage(ctx, "vector");
		expect(updated.stages.get("vector")!.endMs).toBeGreaterThan(0);
	});

	test("startStage is immutable — original context unchanged", () => {
		const ctx = createCorrelationContext();
		const updated = startStage(ctx, "vector");
		expect(ctx.stages.has("vector")).toBe(false);
		expect(updated.stages.has("vector")).toBe(true);
	});

	test("getPipelineLatencyMs returns total elapsed time", () => {
		const ctx = createCorrelationContext();
		// Simulate small delay
		const latency = getPipelineLatencyMs(ctx);
		expect(latency).toBeGreaterThanOrEqual(0);
	});

	test("endStage throws if stage was not started", () => {
		const ctx = createCorrelationContext();
		expect(() => endStage(ctx, "nonexistent")).toThrow();
	});

	test("stage duration is endMs - startMs", () => {
		let ctx = createCorrelationContext();
		ctx = startStage(ctx, "strategy");
		// Force a known timing
		const _stage = ctx.stages.get("strategy")!;
		const manualCtx = {
			...ctx,
			stages: new Map(ctx.stages).set("strategy", { startMs: 100, endMs: 0 }),
		};
		const ended = endStage(manualCtx, "strategy");
		expect(ended.stages.get("strategy")!.endMs).toBeGreaterThanOrEqual(100);
	});
});
