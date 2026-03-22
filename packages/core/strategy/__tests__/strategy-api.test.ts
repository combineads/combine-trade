import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { CandleData } from "../api.js";
import { StrategyExecutor } from "../executor.js";
import { StrategySandbox } from "../sandbox.js";

let sandbox: StrategySandbox;
let executor: StrategyExecutor;

// Generate sample candle data (50 bars of price data)
function generateTestCandles(bars = 50): CandleData {
	const close: number[] = [];
	const open: number[] = [];
	const high: number[] = [];
	const low: number[] = [];
	const volume: number[] = [];

	let price = 50000;
	for (let i = 0; i < bars; i++) {
		const change = Math.sin(i / 5) * 200 + (Math.random() - 0.5) * 100;
		price += change;
		const o = price - 50;
		const c = price;
		const h = Math.max(o, c) + Math.abs(change) * 0.3;
		const l = Math.min(o, c) - Math.abs(change) * 0.3;
		open.push(o);
		close.push(c);
		high.push(h);
		low.push(l);
		volume.push(1000 + Math.random() * 500);
	}
	return { open, high, low, close, volume };
}

beforeAll(async () => {
	sandbox = new StrategySandbox({ timeoutMs: 2000 });
	await sandbox.initialize();
	executor = new StrategyExecutor({ sandbox });
});

afterAll(() => {
	sandbox.dispose();
});

describe("Strategy API", () => {
	test("close array is accessible in strategy code", async () => {
		const candles = generateTestCandles();
		const code = `
			defineFeature("last_close", close[close.length - 1], { method: "none" });
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});
		expect(result.features.length).toBe(1);
		expect(result.features[0]!.value).toBeCloseTo(candles.close[candles.close.length - 1]!, 2);
	});

	test("indicator.sma returns pre-computed values", async () => {
		const candles = generateTestCandles();
		const code = `
			var smaValues = indicator.sma(close, 20);
			defineFeature("sma_length", smaValues.length, { method: "none" });
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});
		expect(result.features.length).toBe(1);
		expect(result.features[0]!.value).toBeGreaterThan(0);
	});

	test("indicator.rsi returns values between 0-100", async () => {
		const candles = generateTestCandles();
		const code = `
			var rsiValues = indicator.rsi(close, 14);
			if (rsiValues.length > 0) {
				defineFeature("rsi_last", rsiValues[rsiValues.length - 1], { method: "minmax" });
			}
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});
		if (result.features.length > 0) {
			expect(result.features[0]!.value).toBeGreaterThanOrEqual(0);
			expect(result.features[0]!.value).toBeLessThanOrEqual(100);
		}
	});

	test("bar_index is set correctly", async () => {
		const candles = generateTestCandles();
		const code = `
			defineFeature("bar_idx", bar_index, { method: "none" });
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: 42,
		});
		expect(result.features[0]!.value).toBe(42);
	});

	test("defineFeature collects multiple features", async () => {
		const candles = generateTestCandles();
		const code = `
			var smaValues = indicator.sma(close, 20);
			var rsiValues = indicator.rsi(close, 14);
			defineFeature("sma_20", smaValues.length > 0 ? smaValues[smaValues.length - 1] : 0, { method: "minmax" });
			defineFeature("rsi_14", rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 0, { method: "zscore" });
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});
		expect(result.features.length).toBe(2);
		expect(result.features[0]!.name).toBe("sma_20");
		expect(result.features[1]!.name).toBe("rsi_14");
	});

	test("setEntry and setExit work through executor", async () => {
		const candles = generateTestCandles();
		const code = `
			setEntry(close[close.length - 1] > close[close.length - 2]);
			setExit(false);
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});
		expect(result.entryCondition).not.toBeNull();
		expect(result.exitCondition).toBe(false);
	});

	test("candle() function provides data access", async () => {
		const candles = generateTestCandles();
		const code = `
			var c = candle("BTCUSDT", "1m", 0);
			if (c) {
				defineFeature("candle_close", c.close, { method: "none" });
			}
		`;
		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});
		expect(result.features.length).toBe(1);
		expect(result.features[0]!.value).toBeCloseTo(candles.close[candles.close.length - 1]!, 2);
	});
});
