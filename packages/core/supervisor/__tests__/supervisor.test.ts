import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
	calculateBackoff,
	shouldRestart,
	type WorkerState,
	WorkerSupervisor,
	type SupervisorConfig,
} from "../supervisor.js";

describe("calculateBackoff", () => {
	test("first retry is 1 second", () => {
		expect(calculateBackoff(0)).toBe(1000);
	});

	test("second retry is 2 seconds", () => {
		expect(calculateBackoff(1)).toBe(2000);
	});

	test("third retry is 4 seconds", () => {
		expect(calculateBackoff(2)).toBe(4000);
	});

	test("fourth retry is 8 seconds", () => {
		expect(calculateBackoff(3)).toBe(8000);
	});

	test("fifth retry is 16 seconds", () => {
		expect(calculateBackoff(4)).toBe(16000);
	});
});

describe("shouldRestart", () => {
	test("allows restart when under max retries", () => {
		const state: WorkerState = {
			name: "test-worker",
			command: "bun run worker",
			restartCount: 2,
			lastCrashTime: Date.now(),
			running: false,
		};
		expect(shouldRestart(state, 5)).toBe(true);
	});

	test("denies restart when at max retries", () => {
		const state: WorkerState = {
			name: "test-worker",
			command: "bun run worker",
			restartCount: 5,
			lastCrashTime: Date.now(),
			running: false,
		};
		expect(shouldRestart(state, 5)).toBe(false);
	});

	test("denies restart when over max retries", () => {
		const state: WorkerState = {
			name: "test-worker",
			command: "bun run worker",
			restartCount: 10,
			lastCrashTime: Date.now(),
			running: false,
		};
		expect(shouldRestart(state, 5)).toBe(false);
	});

	test("allows restart when restartCount is 0", () => {
		const state: WorkerState = {
			name: "test-worker",
			command: "bun run worker",
			restartCount: 0,
			lastCrashTime: 0,
			running: false,
		};
		expect(shouldRestart(state, 5)).toBe(true);
	});
});

describe("WorkerSupervisor", () => {
	function makeConfig(overrides: Partial<SupervisorConfig> = {}): SupervisorConfig {
		return {
			workers: [
				{ name: "worker-a", command: "bun run workers/a/src/index.ts" },
				{ name: "worker-b", command: "bun run workers/b/src/index.ts" },
			],
			maxRestarts: 5,
			stableAfterMs: 60_000,
			shutdownTimeoutMs: 10_000,
			...overrides,
		};
	}

	test("initializes worker states from config", () => {
		const supervisor = new WorkerSupervisor(makeConfig());
		const states = supervisor.getWorkerStates();
		expect(states).toHaveLength(2);
		expect(states[0]!.name).toBe("worker-a");
		expect(states[1]!.name).toBe("worker-b");
		expect(states[0]!.restartCount).toBe(0);
		expect(states[0]!.running).toBe(false);
	});

	test("recordCrash increments restart count", () => {
		const supervisor = new WorkerSupervisor(makeConfig());
		supervisor.recordCrash("worker-a");
		const state = supervisor.getWorkerState("worker-a");
		expect(state?.restartCount).toBe(1);
	});

	test("recordCrash sets lastCrashTime", () => {
		const supervisor = new WorkerSupervisor(makeConfig());
		const before = Date.now();
		supervisor.recordCrash("worker-a");
		const state = supervisor.getWorkerState("worker-a");
		expect(state?.lastCrashTime).toBeGreaterThanOrEqual(before);
	});

	test("recordStable resets restart count", () => {
		const supervisor = new WorkerSupervisor(makeConfig());
		supervisor.recordCrash("worker-a");
		supervisor.recordCrash("worker-a");
		expect(supervisor.getWorkerState("worker-a")?.restartCount).toBe(2);

		supervisor.recordStable("worker-a");
		expect(supervisor.getWorkerState("worker-a")?.restartCount).toBe(0);
	});

	test("canRestart returns false when max restarts exceeded", () => {
		const supervisor = new WorkerSupervisor(makeConfig({ maxRestarts: 3 }));
		supervisor.recordCrash("worker-a");
		supervisor.recordCrash("worker-a");
		supervisor.recordCrash("worker-a");
		expect(supervisor.canRestart("worker-a")).toBe(false);
	});

	test("canRestart returns true when under limit", () => {
		const supervisor = new WorkerSupervisor(makeConfig({ maxRestarts: 3 }));
		supervisor.recordCrash("worker-a");
		supervisor.recordCrash("worker-a");
		expect(supervisor.canRestart("worker-a")).toBe(true);
	});

	test("getBackoffMs returns correct backoff for restart count", () => {
		const supervisor = new WorkerSupervisor(makeConfig());
		expect(supervisor.getBackoffMs("worker-a")).toBe(1000);
		supervisor.recordCrash("worker-a");
		expect(supervisor.getBackoffMs("worker-a")).toBe(2000);
		supervisor.recordCrash("worker-a");
		expect(supervisor.getBackoffMs("worker-a")).toBe(4000);
	});

	test("setRunning updates state", () => {
		const supervisor = new WorkerSupervisor(makeConfig());
		supervisor.setRunning("worker-a", true);
		expect(supervisor.getWorkerState("worker-a")?.running).toBe(true);
		supervisor.setRunning("worker-a", false);
		expect(supervisor.getWorkerState("worker-a")?.running).toBe(false);
	});

	test("allGivenUp returns true when all workers exceeded max restarts", () => {
		const supervisor = new WorkerSupervisor(makeConfig({ maxRestarts: 1 }));
		supervisor.recordCrash("worker-a");
		expect(supervisor.allGivenUp()).toBe(false); // worker-b still alive
		supervisor.recordCrash("worker-b");
		expect(supervisor.allGivenUp()).toBe(true);
	});
});
