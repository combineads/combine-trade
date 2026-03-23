import { describe, expect, test } from "bun:test";
import type { LabelResult } from "@combine/core/label";
import {
	type LabeledEvent,
	computeMaxConsecutiveLoss,
	computeMaxDrawdown,
	computeMonthlyBreakdown,
	computeReport,
} from "../report.js";
import type { BacktestEvent } from "../types.js";

function makeEvent(overrides: Partial<BacktestEvent> = {}): BacktestEvent {
	return {
		eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
		strategyId: "strat-1",
		version: 1,
		symbol: "BTCUSDT",
		exchange: "binance",
		timeframe: "1m",
		entryPrice: "50000",
		direction: "long",
		openTime: new Date("2024-01-15T10:00:00Z"),
		candleIndex: 0,
		...overrides,
	};
}

function makeLabel(overrides: Partial<LabelResult> = {}): LabelResult {
	return {
		resultType: "WIN",
		pnlPct: 2,
		mfePct: 2.5,
		maePct: 0.3,
		holdBars: 3,
		exitPrice: "51000",
		slHitFirst: false,
		...overrides,
	};
}

function makeLabeledEvent(
	eventOverrides: Partial<BacktestEvent> = {},
	labelOverrides: Partial<LabelResult> = {},
): LabeledEvent {
	return { event: makeEvent(eventOverrides), label: makeLabel(labelOverrides) };
}

describe("computeMaxDrawdown", () => {
	test("peak-to-trough drawdown on equity curve", () => {
		// equity: [1, 2, 0, 3] → peak at 2, trough at 0 → drawdown = 2
		const dd = computeMaxDrawdown([1, 2, 0, 3]);
		expect(dd).toBe(2);
	});

	test("monotonically increasing → drawdown is 0", () => {
		expect(computeMaxDrawdown([1, 2, 3, 4])).toBe(0);
	});

	test("empty curve → drawdown is 0", () => {
		expect(computeMaxDrawdown([])).toBe(0);
	});
});

describe("computeMaxConsecutiveLoss", () => {
	test("WIN, LOSS, LOSS, LOSS, WIN → 3", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 2 }),
			makeLabeledEvent({}, { resultType: "LOSS", pnlPct: -1 }),
			makeLabeledEvent({}, { resultType: "LOSS", pnlPct: -1 }),
			makeLabeledEvent({}, { resultType: "LOSS", pnlPct: -1 }),
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 2 }),
		];
		expect(computeMaxConsecutiveLoss(events)).toBe(3);
	});

	test("all wins → 0", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent({}, { resultType: "WIN" }),
			makeLabeledEvent({}, { resultType: "WIN" }),
		];
		expect(computeMaxConsecutiveLoss(events)).toBe(0);
	});

	test("TIME_EXIT with negative pnl counts as loss", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent({}, { resultType: "TIME_EXIT", pnlPct: -0.5 }),
			makeLabeledEvent({}, { resultType: "TIME_EXIT", pnlPct: -0.3 }),
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 2 }),
		];
		expect(computeMaxConsecutiveLoss(events)).toBe(2);
	});
});

describe("computeMonthlyBreakdown", () => {
	test("events across 2 months → 2 entries", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent(
				{ openTime: new Date("2024-01-15T10:00:00Z") },
				{ resultType: "WIN", pnlPct: 2 },
			),
			makeLabeledEvent(
				{ openTime: new Date("2024-01-20T10:00:00Z") },
				{ resultType: "LOSS", pnlPct: -1 },
			),
			makeLabeledEvent(
				{ openTime: new Date("2024-02-05T10:00:00Z") },
				{ resultType: "WIN", pnlPct: 3 },
			),
		];

		const breakdown = computeMonthlyBreakdown(events);
		expect(breakdown).toHaveLength(2);
		expect(breakdown[0]!.yearMonth).toBe("2024-01");
		expect(breakdown[0]!.winCount).toBe(1);
		expect(breakdown[0]!.lossCount).toBe(1);
		expect(breakdown[0]!.winrate).toBeCloseTo(0.5);
		expect(breakdown[1]!.yearMonth).toBe("2024-02");
		expect(breakdown[1]!.winCount).toBe(1);
		expect(breakdown[1]!.lossCount).toBe(0);
	});
});

