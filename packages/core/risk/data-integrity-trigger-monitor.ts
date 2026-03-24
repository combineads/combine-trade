import type { KillSwitchDeps } from "./kill-switch.js";
import { activate } from "./kill-switch.js";
import type { KillSwitchScope } from "./types.js";

/**
 * State snapshot fed into the data integrity trigger evaluator.
 * Maps use symbol/strategyId keys and consecutive event counts as values.
 */
export interface DataIntegrityState {
	/** symbol → consecutive candle gap count */
	candleGapsBySymbol: Map<string, number>;
	/** strategyId → consecutive vector search timeout count */
	vectorSearchTimeoutsByStrategy: Map<string, number>;
	/** Whether any open positions exist at evaluation time */
	hasOpenPositions: boolean;
	/** Candle gap count that triggers kill switch (default 3) */
	candleGapThreshold: number;
	/** Vector search timeout count that triggers kill switch (default 3) */
	vectorTimeoutThreshold: number;
}

/**
 * Result produced by the data integrity trigger evaluator for a single condition.
 * positionSnapshotRequired is always true — data integrity triggers require capturing
 * a position snapshot before the kill switch activates.
 */
export interface DataIntegrityTriggerResult {
	shouldActivate: boolean;
	scope: KillSwitchScope;
	scopeTarget: string | null;
	reason: string;
	/** Always true for data integrity triggers — snapshot positions before activating */
	positionSnapshotRequired: boolean;
}

/**
 * Pure function. Evaluates data integrity trigger conditions and returns one result
 * per detected condition. No side effects.
 *
 * Rules:
 * - Candle gap ≥ threshold AND hasOpenPositions → global kill (candle gap affects all strategies)
 * - Vector timeout ≥ threshold AND hasOpenPositions → per-strategy kill
 * - No open positions → shouldActivate: false regardless of counts
 */
export function evaluateDataIntegrityTriggers(
	state: DataIntegrityState,
): DataIntegrityTriggerResult[] {
	const results: DataIntegrityTriggerResult[] = [];

	for (const [symbol, gapCount] of state.candleGapsBySymbol) {
		results.push({
			shouldActivate: gapCount >= state.candleGapThreshold && state.hasOpenPositions,
			scope: "global",
			scopeTarget: null,
			reason: `${gapCount} consecutive candle gap(s) for ${symbol} with open positions`,
			positionSnapshotRequired: true,
		});
	}

	for (const [strategyId, timeoutCount] of state.vectorSearchTimeoutsByStrategy) {
		results.push({
			shouldActivate: timeoutCount >= state.vectorTimeoutThreshold && state.hasOpenPositions,
			scope: "strategy",
			scopeTarget: strategyId,
			reason: `vector search timeout ${timeoutCount}x for strategy ${strategyId}`,
			positionSnapshotRequired: true,
		});
	}

	return results;
}

/** Dependencies injected into DataIntegrityTriggerMonitor. */
export interface DataIntegrityTriggerMonitorDeps {
	activate: typeof activate;
}

/**
 * Monitor that wraps evaluateDataIntegrityTriggers with kill switch activation.
 * Receives injectable deps so packages/core remains free of CCXT/Drizzle/Elysia/Slack.
 */
export class DataIntegrityTriggerMonitor {
	private readonly deps: DataIntegrityTriggerMonitorDeps;

	constructor(deps: DataIntegrityTriggerMonitorDeps) {
		this.deps = deps;
	}

	/** Evaluate the current state. Returns one result per detected condition. */
	evaluate(state: DataIntegrityState): DataIntegrityTriggerResult[] {
		return evaluateDataIntegrityTriggers(state);
	}

	/**
	 * Apply evaluation results by calling activate() for every result with
	 * shouldActivate: true. Results where shouldActivate: false are skipped.
	 */
	async applyResults(
		results: DataIntegrityTriggerResult[],
		killSwitchDeps: KillSwitchDeps,
	): Promise<void> {
		for (const result of results) {
			if (!result.shouldActivate) continue;
			await this.deps.activate(result.scope, result.scopeTarget, "system", killSwitchDeps);
		}
	}
}
