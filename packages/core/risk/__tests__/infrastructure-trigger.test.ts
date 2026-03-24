import { describe, expect, mock, test } from "bun:test";
import {
	InfrastructureTriggerMonitor,
	type InfrastructureHealthState,
	evaluateInfrastructureTriggers,
} from "../infrastructure-trigger-monitor.js";
import type { KillSwitchDeps } from "../kill-switch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
	overrides: Partial<InfrastructureHealthState> = {},
): InfrastructureHealthState {
	return {
		exchangeApiUnreachableSince: null,
		dbConnectionLostSince: null,
		executionWorkerUnresponsiveSince: null,
		strategyWorkerUnresponsiveSince: new Map(),
		hasOpenPositions: false,
		gracePeriodMs: 60_000,
		...overrides,
	};
}

function msAgo(ms: number): Date {
	return new Date(Date.now() - ms);
}

// ---------------------------------------------------------------------------
// evaluateInfrastructureTriggers — pure function tests
// ---------------------------------------------------------------------------

describe("evaluateInfrastructureTriggers (infra-trigger)", () => {
	describe("Exchange API unreachability", () => {
		test("unreachable for 31s with positions → shouldActivate: true, blockEntryOnly: false, scope: exchange", () => {
			const unreachableSince = new Date(1_000_000 - 31_000);
			const now = new Date(1_000_000);
			const state = makeState({
				exchangeApiUnreachableSince: unreachableSince,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("exchange API"));
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(true);
			expect(trigger!.blockEntryOnly).toBe(false);
			expect(trigger!.scope).toBe("exchange");
		});

		test("unreachable for 31s without positions → shouldActivate: false, blockEntryOnly: true", () => {
			const unreachableSince = new Date(1_000_000 - 31_000);
			const now = new Date(1_000_000);
			const state = makeState({
				exchangeApiUnreachableSince: unreachableSince,
				hasOpenPositions: false,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("exchange API"));
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(false);
			expect(trigger!.blockEntryOnly).toBe(true);
		});

		test("unreachable for 29s → shouldActivate: false (threshold not met)", () => {
			const unreachableSince = new Date(1_000_000 - 29_000);
			const now = new Date(1_000_000);
			const state = makeState({
				exchangeApiUnreachableSince: unreachableSince,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("exchange API"));
			expect(trigger).toBeUndefined();
		});

		test("null unreachableSince → no trigger", () => {
			const now = new Date(1_000_000);
			const state = makeState({ exchangeApiUnreachableSince: null, hasOpenPositions: true });

			const results = evaluateInfrastructureTriggers(state, now);
			expect(results.every((r) => !r.reason.includes("exchange API"))).toBe(true);
		});
	});

	describe("DB connection loss", () => {
		test("DB lost for 16s with positions → shouldActivate: true, scope: global", () => {
			const lostSince = new Date(1_000_000 - 16_000);
			const now = new Date(1_000_000);
			const state = makeState({
				dbConnectionLostSince: lostSince,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("DB"));
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(true);
			expect(trigger!.scope).toBe("global");
			expect(trigger!.blockEntryOnly).toBe(false);
		});

		test("DB lost for 16s without positions → shouldActivate: false, blockEntryOnly: true", () => {
			const lostSince = new Date(1_000_000 - 16_000);
			const now = new Date(1_000_000);
			const state = makeState({
				dbConnectionLostSince: lostSince,
				hasOpenPositions: false,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("DB"));
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(false);
			expect(trigger!.blockEntryOnly).toBe(true);
		});

		test("DB lost for 14s → no trigger (threshold not met)", () => {
			const lostSince = new Date(1_000_000 - 14_000);
			const now = new Date(1_000_000);
			const state = makeState({
				dbConnectionLostSince: lostSince,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			expect(results.every((r) => !r.reason.includes("DB"))).toBe(true);
		});

		test("null dbConnectionLostSince → no trigger", () => {
			const now = new Date(1_000_000);
			const state = makeState({ dbConnectionLostSince: null, hasOpenPositions: true });

			const results = evaluateInfrastructureTriggers(state, now);
			expect(results.every((r) => !r.reason.includes("DB"))).toBe(true);
		});
	});

	describe("Execution worker unresponsiveness", () => {
		test("execution worker unresponsive 61s with positions → shouldActivate: true, scope: global", () => {
			const since = new Date(1_000_000 - 61_000);
			const now = new Date(1_000_000);
			const state = makeState({
				executionWorkerUnresponsiveSince: since,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("execution worker"));
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(true);
			expect(trigger!.scope).toBe("global");
		});

		test("execution worker unresponsive 61s without positions → shouldActivate: false, blockEntryOnly: true", () => {
			const since = new Date(1_000_000 - 61_000);
			const now = new Date(1_000_000);
			const state = makeState({
				executionWorkerUnresponsiveSince: since,
				hasOpenPositions: false,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.reason.includes("execution worker"));
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(false);
			expect(trigger!.blockEntryOnly).toBe(true);
		});

		test("execution worker unresponsive 59s → no trigger", () => {
			const since = new Date(1_000_000 - 59_000);
			const now = new Date(1_000_000);
			const state = makeState({
				executionWorkerUnresponsiveSince: since,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			expect(results.every((r) => !r.reason.includes("execution worker"))).toBe(true);
		});
	});

	describe("Strategy worker unresponsiveness", () => {
		test("strategy worker unresponsive 61s → shouldActivate: true, scope: strategy, scopeTarget: strat-1", () => {
			const since = new Date(1_000_000 - 61_000);
			const now = new Date(1_000_000);
			const strategyWorkerUnresponsiveSince = new Map([["strat-1", since]]);
			const state = makeState({
				strategyWorkerUnresponsiveSince,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.scopeTarget === "strat-1");
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(true);
			expect(trigger!.scope).toBe("strategy");
			expect(trigger!.scopeTarget).toBe("strat-1");
		});

		test("strategy worker unresponsive 61s without positions → shouldActivate: false, blockEntryOnly: true", () => {
			const since = new Date(1_000_000 - 61_000);
			const now = new Date(1_000_000);
			const strategyWorkerUnresponsiveSince = new Map([["strat-1", since]]);
			const state = makeState({
				strategyWorkerUnresponsiveSince,
				hasOpenPositions: false,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.scopeTarget === "strat-1");
			expect(trigger).toBeDefined();
			expect(trigger!.shouldActivate).toBe(false);
			expect(trigger!.blockEntryOnly).toBe(true);
		});

		test("strategy worker unresponsive 59s → no trigger", () => {
			const since = new Date(1_000_000 - 59_000);
			const now = new Date(1_000_000);
			const strategyWorkerUnresponsiveSince = new Map([["strat-1", since]]);
			const state = makeState({
				strategyWorkerUnresponsiveSince,
				hasOpenPositions: true,
			});

			const results = evaluateInfrastructureTriggers(state, now);
			expect(results.every((r) => r.scopeTarget !== "strat-1")).toBe(true);
		});
	});

	describe("All healthy", () => {
		test("no issues → empty results array", () => {
			const now = new Date(1_000_000);
			const state = makeState();
			const results = evaluateInfrastructureTriggers(state, now);
			expect(results).toHaveLength(0);
		});
	});

	describe("scopeTarget", () => {
		test("exchange scope has null scopeTarget (single exchange field)", () => {
			const unreachableSince = new Date(1_000_000 - 31_000);
			const now = new Date(1_000_000);
			const state = makeState({
				exchangeApiUnreachableSince: unreachableSince,
				hasOpenPositions: true,
			});
			const results = evaluateInfrastructureTriggers(state, now);
			const trigger = results.find((r) => r.scope === "exchange");
			expect(trigger).toBeDefined();
			expect(trigger!.scopeTarget).toBeNull();
		});
	});
});

// ---------------------------------------------------------------------------
// InfrastructureTriggerMonitor class tests
// ---------------------------------------------------------------------------

describe("InfrastructureTriggerMonitor (infra-trigger)", () => {
	function makeDeps(): KillSwitchDeps {
		return {
			loadActiveStates: mock(() => Promise.resolve([])),
			saveState: mock(() => Promise.resolve()),
		};
	}

	test("evaluate delegates to evaluateInfrastructureTriggers", () => {
		const monitor = new InfrastructureTriggerMonitor();
		const now = new Date(1_000_000);
		const state = makeState();
		const results = monitor.evaluate(state, now);
		expect(Array.isArray(results)).toBe(true);
	});

	test("applyResults calls activate() once per shouldActivate result", async () => {
		const deps = makeDeps();
		const monitor = new InfrastructureTriggerMonitor();

		const results = [
			{
				shouldActivate: true,
				blockEntryOnly: false,
				scope: "global" as const,
				scopeTarget: null,
				reason: "DB unreachable for 20s",
			},
			{
				shouldActivate: true,
				blockEntryOnly: false,
				scope: "exchange" as const,
				scopeTarget: null,
				reason: "exchange API unreachable for 35s",
			},
		];

		await monitor.applyResults(results, deps);
		expect((deps.saveState as ReturnType<typeof mock>).mock.calls.length).toBe(2);
	});

	test("applyResults skips results where shouldActivate: false", async () => {
		const deps = makeDeps();
		const monitor = new InfrastructureTriggerMonitor();

		const results = [
			{
				shouldActivate: false,
				blockEntryOnly: true,
				scope: "global" as const,
				scopeTarget: null,
				reason: "DB unreachable but no positions",
			},
			{
				shouldActivate: false,
				blockEntryOnly: true,
				scope: "exchange" as const,
				scopeTarget: null,
				reason: "exchange API unreachable but no positions",
			},
		];

		await monitor.applyResults(results, deps);
		expect((deps.saveState as ReturnType<typeof mock>).mock.calls.length).toBe(0);
	});

	test("applyResults handles mixed shouldActivate/skip correctly", async () => {
		const deps = makeDeps();
		const monitor = new InfrastructureTriggerMonitor();

		const results = [
			{
				shouldActivate: true,
				blockEntryOnly: false,
				scope: "global" as const,
				scopeTarget: null,
				reason: "DB unreachable with positions",
			},
			{
				shouldActivate: false,
				blockEntryOnly: true,
				scope: "exchange" as const,
				scopeTarget: null,
				reason: "exchange API unreachable but no positions",
			},
		];

		await monitor.applyResults(results, deps);
		expect((deps.saveState as ReturnType<typeof mock>).mock.calls.length).toBe(1);
	});
});