describe("computeReport", () => {
	test("4 WIN + 1 LOSS → correct stats", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 2 }),
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 3 }),
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 1.5 }),
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 2.5 }),
			makeLabeledEvent({}, { resultType: "LOSS", pnlPct: -1 }),
		];

		const report = computeReport(events);
		expect(report.totalEvents).toBe(5);
		expect(report.winCount).toBe(4);
		expect(report.lossCount).toBe(1);
		expect(report.winrate).toBeCloseTo(0.8);
		// avgWin = (2+3+1.5+2.5)/4 = 2.25
		expect(report.avgWin).toBeCloseTo(2.25);
		// avgLoss = 1
		expect(report.avgLoss).toBeCloseTo(1);
		// expectancy = 0.8 * 2.25 - 0.2 * 1 = 1.8 - 0.2 = 1.6
		expect(report.expectancy).toBeCloseTo(1.6);
	});

	test("cold start: 30 events → coldStartEvents=30, coldStartEndTime set", () => {
		const events: LabeledEvent[] = Array.from({ length: 35 }, (_, i) =>
			makeLabeledEvent(
				{ openTime: new Date(`2024-01-15T10:${String(i).padStart(2, "0")}:00Z`) },
				{ resultType: "WIN", pnlPct: 1 },
			),
		);

		const report = computeReport(events);
		expect(report.coldStartEvents).toBe(30);
		expect(report.coldStartEndTime).toEqual(new Date("2024-01-15T10:29:00Z"));
	});

	test("fewer than 30 events → coldStartEndTime is null", () => {
		const events: LabeledEvent[] = Array.from({ length: 10 }, () =>
			makeLabeledEvent({}, { resultType: "WIN", pnlPct: 1 }),
		);

		const report = computeReport(events);
		expect(report.coldStartEvents).toBe(10);
		expect(report.coldStartEndTime).toBeNull();
	});

	test("simultaneousTpSlRatio: 2 of 5 have slHitFirst=true → 0.4", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent({}, { slHitFirst: true, resultType: "LOSS", pnlPct: -1 }),
			makeLabeledEvent({}, { slHitFirst: false, resultType: "WIN", pnlPct: 2 }),
			makeLabeledEvent({}, { slHitFirst: true, resultType: "LOSS", pnlPct: -1 }),
			makeLabeledEvent({}, { slHitFirst: false, resultType: "WIN", pnlPct: 2 }),
			makeLabeledEvent({}, { slHitFirst: false, resultType: "WIN", pnlPct: 2 }),
		];

		const report = computeReport(events);
		expect(report.simultaneousTpSlRatio).toBeCloseTo(0.4);
	});

	test("slippage stats: LONG entry 100, next open 100.5 → 0.5%", () => {
		const events: LabeledEvent[] = [
			makeLabeledEvent({ entryPrice: "100", direction: "long" }, { resultType: "WIN", pnlPct: 2 }),
		];
		const nextOpenPrices = new Map([[events[0]!.event.eventId, "100.5"]]);

		const report = computeReport(events, nextOpenPrices);
		expect(report.slippageStats).not.toBeNull();
		expect(report.slippageStats!.avgSlippagePct).toBeCloseTo(0.5);
	});

	test("no nextOpenPrices → slippageStats is null", () => {
		const events: LabeledEvent[] = [makeLabeledEvent({}, { resultType: "WIN", pnlPct: 2 })];

		const report = computeReport(events);
		expect(report.slippageStats).toBeNull();
	});

	test("empty events → zeroed report, no crash", () => {
		const report = computeReport([]);
		expect(report.totalEvents).toBe(0);
		expect(report.winrate).toBe(0);
		expect(report.expectancy).toBe(0);
		expect(report.maxConsecutiveLoss).toBe(0);
		expect(report.maxDrawdownPct).toBe(0);
		expect(report.monthlyBreakdown).toHaveLength(0);
		expect(report.slippageStats).toBeNull();
		expect(report.coldStartEndTime).toBeNull();
	});
});
