import { describe, expect, test } from "bun:test";
import {
	SandboxTriggerMonitor,
	type SandboxErrorEvent,
	type SandboxTriggerState,
	evaluateSandboxEvent,
} from "../sandbox-trigger-monitor.js";
import type { KillSwitchDeps } from "../kill-switch.js";

function makeState(overrides?: Partial<SandboxTriggerState>): SandboxTriggerState {
	return {
		consecutiveCrashesByStrategy: new Map(),
		crashThreshold: 3,
		oomThresholdBytes: 134_217_728,
		timeoutThresholdMs: 500,
		...overrides,
	};
}

function makeKillSwitchDeps(): KillSwitchDeps & { activateCallCount: number } {
	let activateCallCount = 0;
	return {
		get activateCallCount() {
			return activateCallCount;
		},
		loadActiveStates: async () => [],
		saveState: async () => {
			activateCallCount++;
		},
	};
}

// ---------------------------------------------------------------------------
// evaluateSandboxEvent — pure function tests
// ---------------------------------------------------------------------------

describe("evaluateSandboxEvent — OOM", () => {
	test("OOM at exactly 128MB threshold → shouldActivate: true", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-1",
			errorCode: "ERR_FATAL_SANDBOX_OOM",
			memoryUsageBytes: 134_217_728,
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(true);
		expect(result.scope).toBe("strategy");
		expect(result.scopeTarget).toBe("strat-1");
		expect(result.errorCode).toBe("ERR_FATAL_SANDBOX_OOM");
	});

	test("OOM above 128MB → shouldActivate: true", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-1",
			errorCode: "ERR_FATAL_SANDBOX_OOM",
			memoryUsageBytes: 200_000_000,
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(true);
	});

	test("OOM at 127MB (1 byte below threshold) → shouldActivate: false", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-1",
			errorCode: "ERR_FATAL_SANDBOX_OOM",
			memoryUsageBytes: 134_217_727,
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(false);
		expect(result.scope).toBe("strategy");
		expect(result.scopeTarget).toBe("strat-1");
	});

	test("OOM with no memoryUsageBytes → shouldActivate: true (treat as over threshold)", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-1",
			errorCode: "ERR_FATAL_SANDBOX_OOM",
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(true);
	});
});

describe("evaluateSandboxEvent — timeout", () => {
	test("timeout at exactly 500ms threshold → shouldActivate: true", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-2",
			errorCode: "ERR_FATAL_SANDBOX_TIMEOUT",
			executionTimeMs: 500,
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(true);
		expect(result.scope).toBe("strategy");
		expect(result.scopeTarget).toBe("strat-2");
		expect(result.errorCode).toBe("ERR_FATAL_SANDBOX_TIMEOUT");
	});

	test("timeout at 499ms (1ms below threshold) → shouldActivate: false", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-2",
			errorCode: "ERR_FATAL_SANDBOX_TIMEOUT",
			executionTimeMs: 499,
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(false);
	});

	test("timeout with no executionTimeMs → shouldActivate: true (treat as over threshold)", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-2",
			errorCode: "ERR_FATAL_SANDBOX_TIMEOUT",
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(true);
	});
});

