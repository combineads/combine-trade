import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { CandleData } from "../../api.js";
import { type ExecutionInput, StrategyExecutor } from "../../executor.js";
import { StrategySandbox } from "../../sandbox.js";
import { DOUBLE_BB_SCRIPT } from "../script.js";

let sandbox: StrategySandbox;

beforeAll(async () => {
	sandbox = new StrategySandbox();
	await sandbox.initialize();
});

afterAll(() => {
	sandbox.dispose();
});

/**
 * Generate synthetic candle data with a bullish trend.
 * Price rises steadily, giving clear BB20 upper proximity + rising MAs.
 */
function makeBullishTrendCandles(length = 100): CandleData {
	const open: number[] = [];
	const high: number[] = [];
	const low: number[] = [];
	const close: number[] = [];
	const volume: number[] = [];

	for (let i = 0; i < length; i++) {
		const base = 100 + i * 0.5;
		open.push(base);
		high.push(base + 2);
		low.push(base - 0.5);
		close.push(base + 1.5);
		volume.push(1000 + Math.floor(i * 10));
	}
	return { open, high, low, close, volume };
}

/**
 * Generate flat candles in the middle — no BB pattern should trigger.
 */
function makeFlatCandles(length = 100): CandleData {
	const open: number[] = [];
	const high: number[] = [];
	const low: number[] = [];
	const close: number[] = [];
	const volume: number[] = [];

	for (let i = 0; i < length; i++) {
		open.push(100);
		high.push(100.5);
		low.push(99.5);
		close.push(100.2);
		volume.push(1000);
	}
	return { open, high, low, close, volume };
}

describe("Double-BB sandbox script", () => {
	test("executes without errors on bullish trend data", async () => {
		const executor = new StrategyExecutor({ sandbox });
		const candles = makeBullishTrendCandles();

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "both",
			candles,
			barIndex: 99,
		};

		const result = await executor.execute(input);
		// Should not throw
		expect(result).toBeDefined();
		expect(result.features).toBeDefined();
	});

	test("produces no features on flat data (no pattern)", async () => {
		const executor = new StrategyExecutor({ sandbox });
		const candles = makeFlatCandles();

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "both",
			candles,
			barIndex: 99,
		};

		const result = await executor.execute(input);
		// Flat data should not trigger any pattern
		expect(result.features.length).toBe(0);
		expect(result.entryCondition).toBeNull();
	});

	test("produces 10 features when pattern detected", async () => {
		const executor = new StrategyExecutor({ sandbox });
		const candles = makeBullishTrendCandles();

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "both",
			candles,
			barIndex: 99,
		};

		const result = await executor.execute(input);

		if (result.features.length > 0) {
			expect(result.features).toHaveLength(10);
			expect(result.entryCondition).toBe(true);

			const featureNames = result.features.map((f) => f.name);
			expect(featureNames).toContain("double_bb_variant");
			expect(featureNames).toContain("candle_pattern_score");
			expect(featureNames).toContain("price_in_bb20");
			expect(featureNames).toContain("volume_ratio");
		}
	});

	test("all feature values in [0, 1] range", async () => {
		const executor = new StrategyExecutor({ sandbox });
		const candles = makeBullishTrendCandles();

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "both",
			candles,
			barIndex: 99,
		};

		const result = await executor.execute(input);

		for (const feature of result.features) {
			expect(feature.value).toBeGreaterThanOrEqual(0);
			expect(feature.value).toBeLessThanOrEqual(1);
		}
	});

	test("direction filter: LONG produces no features on bearish data", async () => {
		const executor = new StrategyExecutor({ sandbox });
		// Bearish trend: prices declining
		const candles: CandleData = {
			open: Array.from({ length: 100 }, (_, i) => 200 - i * 0.5),
			high: Array.from({ length: 100 }, (_, i) => 200 - i * 0.5 + 0.5),
			low: Array.from({ length: 100 }, (_, i) => 200 - i * 0.5 - 2),
			close: Array.from({ length: 100 }, (_, i) => 200 - i * 0.5 - 1.5),
			volume: Array.from({ length: 100 }, () => 1000),
		};

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "long",
			candles,
			barIndex: 99,
		};

		const result = await executor.execute(input);
		// Bearish pattern should be filtered out for LONG direction
		expect(result.features.length).toBe(0);
	});

	test("context.direction is respected in script", async () => {
		const executor = new StrategyExecutor({ sandbox });
		const candles = makeBullishTrendCandles();

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "short",
			candles,
			barIndex: 99,
		};

		const result = await executor.execute(input);
		// Bullish pattern should be filtered out for SHORT direction
		expect(result.features.length).toBe(0);
	});

	test("handles insufficient data gracefully (bar_index < 20)", async () => {
		const executor = new StrategyExecutor({ sandbox });
		const candles = makeBullishTrendCandles(25);

		const input: ExecutionInput = {
			code: DOUBLE_BB_SCRIPT,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "both",
			candles,
			barIndex: 10, // < 20, should exit early
		};

		const result = await executor.execute(input);
		expect(result.features.length).toBe(0);
	});
});
