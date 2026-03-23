/**
 * Worker process supervisor entry point.
 * Starts all workers as child processes with auto-restart on crash.
 *
 * Usage: bun run scripts/supervisor.ts
 */
import { type WorkerConfig, WorkerSupervisor } from "../packages/core/supervisor/supervisor.js";

const WORKER_CONFIGS: WorkerConfig[] = [
	{ name: "candle-collector", command: "bun run workers/candle-collector/src/index.ts" },
	{ name: "strategy-worker", command: "bun run workers/strategy-worker/src/index.ts" },
	{ name: "vector-worker", command: "bun run workers/vector-worker/src/index.ts" },
	{ name: "label-worker", command: "bun run workers/label-worker/src/index.ts" },
	{ name: "alert-worker", command: "bun run workers/alert-worker/src/index.ts" },
	{ name: "execution-worker", command: "bun run workers/execution-worker/src/index.ts" },
	{ name: "macro-collector", command: "bun run workers/macro-collector/src/index.ts" },
	{ name: "journal-worker", command: "bun run workers/journal-worker/src/index.ts" },
];

const supervisor = new WorkerSupervisor({
	workers: WORKER_CONFIGS,
	maxRestarts: 5,
	stableAfterMs: 60_000,
	shutdownTimeoutMs: 10_000,
});

const processes = new Map<string, ReturnType<typeof Bun.spawn>>();
const stableTimers = new Map<string, Timer>();
let shuttingDown = false;

function startWorker(name: string): void {
	const state = supervisor.getWorkerState(name);
	if (!state) return;
	const parts = state.command.split(" ");
	const proc = Bun.spawn(parts, {
		stdout: "inherit",
		stderr: "inherit",
		onExit: (_proc, exitCode) => {
			if (shuttingDown) return;
			supervisor.setRunning(name, false);
			processes.delete(name);

			// Clear stable timer
			const timer = stableTimers.get(name);
			if (timer) {
				clearTimeout(timer);
				stableTimers.delete(name);
			}

			if (exitCode !== 0) {
				supervisor.recordCrash(name);
				if (supervisor.canRestart(name)) {
					const backoff = supervisor.getBackoffMs(name);
					setTimeout(() => startWorker(name), backoff);
				} else {
					console.error(`[supervisor] ${name} exceeded max restarts, giving up`);
					if (supervisor.allGivenUp()) {
						console.error("[supervisor] All workers have given up. Exiting.");
						shutdown(1);
					}
				}
			}
		},
	});

	processes.set(name, proc);
	supervisor.setRunning(name, true);

	// Set stable timer — reset restart count after stable period
	const timer = setTimeout(() => {
		supervisor.recordStable(name);
		stableTimers.delete(name);
	}, supervisor.stableAfterMs);
	stableTimers.set(name, timer);
}

function shutdown(exitCode = 0): void {
	if (shuttingDown) return;
	shuttingDown = true;

	// Clear all stable timers
	for (const timer of stableTimers.values()) {
		clearTimeout(timer);
	}

	// Send SIGTERM to all workers
	for (const [_name, proc] of processes) {
		proc.kill("SIGTERM");
	}

	// Force kill after timeout
	setTimeout(() => {
		for (const [_name, proc] of processes) {
			proc.kill("SIGKILL");
		}
		process.exit(exitCode);
	}, supervisor.shutdownTimeoutMs);

	// Check if all exited
	const check = setInterval(() => {
		const running = [...processes.values()].some((p) => !p.killed);
		if (!running) {
			clearInterval(check);
			process.exit(exitCode);
		}
	}, 500);
}

// Handle signals
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
for (const config of WORKER_CONFIGS) {
	startWorker(config.name);
}