describe("evaluateSandboxEvent — crash (reads consecutive count from state)", () => {
	test("1st crash (count=1 in state) → shouldActivate: false", () => {
		const state = makeState({
			consecutiveCrashesByStrategy: new Map([["strat-3", 1]]),
		});
		const event: SandboxErrorEvent = {
			strategyId: "strat-3",
			errorCode: "ERR_FATAL_SANDBOX_CRASH",
		};
		const result = evaluateSandboxEvent(event, state);
		expect(result.shouldActivate).toBe(false);
		expect(result.errorCode).toBe("ERR_FATAL_SANDBOX_CRASH");
	});

	test("2nd crash (count=2 in state) → shouldActivate: false", () => {
		const state = makeState({
			consecutiveCrashesByStrategy: new Map([["strat-3", 2]]),
		});
		const event: SandboxErrorEvent = {
			strategyId: "strat-3",
			errorCode: "ERR_FATAL_SANDBOX_CRASH",
		};
		const result = evaluateSandboxEvent(event, state);
		expect(result.shouldActivate).toBe(false);
	});

	test("3rd crash (count=3 in state, at threshold) → shouldActivate: true", () => {
		const state = makeState({
			consecutiveCrashesByStrategy: new Map([["strat-3", 3]]),
		});
		const event: SandboxErrorEvent = {
			strategyId: "strat-3",
			errorCode: "ERR_FATAL_SANDBOX_CRASH",
		};
		const result = evaluateSandboxEvent(event, state);
		expect(result.shouldActivate).toBe(true);
		expect(result.scope).toBe("strategy");
		expect(result.scopeTarget).toBe("strat-3");
	});

	test("crash with no prior count (count=0) → shouldActivate: false", () => {
		const event: SandboxErrorEvent = {
			strategyId: "strat-3",
			errorCode: "ERR_FATAL_SANDBOX_CRASH",
		};
		const result = evaluateSandboxEvent(event, makeState());
		expect(result.shouldActivate).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// SandboxTriggerMonitor — stateful class tests
// ---------------------------------------------------------------------------

describe("SandboxTriggerMonitor — crash counter management", () => {
	test("1st crash → counter=1, shouldActivate: false, activate not called", async () => {
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({ activate: async (scope, target, trigger, d) => { await d.saveState({} as never); return {} as never; }, state: makeState() });
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-a", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		expect(result.shouldActivate).toBe(false);
		expect(deps.activateCallCount).toBe(0);
	});

	test("2nd crash → counter=2, shouldActivate: false, activate not called", async () => {
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({ activate: async (scope, target, trigger, d) => { await d.saveState({} as never); return {} as never; }, state: makeState() });
		await monitor.onSandboxError(
			{ strategyId: "strat-a", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-a", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		expect(result.shouldActivate).toBe(false);
		expect(deps.activateCallCount).toBe(0);
	});

	test("3rd crash → counter=3, shouldActivate: true, activate called once", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		await monitor.onSandboxError({ strategyId: "strat-b", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		await monitor.onSandboxError({ strategyId: "strat-b", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-b", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		expect(result.shouldActivate).toBe(true);
		expect(activateCalled).toBe(1);
	});

	test("resetCrashCounter resets to 0 — 4th crash after reset starts count from 1", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		// 3 crashes → triggers
		await monitor.onSandboxError({ strategyId: "strat-c", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		await monitor.onSandboxError({ strategyId: "strat-c", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		await monitor.onSandboxError({ strategyId: "strat-c", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		expect(activateCalled).toBe(1);

		// reset
		monitor.resetCrashCounter("strat-c");

		// 4th crash (first after reset) → count=1, no activation
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-c", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		expect(result.shouldActivate).toBe(false);
		expect(activateCalled).toBe(1); // still 1, not called again
	});

	test("two strategies crash independently — each has its own counter", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		// strat-x: 2 crashes
		await monitor.onSandboxError({ strategyId: "strat-x", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		await monitor.onSandboxError({ strategyId: "strat-x", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);
		// strat-y: 1 crash
		await monitor.onSandboxError({ strategyId: "strat-y", errorCode: "ERR_FATAL_SANDBOX_CRASH" }, deps);

		expect(activateCalled).toBe(0); // neither has reached threshold

		// strat-x: 3rd crash → triggers
		const resultX = await monitor.onSandboxError(
			{ strategyId: "strat-x", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		expect(resultX.shouldActivate).toBe(true);
		expect(resultX.scopeTarget).toBe("strat-x");
		expect(activateCalled).toBe(1);

		// strat-y is still at count 1 (not triggered)
		const resultY = await monitor.onSandboxError(
			{ strategyId: "strat-y", errorCode: "ERR_FATAL_SANDBOX_CRASH" },
			deps,
		);
		expect(resultY.shouldActivate).toBe(false);
		expect(activateCalled).toBe(1); // still only 1 activation
	});
});

describe("SandboxTriggerMonitor — OOM and timeout via onSandboxError", () => {
	test("OOM above threshold → activate called, shouldActivate: true", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-d", errorCode: "ERR_FATAL_SANDBOX_OOM", memoryUsageBytes: 134_217_728 },
			deps,
		);
		expect(result.shouldActivate).toBe(true);
		expect(activateCalled).toBe(1);
	});

	test("OOM below threshold → activate not called, shouldActivate: false", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-d", errorCode: "ERR_FATAL_SANDBOX_OOM", memoryUsageBytes: 134_217_727 },
			deps,
		);
		expect(result.shouldActivate).toBe(false);
		expect(activateCalled).toBe(0);
	});

	test("timeout above threshold → activate called", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-e", errorCode: "ERR_FATAL_SANDBOX_TIMEOUT", executionTimeMs: 500 },
			deps,
		);
		expect(result.shouldActivate).toBe(true);
		expect(activateCalled).toBe(1);
	});

	test("timeout below threshold → activate not called", async () => {
		let activateCalled = 0;
		const deps = makeKillSwitchDeps();
		const monitor = new SandboxTriggerMonitor({
			activate: async (scope, target, trigger, d) => {
				activateCalled++;
				await d.saveState({} as never);
				return {} as never;
			},
			state: makeState(),
		});
		const result = await monitor.onSandboxError(
			{ strategyId: "strat-e", errorCode: "ERR_FATAL_SANDBOX_TIMEOUT", executionTimeMs: 499 },
			deps,
		);
		expect(result.shouldActivate).toBe(false);
		expect(activateCalled).toBe(0);
	});
});
