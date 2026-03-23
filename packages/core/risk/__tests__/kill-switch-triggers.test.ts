import { describe, expect, test } from "bun:test";
import {
	type DataIntegrityState,
	type FinancialState,
	type InfrastructureState,
	type SandboxState,
	evaluateDataIntegrityTriggers,
	evaluateFinancialTriggers,
	evaluateInfrastructureTriggers,
	evaluateSandboxTriggers,
} from "../kill-switch-triggers.js";

describe("Financial triggers (instant, no grace)", () => {
	test("daily loss limit breach triggers global kill", () => {
		const state: FinancialState = {
			dailyLossBreached: true,
			balanceDeviationPct: 0,
			hasUntrackedPositions: false,
			consecutiveRejections: {},
		};
		const results = evaluateFinancialTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.reason.includes("daily loss"))).toBe(true);
	});

	test("balance deviation >5% triggers global kill", () => {
		const state: FinancialState = {
			dailyLossBreached: false,
			balanceDeviationPct: 6,
			hasUntrackedPositions: false,
			consecutiveRejections: {},
		};
		const results = evaluateFinancialTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.reason.includes("balance deviation"))).toBe(
			true,
		);
	});

	test("untracked positions trigger global kill", () => {
		const state: FinancialState = {
			dailyLossBreached: false,
			balanceDeviationPct: 0,
			hasUntrackedPositions: true,
			consecutiveRejections: {},
		};
		const results = evaluateFinancialTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.reason.includes("untracked"))).toBe(true);
	});

	test("3 consecutive order rejections triggers per-strategy kill", () => {
		const state: FinancialState = {
			dailyLossBreached: false,
			balanceDeviationPct: 0,
			hasUntrackedPositions: false,
			consecutiveRejections: { "strat-1": 3 },
		};
		const results = evaluateFinancialTriggers(state);
		const trigger = results.find((r) => r.shouldActivate && r.reason.includes("rejection"));
		expect(trigger).toBeDefined();
		expect(trigger!.scope).toBe("strategy");
		expect(trigger!.scopeTarget).toBe("strat-1");
	});

	test("2 rejections does not trigger", () => {
		const state: FinancialState = {
			dailyLossBreached: false,
			balanceDeviationPct: 0,
			hasUntrackedPositions: false,
			consecutiveRejections: { "strat-1": 2 },
		};
		const results = evaluateFinancialTriggers(state);
		expect(results.every((r) => !r.shouldActivate)).toBe(true);
	});

	test("no triggers when all normal", () => {
		const state: FinancialState = {
			dailyLossBreached: false,
			balanceDeviationPct: 2,
			hasUntrackedPositions: false,
			consecutiveRejections: {},
		};
		const results = evaluateFinancialTriggers(state);
		expect(results.every((r) => !r.shouldActivate)).toBe(true);
	});
});

describe("Infrastructure triggers (grace period, position check)", () => {
	test("exchange unreachable >30s with positions triggers", () => {
		const state: InfrastructureState = {
			exchangeUnreachableSecs: { binance: 35 },
			dbUnreachableSecs: 0,
			workerUnresponsiveSecs: {},
			hasOpenPositions: true,
		};
		const results = evaluateInfrastructureTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.reason.includes("exchange"))).toBe(true);
	});

	test("exchange unreachable without positions does not kill", () => {
		const state: InfrastructureState = {
			exchangeUnreachableSecs: { binance: 60 },
			dbUnreachableSecs: 0,
			workerUnresponsiveSecs: {},
			hasOpenPositions: false,
		};
		const results = evaluateInfrastructureTriggers(state);
		expect(results.every((r) => !r.shouldActivate)).toBe(true);
	});

	test("DB unreachable >15s with positions triggers global", () => {
		const state: InfrastructureState = {
			exchangeUnreachableSecs: {},
			dbUnreachableSecs: 20,
			workerUnresponsiveSecs: {},
			hasOpenPositions: true,
		};
		const results = evaluateInfrastructureTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.scope === "global")).toBe(true);
	});

	test("worker unresponsive >60s triggers", () => {
		const state: InfrastructureState = {
			exchangeUnreachableSecs: {},
			dbUnreachableSecs: 0,
			workerUnresponsiveSecs: { "execution-worker": 65 },
			hasOpenPositions: true,
		};
		const results = evaluateInfrastructureTriggers(state);
		expect(results.some((r) => r.shouldActivate)).toBe(true);
	});
});

describe("Sandbox triggers (instant, per-strategy)", () => {
	test("OOM triggers per-strategy kill", () => {
		const state: SandboxState = {
			oomStrategies: ["strat-1"],
			timeoutStrategies: [],
			crashCounts: {},
		};
		const results = evaluateSandboxTriggers(state);
		const trigger = results.find((r) => r.shouldActivate);
		expect(trigger).toBeDefined();
		expect(trigger!.scope).toBe("strategy");
		expect(trigger!.scopeTarget).toBe("strat-1");
	});

	test("timeout triggers per-strategy kill", () => {
		const state: SandboxState = {
			oomStrategies: [],
			timeoutStrategies: ["strat-2"],
			crashCounts: {},
		};
		const results = evaluateSandboxTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.scopeTarget === "strat-2")).toBe(true);
	});

	test("3 consecutive crashes triggers per-strategy kill", () => {
		const state: SandboxState = {
			oomStrategies: [],
			timeoutStrategies: [],
			crashCounts: { "strat-3": 3 },
		};
		const results = evaluateSandboxTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.scopeTarget === "strat-3")).toBe(true);
	});

	test("2 crashes does not trigger", () => {
		const state: SandboxState = {
			oomStrategies: [],
			timeoutStrategies: [],
			crashCounts: { "strat-3": 2 },
		};
		const results = evaluateSandboxTriggers(state);
		expect(results.every((r) => !r.shouldActivate)).toBe(true);
	});
});

describe("Data integrity triggers (instant, position check)", () => {
	test("candle gap >=3 triggers when positions exist", () => {
		const state: DataIntegrityState = {
			candleGapCounts: { BTCUSDT: 3 },
			vectorSearchTimeouts: {},
			hasOpenPositions: true,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results.some((r) => r.shouldActivate)).toBe(true);
	});

	test("candle gap without positions does not kill", () => {
		const state: DataIntegrityState = {
			candleGapCounts: { BTCUSDT: 5 },
			vectorSearchTimeouts: {},
			hasOpenPositions: false,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results.every((r) => !r.shouldActivate)).toBe(true);
	});

	test("vector search timeout 3x triggers per-strategy", () => {
		const state: DataIntegrityState = {
			candleGapCounts: {},
			vectorSearchTimeouts: { "strat-1": 3 },
			hasOpenPositions: true,
		};
		const results = evaluateDataIntegrityTriggers(state);
		expect(results.some((r) => r.shouldActivate && r.scopeTarget === "strat-1")).toBe(true);
	});
});
