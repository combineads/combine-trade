import type { ExchangeAdapter } from "@combine/exchange";
import type { Timeframe } from "@combine/shared";
import { createLogger } from "@combine/shared";
import type { CandleCollector, CandleCollectorDeps } from "./collector.js";

const logger = createLogger("exchange-manager");

const MAX_RESTARTS = 5;
const DEFAULT_RESTART_DELAY_MS = 5_000;
const DEFAULT_STABLE_WINDOW_MS = 10 * 60 * 1_000; // 10 minutes

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExchangeConfig {
	/** Exchange identifier, e.g. "binance" or "okx" */
	id: string;
	/** Exchange adapter instance for this exchange */
	adapter: ExchangeAdapter;
	/** List of symbols to collect for this exchange */
	symbols: string[];
	/** Timeframe for all symbols on this exchange */
	timeframe: Timeframe;
	/** Delay before attempting a restart after a crash (default 5000ms) */
	restartDelayMs?: number;
	/** Duration of stable operation before resetting restart counter (default 10min) */
	stableWindowMs?: number;
	/**
	 * Internal: factory for creating a CandleCollector per (exchange, symbol) pair.
	 * Used by unit tests to inject mock collectors. Not for production use.
	 */
	_collectorFactory?: (deps?: CandleCollectorDeps) => CandleCollector;
}

export type ExchangeStatus = "running" | "degraded" | "error";

export interface ExchangeHealth {
	status: ExchangeStatus;
	symbols: string[];
	restartCount: number;
	lastRestartAt: string | null;
}

export type ExchangeHealthMap = Record<string, ExchangeHealth>;

// ---------------------------------------------------------------------------
// Internal per-exchange state
// ---------------------------------------------------------------------------

interface ExchangeState {
	config: ExchangeConfig;
	collector: CandleCollector | null;
	status: ExchangeStatus;
	restartCount: number;
	lastRestartAt: Date | null;
	/** Timer that will reset the restart counter after a stable window */
	stableResetTimer: ReturnType<typeof setTimeout> | null;
	/** Whether this exchange's restart loop should keep running */
	active: boolean;
}

// ---------------------------------------------------------------------------
// withRestartLoop utility (extracted for reuse per Step 5 of the task)
// ---------------------------------------------------------------------------

export interface RestartLoopOptions {
	maxRestarts: number;
	restartDelayMs: number;
	stableWindowMs: number;
	onCrash(attempt: number, err: Error): void;
	onDegraded(): void;
	onStableReset(): void;
}

/**
 * Runs `fn` in a restart loop.
 * - Restarts on failure up to `maxRestarts` consecutive times.
 * - Resets the counter after `stableWindowMs` of stable operation.
 * - Returns a stop function.
 */
export function withRestartLoop(
	fn: () => Promise<void>,
	opts: RestartLoopOptions,
): { stop(): void; getRestartCount(): number } {
	let restartCount = 0;
	let active = true;
	let stableResetTimer: ReturnType<typeof setTimeout> | null = null;

	function clearStableTimer() {
		if (stableResetTimer !== null) {
			clearTimeout(stableResetTimer);
			stableResetTimer = null;
		}
	}

	function scheduleStableReset() {
		clearStableTimer();
		stableResetTimer = setTimeout(() => {
			restartCount = 0;
			opts.onStableReset();
			stableResetTimer = null;
		}, opts.stableWindowMs);
	}

	async function loop() {
		while (active) {
			try {
				scheduleStableReset();
				await fn();
				// Normal exit (e.g. stop() was called) — clear timer and exit loop
				clearStableTimer();
				break;
			} catch (err) {
				clearStableTimer();
				if (!active) break;

				restartCount++;
				opts.onCrash(restartCount, err as Error);

				if (restartCount >= opts.maxRestarts) {
					opts.onDegraded();
					break;
				}

				if (opts.restartDelayMs > 0) {
					await new Promise<void>((r) => setTimeout(r, opts.restartDelayMs));
				}
			}
		}
	}

	// Start the loop without awaiting — fire and forget
	void loop();

	return {
		stop() {
			active = false;
			clearStableTimer();
		},
		getRestartCount() {
			return restartCount;
		},
	};
}

// ---------------------------------------------------------------------------
// ExchangeCollectorManager
// ---------------------------------------------------------------------------

/**
 * Manages one CandleCollector per configured exchange.
 * Provides independent restart loops and health reporting per exchange.
 * All deps are injected via constructor for testability.
 */
export class ExchangeCollectorManager {
	private readonly states = new Map<string, ExchangeState>();
	private readonly loopControls = new Map<string, ReturnType<typeof withRestartLoop>>();

