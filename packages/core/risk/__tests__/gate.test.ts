import { describe, expect, test } from "bun:test";
import { type OrderValidationInput, type RiskGateDeps, validateOrder } from "../gate.js";
import type { LossTrackerDeps } from "../loss-tracker.js";
import type { KillSwitchState, PnlRecord } from "../types.js";

function makeKillState(overrides: Partial<KillSwitchState> = {}): KillSwitchState {
	return {
		id: "ks-1",
		scope: "global",
		scopeTarget: null,
		active: true,
		triggeredBy: "manual",
		triggeredAt: new Date(),
		requiresAcknowledgment: true,
		acknowledgedAt: null,
		...overrides,
	};
}

function makePnlRecord(pnl: string, minutesAgo = 0): PnlRecord {
	return {
		id: crypto.randomUUID(),
		pnl,
		closedAt: new Date(Date.now() - minutesAgo * 60_000),
	};
}

function makeGateDeps(
	opts: {
		killSwitchStates?: KillSwitchState[];
		todayRecords?: PnlRecord[];
		weekRecords?: PnlRecord[];
		balance?: string;
		openExposure?: string;
	} = {},
): RiskGateDeps {
	const {
		killSwitchStates = [],
		todayRecords = [],
		weekRecords = [],
		balance = "10000",
		openExposure = "0",
	} = opts;

	return {
		getKillSwitchStates: async () => killSwitchStates,
		getLossTrackerDeps: (): LossTrackerDeps => ({
			loadTodayRecords: async () => todayRecords,
			loadWeekRecords: async () => weekRecords,
			saveRecord: async () => {},
		}),
		getOpenExposureUsd: async () => openExposure,
		getBalance: async () => balance,
	};
}

const FIXTURE_INPUT: OrderValidationInput = {
	strategyId: "strat-1",
	exchangeId: "binance",
	entryPrice: "50000",
	slPct: 0.01,
	lossConfig: { dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 },
	sizeConfig: {
		riskPct: 0.01,
		stepSize: "0.001",
		minQty: "0.001",
		maxQty: "10",
		maxExposureUsd: "100000",
		maxLeverage: 20,
	},
};

describe("RiskGate", () => {
	test("all conditions pass → allowed", async () => {
		const deps = makeGateDeps();
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(true);
		expect(result.rejections).toEqual([]);
	});

	test("global kill switch blocks the order", async () => {
		const deps = makeGateDeps({
			killSwitchStates: [makeKillState({ scope: "global", active: true })],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.length).toBeGreaterThanOrEqual(1);
		expect(result.rejections.some((r) => r.toLowerCase().includes("kill switch"))).toBe(true);
	});

	test("daily loss limit blocks the order", async () => {
		const deps = makeGateDeps({
			todayRecords: [makePnlRecord("-400")],
			weekRecords: [makePnlRecord("-400")],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.some((r) => r.toLowerCase().includes("daily"))).toBe(true);
	});

	test("overleveraged position blocks the order", async () => {
		const input: OrderValidationInput = {
			...FIXTURE_INPUT,
			sizeConfig: {
				...FIXTURE_INPUT.sizeConfig,
				maxLeverage: 0.5,
			},
		};
		const deps = makeGateDeps();
		const result = await validateOrder(input, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.some((r) => r.toLowerCase().includes("leverage"))).toBe(true);
	});

	test("kill switch + loss limit both active → rejections length >= 2", async () => {
		const deps = makeGateDeps({
			killSwitchStates: [makeKillState({ scope: "global", active: true })],
			todayRecords: [makePnlRecord("-400")],
			weekRecords: [makePnlRecord("-400")],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.length).toBeGreaterThanOrEqual(2);
		expect(result.rejections.some((r) => r.toLowerCase().includes("kill switch"))).toBe(true);
		expect(result.rejections.some((r) => r.toLowerCase().includes("daily"))).toBe(true);
	});

	test("per-exchange kill switch blocks matching exchange, allows others", async () => {
		const states = [
			makeKillState({
				scope: "exchange",
				scopeTarget: "binance",
				active: true,
			}),
		];

		// binance blocked
		const deps1 = makeGateDeps({ killSwitchStates: states });
		const result1 = await validateOrder(FIXTURE_INPUT, deps1);
		expect(result1.allowed).toBe(false);

		// okx allowed
		const deps2 = makeGateDeps({ killSwitchStates: states });
		const input2 = { ...FIXTURE_INPUT, exchangeId: "okx" };
		const result2 = await validateOrder(input2, deps2);
		expect(result2.allowed).toBe(true);
	});

	test("consecutive SL limit blocks the order", async () => {
		const deps = makeGateDeps({
			todayRecords: [makePnlRecord("-10", 1), makePnlRecord("-20", 2), makePnlRecord("-30", 3)],
			weekRecords: [makePnlRecord("-60")],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.some((r) => r.toLowerCase().includes("consecutive"))).toBe(true);
	});

	test("all four conditions violated → rejections has multiple entries", async () => {
		const deps = makeGateDeps({
			killSwitchStates: [makeKillState({ scope: "global", active: true })],
			todayRecords: [makePnlRecord("-400")],
			weekRecords: [makePnlRecord("-400")],
		});
		const input: OrderValidationInput = {
			...FIXTURE_INPUT,
			sizeConfig: { ...FIXTURE_INPUT.sizeConfig, maxLeverage: 0.5 },
		};
		const result = await validateOrder(input, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.length).toBeGreaterThanOrEqual(3);
	});

	test("validateOrder does not throw when a check fails", async () => {
		const deps = makeGateDeps({
			killSwitchStates: [makeKillState({ scope: "global", active: true })],
			todayRecords: [makePnlRecord("-400")],
		});
		// Should never throw — wraps all into rejections
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result).toBeDefined();
		expect(result.allowed).toBe(false);
	});
});
