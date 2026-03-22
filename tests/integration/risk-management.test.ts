import { describe, expect, test } from "bun:test";
import {
	type KillSwitchState,
	type LossTrackerDeps,
	type OrderValidationInput,
	type PnlRecord,
	type RiskGateDeps,
	validateOrder,
} from "@combine/core/risk/index.js";

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

const FIXTURE_BALANCE = "10000";
const FIXTURE_ENTRY_PRICE = "50000";
const FIXTURE_SL_PCT = 0.01;

const FIXTURE_LOSS_CONFIG = {
	dailyLimitPct: 3,
	weeklyLimitPct: 10,
	maxConsecutiveSl: 3,
};

const FIXTURE_SIZE_CONFIG = {
	riskPct: 0.01,
	stepSize: "0.001",
	minQty: "0.001",
	maxQty: "10",
	maxExposureUsd: "100000",
	maxLeverage: 20,
};

const FIXTURE_INPUT: OrderValidationInput = {
	strategyId: "strat-1",
	exchangeId: "binance",
	entryPrice: FIXTURE_ENTRY_PRICE,
	slPct: FIXTURE_SL_PCT,
	lossConfig: FIXTURE_LOSS_CONFIG,
	sizeConfig: FIXTURE_SIZE_CONFIG,
};

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
		balance = FIXTURE_BALANCE,
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

describe("Risk management integration", () => {
	test("A: normal order passes all checks", async () => {
		const deps = makeGateDeps();
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(true);
		expect(result.rejections).toEqual([]);
	});

	test("B: global kill switch blocks the order", async () => {
		const deps = makeGateDeps({
			killSwitchStates: [makeKillState({ scope: "global", active: true })],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.length).toBeGreaterThanOrEqual(1);
		expect(result.rejections.some((r) => r.toLowerCase().includes("kill switch"))).toBe(true);
	});

	test("C: daily loss limit blocks the order", async () => {
		const deps = makeGateDeps({
			todayRecords: [makePnlRecord("-400")],
			weekRecords: [makePnlRecord("-400")],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.some((r) => r.toLowerCase().includes("daily"))).toBe(true);
	});

	test("D: overleveraged position blocks the order", async () => {
		const input: OrderValidationInput = {
			...FIXTURE_INPUT,
			sizeConfig: { ...FIXTURE_SIZE_CONFIG, maxLeverage: 0.5 },
		};
		const deps = makeGateDeps();
		const result = await validateOrder(input, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.some((r) => r.toLowerCase().includes("leverage"))).toBe(true);
	});

	test("E: kill switch + loss limit both active", async () => {
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

	test("F: per-exchange kill switch blocks matching exchange, not others", async () => {
		const states = [
			makeKillState({
				scope: "exchange",
				scopeTarget: "binance",
				active: true,
			}),
		];

		const deps1 = makeGateDeps({ killSwitchStates: states });
		const result1 = await validateOrder(FIXTURE_INPUT, deps1);
		expect(result1.allowed).toBe(false);

		const deps2 = makeGateDeps({ killSwitchStates: states });
		const result2 = await validateOrder({ ...FIXTURE_INPUT, exchangeId: "okx" }, deps2);
		expect(result2.allowed).toBe(true);
	});

	test("G: consecutive SL limit blocks the order", async () => {
		const deps = makeGateDeps({
			todayRecords: [makePnlRecord("-10", 1), makePnlRecord("-20", 2), makePnlRecord("-30", 3)],
			weekRecords: [makePnlRecord("-60")],
		});
		const result = await validateOrder(FIXTURE_INPUT, deps);
		expect(result.allowed).toBe(false);
		expect(result.rejections.some((r) => r.toLowerCase().includes("consecutive"))).toBe(true);
	});
});
