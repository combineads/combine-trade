import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { CandleData } from "../api.js";
import { type ExecutionInput, type IndicatorConfig, StrategyExecutor } from "../executor.js";
import { StrategySandbox } from "../sandbox.js";

let sandbox: StrategySandbox;

beforeAll(async () => {
	sandbox = new StrategySandbox();
	await sandbox.initialize();
});

afterAll(() => {
	sandbox.dispose();
});

function makeCandles(length = 100): CandleData {
	return {
		open: Array.from({ length }, (_, i) => 100 + i * 0.2),
		high: Array.from({ length }, (_, i) => 101 + i * 0.2),
		low: Array.from({ length }, (_, i) => 99 + i * 0.2),
		close: Array.from({ length }, (_, i) => 100.5 + i * 0.2),
		volume: Array.from({ length }, () => 1000),
	};
}

describe("custom indicator pre-compute", () => {
	test("BB with custom source (open) and period is accessible", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const indicatorConfig: IndicatorConfig = {
			bb: [{ source: "open", period: 4, stddev: 4 }],
		};

		const input: ExecutionInput = {
			code: `
				var bb4 = indicator.bb(open, 4, 4);
				if (bb4 && bb4.upper && bb4.upper.length > 0) {
					defineFeature("bb4_available", 1, { method: "none" });
					// Check that values are actual numbers, not NaN
					var idx = bar_index;
					if (typeof bb4.upper[idx] === "number" && !isNaN(bb4.upper[idx])) {
						defineFeature("bb4_valid", 1, { method: "none" });
					}
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "5m",
			candles: makeCandles(),
			barIndex: 99,
			indicatorConfig,
		};

		const result = await executor.execute(input);
		const available = result.features.find((f) => f.name === "bb4_available");
		expect(available).toBeDefined();
		expect(available?.value).toBe(1);

		const valid = result.features.find((f) => f.name === "bb4_valid");
		expect(valid).toBeDefined();
		expect(valid?.value).toBe(1);
	});

	test("custom MA periods (100, 200) are accessible", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const indicatorConfig: IndicatorConfig = {
			sma: [{ period: 100 }, { period: 200 }],
		};

		const input: ExecutionInput = {
			code: `
				var sma100 = indicator.sma(close, 100);
				var sma200 = indicator.sma(close, 200);
				if (sma100 && sma100.length > 0) {
					defineFeature("sma100_available", 1, { method: "none" });
				}
				if (sma200 && sma200.length > 0) {
					defineFeature("sma200_available", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "5m",
			candles: makeCandles(),
			barIndex: 99,
			indicatorConfig,
		};

		const result = await executor.execute(input);
		const sma100 = result.features.find((f) => f.name === "sma100_available");
		expect(sma100).toBeDefined();

		const sma200 = result.features.find((f) => f.name === "sma200_available");
		expect(sma200).toBeDefined();
	});

	test("default pre-compute still works without indicatorConfig", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const input: ExecutionInput = {
			code: `
				var sma20 = indicator.sma(close, 20);
				if (sma20 && sma20.length > 0) {
					defineFeature("default_sma20", 1, { method: "none" });
				}
				var bb20 = indicator.bb(close, 20, 2);
				if (bb20 && bb20.upper && bb20.upper.length > 0) {
					defineFeature("default_bb20", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "5m",
			candles: makeCandles(),
			barIndex: 99,
		};

		const result = await executor.execute(input);
		expect(result.features.find((f) => f.name === "default_sma20")).toBeDefined();
		expect(result.features.find((f) => f.name === "default_bb20")).toBeDefined();
	});

	test("custom ATR period is accessible", async () => {
		const executor = new StrategyExecutor({ sandbox });

		const indicatorConfig: IndicatorConfig = {
			atr: [{ period: 7 }],
		};

		const input: ExecutionInput = {
			code: `
				var atr7 = indicator.atr(7);
				if (atr7 && atr7.length > 0) {
					defineFeature("atr7_available", 1, { method: "none" });
				}
			`,
			symbol: "BTCUSDT",
			timeframe: "5m",
			candles: makeCandles(),
			barIndex: 99,
			indicatorConfig,
		};

		const result = await executor.execute(input);
		expect(result.features.find((f) => f.name === "atr7_available")).toBeDefined();
	});
});
