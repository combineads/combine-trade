import { describe, expect, mock, test } from "bun:test";
import type { KillSwitchDeps } from "../kill-switch.js";
import {
	DataIntegrityTriggerMonitor,
	type DataIntegrityState,
	type DataIntegrityTriggerResult,
	evaluateDataIntegrityTriggers,
} from "../data-integrity-trigger-monitor.js";

// --- Pure function tests ---

describe("evaluateDataIntegrityTriggers", () => {
	test("candle gap = 3 for BTC/USDT with positions → shouldActivate: true, scope: global", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map([["BTC/USDT", 3]]),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(true);
		expect(results[0].scope).toBe("global");
		expect(results[0].positionSnapshotRequired).toBe(true);
	});

	test("candle gap = 2 for BTC/USDT with positions → shouldActivate: false (threshold not met)", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map([["BTC/USDT", 2]]),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(false);
	});

	test("candle gap = 3 for BTC/USDT without positions → shouldActivate: false", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map([["BTC/USDT", 3]]),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: false,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(false);
	});

	test("vector timeout = 3 for strat-1 with positions → shouldActivate: true, scope: strategy, scopeTarget: strat-1", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map(),
			vectorSearchTimeoutsByStrategy: new Map([["strat-1", 3]]),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(true);
		expect(results[0].scope).toBe("strategy");
		expect(results[0].scopeTarget).toBe("strat-1");
		expect(results[0].positionSnapshotRequired).toBe(true);
	});

	test("vector timeout = 3 for strat-1 without positions → shouldActivate: false", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map(),
			vectorSearchTimeoutsByStrategy: new Map([["strat-1", 3]]),
			hasOpenPositions: false,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(false);
	});

	test("vector timeout = 2 for strat-1 with positions → shouldActivate: false", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map(),
			vectorSearchTimeoutsByStrategy: new Map([["strat-1", 2]]),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(false);
	});

	test("multiple strategies with timeouts → one result per qualifying strategy", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map(),
			vectorSearchTimeoutsByStrategy: new Map([
				["strat-1", 3],
				["strat-2", 5],
				["strat-3", 1],
			]),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(3);
		const activated = results.filter((r) => r.shouldActivate);
		expect(activated).toHaveLength(2);
		expect(activated.map((r) => r.scopeTarget).sort()).toEqual(["strat-1", "strat-2"]);
	});

	test("all healthy → empty results array", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map(),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results).toHaveLength(0);
	});

	test("candle gap exactly at threshold triggers", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map([["ETH/USDT", 3]]),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results[0].shouldActivate).toBe(true);
		expect(results[0].scope).toBe("global");
		expect(results[0].scopeTarget).toBeNull();
	});

	test("candle gap trigger always includes positionSnapshotRequired: true", () => {
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map([["BTC/USDT", 5]]),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results[0].positionSnapshotRequired).toBe(true);
	});
});

// --- DataIntegrityTriggerMonitor class tests ---

describe("DataIntegrityTriggerMonitor", () => {
	function makeActivateMock() {
		const calls: Array<{ scope: string; scopeTarget: string | null; trigger: string }> = [];
		const activateFn = mock(
			async (scope: string, scopeTarget: string | null, trigger: string, _deps: KillSwitchDeps) => {
				calls.push({ scope, scopeTarget, trigger });
				return {
					id: crypto.randomUUID(),
					scope: scope as "global" | "exchange" | "strategy",
					scopeTarget,
					active: true,
					triggeredBy: trigger as "manual" | "loss_limit" | "api_error" | "system",
					triggeredAt: new Date(),
					requiresAcknowledgment: false,
					acknowledgedAt: null,
				};
			},
		);
		return { activateFn, calls };
	}

	function makeDeps(): KillSwitchDeps {
		return {
			loadActiveStates: mock(async () => []),
			saveState: mock(async () => {}),
		};
	}

	test("evaluate returns results from evaluateDataIntegrityTriggers", () => {
		const { activateFn } = makeActivateMock();
		const monitor = new DataIntegrityTriggerMonitor({ activate: activateFn });
		const state: DataIntegrityState = {
			candleGapsBySymbol: new Map([["BTC/USDT", 3]]),
			vectorSearchTimeoutsByStrategy: new Map(),
			hasOpenPositions: true,
			candleGapThreshold: 3,
			vectorTimeoutThreshold: 3,
		};
		const results = monitor.evaluate(state);
		expect(results).toHaveLength(1);
		expect(results[0].shouldActivate).toBe(true);
	});

	test("applyResults calls activate once per shouldActivate result", async () => {
		const { activateFn, calls } = makeActivateMock();
		const monitor = new DataIntegrityTriggerMonitor({ activate: activateFn });
		const deps = makeDeps();

		const results: DataIntegrityTriggerResult[] = [
			{
				shouldActivate: true,
				scope: "global",
				scopeTarget: null,
				reason: "candle gap for BTC/USDT",
				positionSnapshotRequired: true,
			},
			{
				shouldActivate: true,
				scope: "strategy",
				scopeTarget: "strat-1",
				reason: "vector timeout for strat-1",
				positionSnapshotRequired: true,
			},
			{
				shouldActivate: false,
				scope: "global",
				scopeTarget: null,
				reason: "no gap",
				positionSnapshotRequired: true,
			},
		];

		await monitor.applyResults(results, deps);

		expect(calls).toHaveLength(2);
	});

	test("applyResults skips results where shouldActivate: false", async () => {
		const { activateFn, calls } = makeActivateMock();
		const monitor = new DataIntegrityTriggerMonitor({ activate: activateFn });
		const deps = makeDeps();

		const results: DataIntegrityTriggerResult[] = [
			{
				shouldActivate: false,
				scope: "global",
				scopeTarget: null,
				reason: "no gap",
				positionSnapshotRequired: true,
			},
		];

		await monitor.applyResults(results, deps);

		expect(calls).toHaveLength(0);
	});

	test("applyResults passes correct scope and scopeTarget to activate", async () => {
		const { activateFn, calls } = makeActivateMock();
		const monitor = new DataIntegrityTriggerMonitor({ activate: activateFn });
		const deps = makeDeps();

		const results: DataIntegrityTriggerResult[] = [
			{
				shouldActivate: true,
				scope: "strategy",
				scopeTarget: "strat-2",
				reason: "vector timeout for strat-2",
				positionSnapshotRequired: true,
			},
		];

		await monitor.applyResults(results, deps);

		expect(calls[0].scope).toBe("strategy");
		expect(calls[0].scopeTarget).toBe("strat-2");
		expect(calls[0].trigger).toBe("system");
	});
});
