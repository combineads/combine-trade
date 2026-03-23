import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import { resumeFromCheckpoint, runBacktest } from "../engine.js";
import type { BacktestCheckpoint, BacktestEngineDeps, StrategyOutput } from "../types.js";

function makeCandle(_index: number, openTimeMs: number): Candle {
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime: new Date(openTimeMs),
		open: "50000",
		high: "50100",
		low: "49900",
		close: "50050",
		volume: "100",
		isClosed: true,
	};
}

function makeDeps(
	overrides: Partial<BacktestEngineDeps> & {
		strategyFn?: (candle: Candle, index: number) => StrategyOutput | null;
	} = {},
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
				return overrides.strategyFn ? overrides.strategyFn(candle, idx) : null;
			}),
		saveCheckpoint:
			overrides.saveCheckpoint ??
			(async (cp) => {
				checkpoints.push(structuredClone(cp));
			}),
		loadCheckpoint: overrides.loadCheckpoint ?? (async () => null),
	};
}

const BASE_TIME = 1704067200000; // 2024-01-01T00:00:00Z
const MINUTE = 60_000;

describe("runBacktest", () => {
	test("emits events only for candles where strategy returns non-null", async () => {
		const candles = Array.from({ length: 5 }, (_, i) => makeCandle(i, BASE_TIME + i * MINUTE));
		const deps = makeDeps({
			strategyFn: (_candle, idx) => {
				// Emit on candle 1 and 3 (0-indexed)
				if (idx === 1 || idx === 3) return { entryPrice: "50000", direction: "long" };
				return null;
			},
		});

		const result = await runBacktest(candles, deps);

		expect(result.events).toHaveLength(2);
		expect(result.events[0]!.candleIndex).toBe(1);
		expect(result.events[1]!.candleIndex).toBe(3);
		expect(result.totalCandles).toBe(5);
	});

	test("strategy that always returns null produces zero events", async () => {
		const candles = Array.from({ length: 3 }, (_, i) => makeCandle(i, BASE_TIME + i * MINUTE));
		const deps = makeDeps();

		const result = await runBacktest(candles, deps);

		expect(result.events).toHaveLength(0);
		expect(result.totalCandles).toBe(3);
	});

	test("sorts candles by openTime before processing", async () => {
		// Create candles in reverse order
		const candles = [
			makeCandle(2, BASE_TIME + 2 * MINUTE),
			makeCandle(0, BASE_TIME),
			makeCandle(1, BASE_TIME + 1 * MINUTE),
		];

		const processedTimes: number[] = [];
		const deps = makeDeps({
			executeStrategy: async (candle) => {
				processedTimes.push(candle.openTime.getTime());
				return null;
			},
		});

		await runBacktest(candles, deps);

		// Should be in ascending order
		expect(processedTimes).toEqual([BASE_TIME, BASE_TIME + MINUTE, BASE_TIME + 2 * MINUTE]);
	});

	test("saves checkpoint after every N events", async () => {
		const candles = Array.from({ length: 10 }, (_, i) => makeCandle(i, BASE_TIME + i * MINUTE));
		const deps = makeDeps({
			// Every candle emits an event
			strategyFn: () => ({ entryPrice: "50000", direction: "long" }),
		});

		await runBacktest(candles, deps, { checkpointEveryN: 3 });

		// 10 events, checkpoint at 3, 6, 9 → 3 checkpoints
		expect(deps.checkpoints).toHaveLength(3);
		expect(deps.checkpoints[0]!.events).toHaveLength(3);
		expect(deps.checkpoints[1]!.events).toHaveLength(6);
		expect(deps.checkpoints[2]!.events).toHaveLength(9);
	});

	test("onProgress callback receives correct values", async () => {
		const candles = Array.from({ length: 4 }, (_, i) => makeCandle(i, BASE_TIME + i * MINUTE));
		const progress: Array<[number, number]> = [];
		const deps = makeDeps();

		await runBacktest(candles, deps, {
			onProgress: (processed, total) => progress.push([processed, total]),
		});

		expect(progress).toEqual([
			[1, 4],
			[2, 4],
			[3, 4],
			[4, 4],
		]);
	});

	test("durationMs is positive", async () => {
		const candles = [makeCandle(0, BASE_TIME)];
		const deps = makeDeps();

		const result = await runBacktest(candles, deps);

		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("events preserve order matching candle sequence", async () => {
		const candles = Array.from({ length: 5 }, (_, i) => makeCandle(i, BASE_TIME + i * MINUTE));
		const deps = makeDeps({
			strategyFn: () => ({ entryPrice: "50000", direction: "long" }),
		});

		const result = await runBacktest(candles, deps);

		for (let i = 1; i < result.events.length; i++) {
			expect(result.events[i]!.candleIndex).toBeGreaterThan(result.events[i - 1]!.candleIndex);
		}
	});
});

describe("resumeFromCheckpoint", () => {
	test("skips already-processed candles and continues from checkpoint", async () => {
		const candles = Array.from({ length: 6 }, (_, i) => makeCandle(i, BASE_TIME + i * MINUTE));

		// Checkpoint after processing first 3 candles with 2 events
		const checkpoint: BacktestCheckpoint = {
			lastCandleIndex: 2,
			events: [
				{
					eventId: "prev-1",
					strategyId: "strat-1",
					version: 1,
					symbol: "BTCUSDT",
					exchange: "binance",
					timeframe: "1m",
					entryPrice: "50000",
					direction: "long",
					openTime: new Date(BASE_TIME),
					candleIndex: 0,
				},
				{
					eventId: "prev-2",
					strategyId: "strat-1",
					version: 1,
					symbol: "BTCUSDT",
					exchange: "binance",
					timeframe: "1m",
					entryPrice: "50000",
					direction: "long",
					openTime: new Date(BASE_TIME + 2 * MINUTE),
					candleIndex: 2,
				},
			],
			startedAt: Date.now(),
		};

		const processedIndices: number[] = [];
		let callIdx = 0;
		const deps = makeDeps({
			executeStrategy: async (candle) => {
				const idx = candles.findIndex((c) => c.openTime.getTime() === candle.openTime.getTime());
				processedIndices.push(idx);
				callIdx++;
				// Emit on first new candle
				if (callIdx === 1) return { entryPrice: "50000", direction: "short" };
				return null;
			},
		});

		const result = await resumeFromCheckpoint(candles, checkpoint, deps);

		// Should only process candles 3, 4, 5 (indices after checkpoint)
		expect(processedIndices).toEqual([3, 4, 5]);
		// Previous 2 events + 1 new
		expect(result.events).toHaveLength(3);
		expect(result.events[0]!.eventId).toBe("prev-1");
		expect(result.events[2]!.direction).toBe("short");
		expect(result.totalCandles).toBe(6);
	});
});
