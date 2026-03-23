import { describe, expect, test } from "bun:test";
import {
	type BacktestCheckpoint,
	type BacktestEngineDeps,
	type BacktestEvent,
	type LabeledEvent,
	type ResultConfig,
	computeReport,
	labelBacktestEvent,
	resumeFromCheckpoint,
	runBacktest,
	toForwardCandles,
} from "@combine/backtest";
import type { Candle } from "@combine/candle";

const BASE_TIME = 1704067200000; // 2024-01-01T00:00:00Z
const MINUTE = 60_000;

/**
 * Generate 50 deterministic candles for BTCUSDT 1m.
 * Price pattern creates predictable TP/SL outcomes:
 * - Rising candles after events at 0,10,20,30,40 → WIN
 * - Falling candles after events at 5,15,25,35,45 → LOSS
 */
function makeFixtureCandles(): Candle[] {
	const candles: Candle[] = [];
	const basePrice = 50000;

	for (let i = 0; i < 50; i++) {
		// Every 10 candles: rising phase (bars 0-4) then falling phase (bars 5-9)
		const phase = i % 10;
		let open: number;
		let high: number;
		let low: number;
		let close: number;

		if (phase < 5) {
			// Rising phase: gradually increase price
			open = basePrice + phase * 100;
			high = open + 200;
			low = open - 50;
			close = open + 100;
		} else {
			// Falling phase: gradually decrease price
			open = basePrice + (10 - phase) * 100;
			high = open + 50;
			low = open - 200;
			close = open - 100;
		}

		candles.push({
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date(BASE_TIME + i * MINUTE),
			open: open.toString(),
			high: high.toString(),
			low: low.toString(),
			close: close.toString(),
			volume: "100",
			isClosed: true,
		});
	}
	return candles;
}

function makeDeps(
	overrides: Partial<BacktestEngineDeps> = {},
): BacktestEngineDeps & { checkpoints: BacktestCheckpoint[] } {
	let callIndex = 0;
	const checkpoints: BacktestCheckpoint[] = [];

	return {
		checkpoints,
		strategyId: "strat-1",
		version: 1,
		executeStrategy:
			overrides.executeStrategy ??
			(async (candle) => {
				const idx = callIndex++;
				// Emit event on every 5th candle (indices 0, 5, 10, 15, 20, 25, 30, 35, 40, 45)
				if (idx % 5 === 0) {
					return { entryPrice: candle.close, direction: "long" };
				}
				return null;
			}),
		saveCheckpoint:
			overrides.saveCheckpoint ??
			(async (cp) => {
				checkpoints.push(structuredClone(cp));
			}),
		loadCheckpoint: overrides.loadCheckpoint ?? (async () => null),
	};
}

const RESULT_CONFIG: ResultConfig = { tpPct: 1.0, slPct: 0.5, maxHoldBars: 4 };

function labelAllEvents(events: BacktestEvent[], candles: Candle[]): LabeledEvent[] {
	return events.map((event) => ({
		event,
		label: labelBacktestEvent(event, candles, RESULT_CONFIG),
	}));
}

describe("Backtest pipeline integration", () => {
	test("A — full pipeline produces correct event count", async () => {
		const candles = makeFixtureCandles();
		const deps = makeDeps();

		const result = await runBacktest(candles, deps);

		expect(result.totalCandles).toBe(50);
		expect(result.events).toHaveLength(10);
	});

	test("B — labels computed for all events", async () => {
		const candles = makeFixtureCandles();
		const deps = makeDeps();

		const result = await runBacktest(candles, deps);
		const labeled = labelAllEvents(result.events, candles);

		expect(labeled).toHaveLength(10);
		for (const { label } of labeled) {
			expect(["WIN", "LOSS", "TIME_EXIT"]).toContain(label.resultType);
		}
	});

	test("C — statistics report correctness", async () => {
		const candles = makeFixtureCandles();
		const deps = makeDeps();

		const result = await runBacktest(candles, deps);
		const labeled = labelAllEvents(result.events, candles);
		const report = computeReport(labeled);

		expect(report.totalEvents).toBe(10);
		// Verify mathematical consistency
		expect(report.winCount + report.lossCount).toBe(report.totalEvents);
		expect(report.winrate).toBeCloseTo(report.winCount / report.totalEvents, 5);
		// expectancy = winrate * avgWin - (1 - winrate) * avgLoss
		const expectedExpectancy =
			report.winrate * report.avgWin - (1 - report.winrate) * report.avgLoss;
		expect(report.expectancy).toBeCloseTo(expectedExpectancy, 5);
		// Cold start: fewer than 30 events
		expect(report.coldStartEvents).toBe(10);
		expect(report.coldStartEndTime).toBeNull();
	});

	test("D — checkpoint save/resume produces consistent results", async () => {
		const candles = makeFixtureCandles();

		// First run: fresh with checkpointEveryN = 3
		const deps1 = makeDeps();
		const result1 = await runBacktest(candles, deps1, { checkpointEveryN: 3 });

		// 10 events / 3 = checkpoints at 3, 6, 9 → 3 checkpoints
		expect(deps1.checkpoints.length).toBe(3);

		// Resume from last checkpoint
		const lastCheckpoint = deps1.checkpoints[deps1.checkpoints.length - 1]!;
		let resumeCallIndex = lastCheckpoint.lastCandleIndex + 1;
		const deps2 = makeDeps({
			executeStrategy: async (candle) => {
				const idx = resumeCallIndex++;
				if (idx % 5 === 0) {
					return { entryPrice: candle.close, direction: "long" };
				}
				return null;
			},
		});

		const result2 = await resumeFromCheckpoint(candles, lastCheckpoint, deps2);

		// Resumed result should have same total candles
		expect(result2.totalCandles).toBe(50);
		// Combined events should equal full run events count
		expect(result2.events).toHaveLength(result1.events.length);
	});

	test("E — look-ahead bias: forward candles never include event candle", async () => {
		const candles = makeFixtureCandles();
		const deps = makeDeps();

		const result = await runBacktest(candles, deps);

		for (const event of result.events) {
			const forwardCandles = toForwardCandles(
				candles,
				event.candleIndex,
				RESULT_CONFIG.maxHoldBars,
			);
			if (forwardCandles.length > 0) {
				// Forward candle's open must NOT match the event candle's open
				const eventCandle = candles[event.candleIndex]!;
				expect(forwardCandles[0]!.open).not.toBe(eventCandle.open);
				// Should match the next candle
				if (event.candleIndex + 1 < candles.length) {
					expect(forwardCandles[0]!.open).toBe(candles[event.candleIndex + 1]!.open);
				}
			}
		}
	});

	test("F — empty candle list", async () => {
		const deps = makeDeps();
		const result = await runBacktest([], deps);

		expect(result.events).toHaveLength(0);
		expect(result.totalCandles).toBe(0);

		const report = computeReport([]);
		expect(report.totalEvents).toBe(0);
	});
});