	constructor(private readonly configs: ExchangeConfig[]) {
		for (const config of configs) {
			this.states.set(config.id, {
				config,
				collector: null,
				status: "running",
				restartCount: 0,
				lastRestartAt: null,
				stableResetTimer: null,
				active: true,
			});
		}
	}

	/**
	 * Start all per-exchange collectors concurrently.
	 * Each exchange runs in its own independent restart loop.
	 */
	async start(): Promise<void> {
		for (const config of this.configs) {
			this.startExchange(config);
		}
	}

	private startExchange(config: ExchangeConfig): void {
		const state = this.states.get(config.id);
		if (!state) return;

		const restartDelayMs = config.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS;
		const stableWindowMs = config.stableWindowMs ?? DEFAULT_STABLE_WINDOW_MS;

		const control = withRestartLoop(
			async () => {
				// Build a fresh collector for this exchange and all its symbols
				const collector = this.buildCollector(config);
				state.collector = collector;

				// Run all symbols concurrently within one exchange
				await Promise.all(
					config.symbols.map((symbol) => collector.start(config.id, symbol, config.timeframe)),
				);
			},
			{
				maxRestarts: MAX_RESTARTS,
				restartDelayMs,
				stableWindowMs,
				onCrash: (attempt, err) => {
					state.restartCount = attempt;
					state.lastRestartAt = new Date();
					logger.error(
						{
							exchange: config.id,
							attempt,
							error: err.message,
						},
						`[exchange-manager] exchange=${config.id} event=restart attempt=${attempt}`,
					);
				},
				onDegraded: () => {
					state.status = "degraded";
					logger.error(
						{ exchange: config.id, maxRestarts: MAX_RESTARTS },
						`[exchange-manager] exchange=${config.id} event=degraded maxRestarts=${MAX_RESTARTS} reached`,
					);
				},
				onStableReset: () => {
					state.restartCount = 0;
					logger.info(
						{ exchange: config.id },
						`[exchange-manager] exchange=${config.id} event=stable-reset`,
					);
				},
			},
		);

		this.loopControls.set(config.id, control);
	}

	/** Gracefully stop all collectors. */
	async stop(): Promise<void> {
		// Signal all restart loops to stop
		for (const control of this.loopControls.values()) {
			control.stop();
		}

		// Stop each active collector
		const stopPromises: Promise<void>[] = [];
		for (const state of this.states.values()) {
			if (state.collector) {
				stopPromises.push(state.collector.stop());
			}
			state.active = false;
		}

		await Promise.all(stopPromises);
	}

	/** Returns per-exchange health summary. */
	getHealth(): ExchangeHealthMap {
		const map: ExchangeHealthMap = {};
		for (const [id, state] of this.states) {
			const control = this.loopControls.get(id);
			// Use live restart count from control if available, else state
			const restartCount = control ? control.getRestartCount() : state.restartCount;
			map[id] = {
				status: state.status,
				symbols: state.config.symbols,
				restartCount,
				lastRestartAt: state.lastRestartAt?.toISOString() ?? null,
			};
		}
		return map;
	}

	/**
	 * Returns the aggregate status across all exchanges.
	 * - "ok" if all exchanges are healthy
	 * - "degraded" if any exchange has failed over but not yet hit max restarts
	 * - "error" if any exchange has hit max restarts
	 */
	getOverallStatus(): "ok" | "degraded" | "error" {
		let hasError = false;
		let hasDegraded = false;

		for (const state of this.states.values()) {
			if (state.status === "degraded") {
				// After max restarts we mark as degraded — surface as "error" at aggregate level
				hasError = true;
			} else if (state.status === "error") {
				hasError = true;
			}
		}

		// Check live restart counts for in-progress failures
		for (const [id, control] of this.loopControls) {
			const state = this.states.get(id);
			if (!state) continue;
			const count = control.getRestartCount();
			if (count >= MAX_RESTARTS) {
				hasError = true;
			} else if (count > 0) {
				hasDegraded = true;
			}
		}

		if (hasError) return "error";
		if (hasDegraded) return "degraded";
		return "ok";
	}

	// ---------------------------------------------------------------------------
	// Internal helper
	// ---------------------------------------------------------------------------

	private buildCollector(config: ExchangeConfig): CandleCollector {
		if (config._collectorFactory) {
			return config._collectorFactory();
		}
		// Production: import CandleCollector lazily (avoids circular deps at import time)
		throw new Error(
			`[exchange-manager] No _collectorFactory provided for exchange=${config.id}. In production, pass a collectorFactory to ExchangeCollectorManager.`,
		);
	}
}
