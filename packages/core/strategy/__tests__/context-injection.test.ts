import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { CandleData } from "../api.js";
import { type ExecutionInput, StrategyExecutor } from "../executor.js";
import { StrategySandbox } from "../sandbox.js";

let sandbox: StrategySandbox;

beforeAll(async () => {
	sandbox = new StrategySandbox();
	await sandbox.initialize();
});

afterAll(() => {
	sandbox.dispose();
});

function makeCandles(length = 50): CandleData {
	return {
		open: Array.from({ length }, (_, i) => 100 + i * 0.1),
		high: Array.from({ length }, (_, i) => 101 + i * 0.1),
		low: Array.from({ length }, (_, i) => 99 + i * 0.1),
		close: Array.from({ length }, (_, i) => 100.5 + i * 0.1),
		volume: Array.from({ length }, () => 1000),
	};
}

describe("context injection", () => {
	test("context.direction is accessible in sandbox", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const input: ExecutionInput = {
			code: `
				if (context && context.direction === "long") {
					defineFeature("direction_check", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "5m",
			direction: "long",
			candles: makeCandles(),
			barIndex: 49,
		};

		const result = await executor.execute(input);
		const feature = result.features.find((f) => f.name === "direction_check");
		expect(feature).toBeDefined();
		expect(feature?.value).toBe(1);
	});

	test("context.symbol is accessible in sandbox", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const input: ExecutionInput = {
			code: `
				if (context && context.symbol === "BTCUSDT") {
					defineFeature("symbol_check", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles: makeCandles(),
			barIndex: 49,
		};

		const result = await executor.execute(input);
		const feature = result.features.find((f) => f.name === "symbol_check");
		expect(feature).toBeDefined();
		expect(feature?.value).toBe(1);
	});

	test("context.timeframe is accessible in sandbox", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const input: ExecutionInput = {
			code: `
				if (context && context.timeframe === "15m") {
					defineFeature("tf_check", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "15m",
			candles: makeCandles(),
			barIndex: 49,
		};

		const result = await executor.execute(input);
		const feature = result.features.find((f) => f.name === "tf_check");
		expect(feature).toBeDefined();
		expect(feature?.value).toBe(1);
	});

	test("context.direction defaults to 'both' when not specified", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const input: ExecutionInput = {
			code: `
				if (context && context.direction === "both") {
					defineFeature("default_check", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "5m",
			candles: makeCandles(),
			barIndex: 49,
		};

		const result = await executor.execute(input);
		const feature = result.features.find((f) => f.name === "default_check");
		expect(feature).toBeDefined();
		expect(feature?.value).toBe(1);
	});
});
