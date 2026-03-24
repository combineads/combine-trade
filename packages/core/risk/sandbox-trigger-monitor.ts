import type { activate } from "./kill-switch.js";
import type { KillSwitchDeps } from "./kill-switch.js";

/** Error codes emitted by the strategy sandbox runtime. */
export type SandboxErrorCode =
	| "ERR_FATAL_SANDBOX_OOM"
	| "ERR_FATAL_SANDBOX_TIMEOUT"
	| "ERR_FATAL_SANDBOX_CRASH";

/** An error event emitted by the sandbox runtime for a specific strategy. */
export interface SandboxErrorEvent {
	strategyId: string;
	errorCode: SandboxErrorCode;
	/** Memory usage in bytes at the time of the OOM. Present for OOM events. */
	memoryUsageBytes?: number;
	/** Execution time in milliseconds at the time of the timeout. Present for timeout events. */
	executionTimeMs?: number;
}

/**
 * Snapshot of sandbox trigger configuration and per-strategy crash counters.
 * Passed to `evaluateSandboxEvent` as read-only state; mutation is managed by
 * `SandboxTriggerMonitor`.
 */
export interface SandboxTriggerState {
	/** Consecutive crash counts keyed by strategyId. */
	consecutiveCrashesByStrategy: Map<string, number>;
	/** Number of consecutive crashes before activating the kill switch. Default: 3. */
	crashThreshold: number;
	/** OOM memory threshold in bytes. Default: 134_217_728 (128 MB). */
	oomThresholdBytes: number;
	/** Timeout threshold in milliseconds. Default: 500. */
	timeoutThresholdMs: number;
}

/** Result of evaluating a single sandbox error event. Always scoped to the strategy. */
export interface SandboxTriggerResult {
	shouldActivate: boolean;
	scope: "strategy";
	scopeTarget: string;
	reason: string;
	errorCode: SandboxErrorCode;
}

/**
 * Pure function that evaluates a sandbox error event against the current trigger
 * state and returns a `SandboxTriggerResult`.
 *
 * - OOM: activates when `memoryUsageBytes >= oomThresholdBytes` (or when
 *   `memoryUsageBytes` is absent — treat as worst-case).
 * - Timeout: activates when `executionTimeMs >= timeoutThresholdMs` (or absent).
 * - Crash: activates when the strategy's consecutive crash count in `state`
 *   has already reached `crashThreshold`. The counter is managed externally by
 *   `SandboxTriggerMonitor` before calling this function.
 */
export function evaluateSandboxEvent(
	event: SandboxErrorEvent,
	state: SandboxTriggerState,
): SandboxTriggerResult {
	const { strategyId, errorCode } = event;
	const base: Pick<SandboxTriggerResult, "scope" | "scopeTarget" | "errorCode"> = {
		scope: "strategy",
		scopeTarget: strategyId,
		errorCode,
	};

	if (errorCode === "ERR_FATAL_SANDBOX_OOM") {
		const memBytes = event.memoryUsageBytes;
		const over = memBytes === undefined || memBytes >= state.oomThresholdBytes;
		return {
			...base,
			shouldActivate: over,
			reason: over
				? `OOM for strategy ${strategyId}: ${memBytes ?? "unknown"} bytes >= ${state.oomThresholdBytes} byte threshold`
				: `OOM for strategy ${strategyId}: ${memBytes} bytes below ${state.oomThresholdBytes} byte threshold`,
		};
	}

	if (errorCode === "ERR_FATAL_SANDBOX_TIMEOUT") {
		const timeMs = event.executionTimeMs;
		const over = timeMs === undefined || timeMs >= state.timeoutThresholdMs;
		return {
			...base,
			shouldActivate: over,
			reason: over
				? `timeout for strategy ${strategyId}: ${timeMs ?? "unknown"}ms >= ${state.timeoutThresholdMs}ms threshold`
				: `timeout for strategy ${strategyId}: ${timeMs}ms below ${state.timeoutThresholdMs}ms threshold`,
		};
	}

	// ERR_FATAL_SANDBOX_CRASH
	const count = state.consecutiveCrashesByStrategy.get(strategyId) ?? 0;
	const triggered = count >= state.crashThreshold;
	return {
		...base,
		shouldActivate: triggered,
		reason: triggered
			? `${count} consecutive crashes for strategy ${strategyId} (threshold: ${state.crashThreshold})`
			: `crash ${count} of ${state.crashThreshold} for strategy ${strategyId} — threshold not yet reached`,
	};
}

/** Constructor options for `SandboxTriggerMonitor`. */
export interface SandboxTriggerMonitorOptions {
	/** Reference to the `activate` function from `kill-switch.ts`. */
	activate: typeof activate;
	/** Initial trigger state. The monitor mutates `consecutiveCrashesByStrategy` internally. */
	state: SandboxTriggerState;
}

/**
 * Stateful monitor that tracks per-strategy consecutive crash counts and
 * activates the per-strategy kill switch when thresholds are breached.
 *
 * Call `onSandboxError` each time the sandbox runtime emits a fatal error.
 * Call `resetCrashCounter` when a strategy executes successfully.
 */
export class SandboxTriggerMonitor {
	private readonly activateFn: typeof activate;
	private readonly state: SandboxTriggerState;

	constructor({ activate: activateFn, state }: SandboxTriggerMonitorOptions) {
		this.activateFn = activateFn;
		this.state = state;
	}

	/**
	 * Process a sandbox error event.
	 *
	 * - For crash events, increments the consecutive crash counter before
	 *   evaluating so that the Nth crash correctly fires the trigger.
	 * - For OOM and timeout events, the crash counter is not affected.
	 * - When `shouldActivate` is true, calls `activate()` with "system" trigger
	 *   scoped to the strategy.
	 */
	async onSandboxError(
		event: SandboxErrorEvent,
		deps: KillSwitchDeps,
	): Promise<SandboxTriggerResult> {
		if (event.errorCode === "ERR_FATAL_SANDBOX_CRASH") {
			const prev = this.state.consecutiveCrashesByStrategy.get(event.strategyId) ?? 0;
			this.state.consecutiveCrashesByStrategy.set(event.strategyId, prev + 1);
		}

		const result = evaluateSandboxEvent(event, this.state);

		if (result.shouldActivate) {
			await this.activateFn("strategy", event.strategyId, "system", deps);
		}

		return result;
	}

	/**
	 * Reset the consecutive crash counter for a strategy to zero.
	 *
	 * Call this when the strategy sandbox executes successfully so that
	 * the next crash starts a new consecutive run from 1.
	 */
	resetCrashCounter(strategyId: string): void {
		this.state.consecutiveCrashesByStrategy.set(strategyId, 0);
	}
}
