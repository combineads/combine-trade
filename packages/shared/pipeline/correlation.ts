export interface StageTimestamp {
	startMs: number;
	endMs: number;
}

export interface CorrelationContext {
	correlationId: string;
	startedAt: number;
	stages: Map<string, StageTimestamp>;
}

/** Create a new correlation context with a UUID. */
export function createCorrelationContext(): CorrelationContext {
	return {
		correlationId: crypto.randomUUID(),
		startedAt: Date.now(),
		stages: new Map(),
	};
}

/** Record the start of a pipeline stage. Returns a new context (immutable). */
export function startStage(ctx: CorrelationContext, name: string): CorrelationContext {
	const stages = new Map(ctx.stages);
	stages.set(name, { startMs: Date.now(), endMs: 0 });
	return { ...ctx, stages };
}

/** Record the end of a pipeline stage. Returns a new context (immutable). */
export function endStage(ctx: CorrelationContext, name: string): CorrelationContext {
	const existing = ctx.stages.get(name);
	if (!existing) {
		throw new Error(`Stage "${name}" was not started`);
	}
	const stages = new Map(ctx.stages);
	stages.set(name, { ...existing, endMs: Date.now() });
	return { ...ctx, stages };
}

/** Get total pipeline latency from creation to now. */
export function getPipelineLatencyMs(ctx: CorrelationContext): number {
	return Date.now() - ctx.startedAt;
}
