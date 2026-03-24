/** State for a single strategy's consecutive stop-loss tracking. */
export interface ConsecutiveSlState {
	strategyId: string;
	consecutiveLosses: number;
	/** The number of consecutive losses that triggers suspension. Default: 5. */
	threshold: number;
	suspended: boolean;
	suspendedAt: Date | null;
}

/** Injectable dependencies for ConsecutiveSlLimiter functions. */
export interface ConsecutiveSlDeps {
	/** Load persisted state for a strategy, or null if no record exists yet. */
	loadState(strategyId: string): Promise<ConsecutiveSlState | null>;
	/** Persist updated state. Called before every function returns. */
	saveState(state: ConsecutiveSlState): Promise<void>;
	/** Called exactly once when the threshold-crossing LOSS is recorded. */
	sendSuspensionAlert(strategyId: string, consecutiveLosses: number): Promise<void>;
}

const DEFAULT_THRESHOLD = 5;

/** Error thrown when attempting to reset a strategy that is not suspended. */
export class ConsecutiveSlNotSuspendedError extends Error {
	constructor(strategyId: string) {
		super(`Strategy "${strategyId}" is not currently suspended`);
		this.name = "ConsecutiveSlNotSuspendedError";
	}
}

/**
 * Return the default initial state for a strategy that has no persisted record.
 */
function defaultState(strategyId: string): ConsecutiveSlState {
	return {
		strategyId,
		consecutiveLosses: 0,
		threshold: DEFAULT_THRESHOLD,
		suspended: false,
		suspendedAt: null,
	};
}

/**
 * Record a WIN or LOSS outcome for a strategy.
 *
 * - WIN: resets `consecutiveLosses` to 0 (regardless of suspended state).
 * - LOSS: increments `consecutiveLosses`; when the count first reaches the
 *   threshold the strategy is suspended and `deps.sendSuspensionAlert` is
 *   invoked. Subsequent losses after suspension do NOT trigger another alert.
 *
 * Always persists via `deps.saveState` before returning.
 */
export async function recordOutcome(
	strategyId: string,
	outcome: "WIN" | "LOSS",
	deps: ConsecutiveSlDeps,
): Promise<ConsecutiveSlState> {
	const existing = await deps.loadState(strategyId);
	const state: ConsecutiveSlState = existing ? { ...existing } : defaultState(strategyId);

	if (outcome === "WIN") {
		state.consecutiveLosses = 0;
	} else {
		// outcome === "LOSS"
		const wasAlreadySuspended = state.suspended;
		state.consecutiveLosses += 1;

		if (!wasAlreadySuspended && state.consecutiveLosses >= state.threshold) {
			state.suspended = true;
			state.suspendedAt = new Date();
			await deps.saveState(state);
			await deps.sendSuspensionAlert(strategyId, state.consecutiveLosses);
			return state;
		}
	}

	await deps.saveState(state);
	return state;
}

/**
 * Manually reset the suspension for a strategy.
 *
 * Sets `suspended` to false, clears `consecutiveLosses` and `suspendedAt`.
 * Always persists via `deps.saveState` before returning.
 *
 * @throws {ConsecutiveSlNotSuspendedError} if the strategy is not currently suspended.
 */
export async function resetSuspension(
	strategyId: string,
	deps: ConsecutiveSlDeps,
): Promise<ConsecutiveSlState> {
	const existing = await deps.loadState(strategyId);
	const state: ConsecutiveSlState = existing ? { ...existing } : defaultState(strategyId);

	if (!state.suspended) {
		throw new ConsecutiveSlNotSuspendedError(strategyId);
	}

	state.suspended = false;
	state.consecutiveLosses = 0;
	state.suspendedAt = null;

	await deps.saveState(state);
	return state;
}

/**
 * Pure predicate — returns true when the strategy's auto-trade is suspended
 * due to consecutive stop-losses.
 */
export function isSuspended(state: ConsecutiveSlState): boolean {
	return state.suspended;
}
