import { createLogger } from "@combine/shared";

const logger = createLogger("supervisor");

export interface WorkerConfig {
	name: string;
	command: string;
}

export interface SupervisorConfig {
	workers: WorkerConfig[];
	maxRestarts: number;
	stableAfterMs: number;
	shutdownTimeoutMs: number;
}

export interface WorkerState {
	name: string;
	command: string;
	restartCount: number;
	lastCrashTime: number;
	running: boolean;
}

/** Calculate exponential backoff: 1s, 2s, 4s, 8s, 16s */
export function calculateBackoff(restartCount: number): number {
	return 1000 * 2 ** restartCount;
}

/** Check if a worker should be restarted based on its restart count */
export function shouldRestart(state: WorkerState, maxRestarts: number): boolean {
	return state.restartCount < maxRestarts;
}

/**
 * Worker process supervisor.
 * Manages worker lifecycle: start, crash recovery, backoff, and graceful shutdown.
 * Pure state management — actual process spawning is done by the caller.
 */
export class WorkerSupervisor {
	private readonly states: Map<string, WorkerState>;
	private readonly config: SupervisorConfig;

	constructor(config: SupervisorConfig) {
		this.config = config;
		this.states = new Map();

		for (const worker of config.workers) {
			this.states.set(worker.name, {
				name: worker.name,
				command: worker.command,
				restartCount: 0,
				lastCrashTime: 0,
				running: false,
			});
		}
	}

	getWorkerStates(): WorkerState[] {
		return [...this.states.values()];
	}

	getWorkerState(name: string): WorkerState | undefined {
		return this.states.get(name);
	}

	recordCrash(name: string): void {
		const state = this.states.get(name);
		if (!state) return;
		state.restartCount++;
		state.lastCrashTime = Date.now();
		state.running = false;
		logger.warn({ worker: name, restartCount: state.restartCount }, "Worker crashed");
	}

	recordStable(name: string): void {
		const state = this.states.get(name);
		if (!state) return;
		state.restartCount = 0;
		logger.info({ worker: name }, "Worker stable — restart count reset");
	}

	canRestart(name: string): boolean {
		const state = this.states.get(name);
		if (!state) return false;
		return shouldRestart(state, this.config.maxRestarts);
	}

	getBackoffMs(name: string): number {
		const state = this.states.get(name);
		if (!state) return 0;
		return calculateBackoff(state.restartCount);
	}

	setRunning(name: string, running: boolean): void {
		const state = this.states.get(name);
		if (!state) return;
		state.running = running;
	}

	allGivenUp(): boolean {
		for (const state of this.states.values()) {
			if (state.restartCount < this.config.maxRestarts) return false;
		}
		return true;
	}

	get stableAfterMs(): number {
		return this.config.stableAfterMs;
	}

	get shutdownTimeoutMs(): number {
		return this.config.shutdownTimeoutMs;
	}

	get workerConfigs(): WorkerConfig[] {
		return this.config.workers;
	}
}
