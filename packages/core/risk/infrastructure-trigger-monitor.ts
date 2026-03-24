import { activate } from "./kill-switch.js";
import type { KillSwitchDeps } from "./kill-switch.js";
import type { KillSwitchScope } from "./types.js";

// ---------------------------------------------------------------------------
// Thresholds (ms)
// ---------------------------------------------------------------------------

const EXCHANGE_API_THRESHOLD_MS = 30_000;
const DB_THRESHOLD_MS = 15_000;
const WORKER_THRESHOLD_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Snapshot of infrastructure health state passed to the evaluator.
 * All timestamps are the point in time when the failure was first detected.
 * `gracePeriodMs` is a configurable delay before a trigger fires (default 60_000ms).
 */
export interface InfrastructureHealthState {
	/** Timestamp when the exchange API became unreachable. null = healthy. */
	exchangeApiUnreachableSince: Date | null;
	/** Timestamp when the DB connection was lost. null = healthy. */
	dbConnectionLostSince: Date | null;
	/** Timestamp when the execution worker became unresponsive. null = healthy. */
	executionWorkerUnresponsiveSince: Date | null;
	/** Per-strategy map of timestamps when a strategy worker became unresponsive. */
	strategyWorkerUnresponsiveSince: Map<string, Date>;
	/** Whether any positions are currently open. */
	hasOpenPositions: boolean;
	/** Configurable grace period before a trigger fires (ms). Default: 60_000. */
	gracePeriodMs: number;
}

/**
 * Result produced by `evaluateInfrastructureTriggers` for each detected condition.
 */
export interface InfrastructureTriggerResult {
	/** Whether to activate the kill switch. false when blockEntryOnly is true. */
	shouldActivate: boolean;
	/** true when no positions are open — use block-entry mode instead of full kill. */
	blockEntryOnly: boolean;
	/** Scope of the kill switch activation. */
	scope: KillSwitchScope;
	/** Scope-specific target (exchange id, strategy id). null for global/exchange scopes. */
	scopeTarget: string | null;
	/** Human-readable reason for the trigger. */
	reason: string;
}

// ---------------------------------------------------------------------------
// Pure evaluation function
// ---------------------------------------------------------------------------

/**
 * Evaluates infrastructure health state and returns trigger results.
 *
 * This is a pure function: given the same `state` and `now`, it always
 * returns the same results. No side effects.
 *
 * Grace period thresholds:
 * - Exchange API unreachable: 30s
 * - DB connection lost: 15s
 * - Execution / strategy worker unresponsive: 60s
 *
 * When `hasOpenPositions` is false, `shouldActivate` is always false and
 * `blockEntryOnly` is set to true instead of firing a full kill switch.
 */
export function evaluateInfrastructureTriggers(
	state: InfrastructureHealthState,
	now: Date,
): InfrastructureTriggerResult[] {
	const results: InfrastructureTriggerResult[] = [];
	const nowMs = now.getTime();

	// --- Exchange API unreachability (threshold: 30s) ---
	if (state.exchangeApiUnreachableSince !== null) {
		const elapsedMs = nowMs - state.exchangeApiUnreachableSince.getTime();
		if (elapsedMs > EXCHANGE_API_THRESHOLD_MS) {
			const elapsedSec = Math.floor(elapsedMs / 1000);
			if (state.hasOpenPositions) {
				results.push({
					shouldActivate: true,
					blockEntryOnly: false,
					scope: "exchange",
					scopeTarget: null,
					reason: `exchange API unreachable for ${elapsedSec}s with open positions`,
				});
			} else {
				results.push({
					shouldActivate: false,
					blockEntryOnly: true,
					scope: "exchange",
					scopeTarget: null,
					reason: `exchange API unreachable for ${elapsedSec}s — no open positions, block entry only`,
				});
			}
		}
	}

	// --- DB connection loss (threshold: 15s) ---
	if (state.dbConnectionLostSince !== null) {
		const elapsedMs = nowMs - state.dbConnectionLostSince.getTime();
		if (elapsedMs > DB_THRESHOLD_MS) {
			const elapsedSec = Math.floor(elapsedMs / 1000);
			if (state.hasOpenPositions) {
				results.push({
					shouldActivate: true,
					blockEntryOnly: false,
					scope: "global",
					scopeTarget: null,
					reason: `DB connection lost for ${elapsedSec}s with open positions`,
				});
			} else {
				results.push({
					shouldActivate: false,
					blockEntryOnly: true,
					scope: "global",
					scopeTarget: null,
					reason: `DB connection lost for ${elapsedSec}s — no open positions, block entry only`,
				});
			}
		}
	}

	// --- Execution worker unresponsiveness (threshold: 60s) ---
	if (state.executionWorkerUnresponsiveSince !== null) {
		const elapsedMs = nowMs - state.executionWorkerUnresponsiveSince.getTime();
		if (elapsedMs > WORKER_THRESHOLD_MS) {
			const elapsedSec = Math.floor(elapsedMs / 1000);
			if (state.hasOpenPositions) {
				results.push({
					shouldActivate: true,
					blockEntryOnly: false,
					scope: "global",
					scopeTarget: null,
					reason: `execution worker unresponsive for ${elapsedSec}s with open positions`,
				});
			} else {
				results.push({
					shouldActivate: false,
					blockEntryOnly: true,
					scope: "global",
					scopeTarget: null,
					reason: `execution worker unresponsive for ${elapsedSec}s — no open positions, block entry only`,
				});
			}
		}
	}

	// --- Per-strategy worker unresponsiveness (threshold: 60s) ---
	for (const [strategyId, since] of state.strategyWorkerUnresponsiveSince) {
		const elapsedMs = nowMs - since.getTime();
		if (elapsedMs > WORKER_THRESHOLD_MS) {
			const elapsedSec = Math.floor(elapsedMs / 1000);
			if (state.hasOpenPositions) {
				results.push({
					shouldActivate: true,
					blockEntryOnly: false,
					scope: "strategy",
					scopeTarget: strategyId,
					reason: `strategy worker "${strategyId}" unresponsive for ${elapsedSec}s with open positions`,
				});
			} else {
				results.push({
					shouldActivate: false,
					blockEntryOnly: true,
					scope: "strategy",
					scopeTarget: strategyId,
					reason: `strategy worker "${strategyId}" unresponsive for ${elapsedSec}s — no open positions, block entry only`,
				});
			}
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Monitor class
// ---------------------------------------------------------------------------

/**
 * Wraps the pure `evaluateInfrastructureTriggers` function and provides
 * an `applyResults` method that calls `activate()` for each qualifying result.
 */
export class InfrastructureTriggerMonitor {
	/**
	 * Evaluate infrastructure health state and return trigger results.
	 * Delegates to the pure `evaluateInfrastructureTriggers` function.
	 */
	evaluate(state: InfrastructureHealthState, now: Date): InfrastructureTriggerResult[] {
		return evaluateInfrastructureTriggers(state, now);
	}

	/**
	 * Apply trigger results: call `activate()` once per result where
	 * `shouldActivate` is true. Results with `shouldActivate: false` are skipped.
	 */
	async applyResults(
		results: InfrastructureTriggerResult[],
		deps: KillSwitchDeps,
	): Promise<void> {
		for (const result of results) {
			if (!result.shouldActivate) continue;
			await activate(result.scope, result.scopeTarget, "api_error", deps);
		}
	}
}
