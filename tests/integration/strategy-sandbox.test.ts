import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { StrategyExecutor, StrategySandbox } from "@combine/core/strategy";
import type { CandleData } from "@combine/core/strategy";

let sandbox: StrategySandbox;
let executor: StrategyExecutor;

function generateCandles(bars = 100): CandleData {
	const close: number[] = [];
	const open: number[] = [];
	const high: number[] = [];
	const low: number[] = [];
	const volume: number[] = [];

	let price = 50000;
	for (let i = 0; i < bars; i++) {
		const change = Math.sin(i / 10) * 300 + Math.cos(i / 7) * 150;
		price += change;
		open.push(price - 25);
		close.push(price);
		high.push(price + 100);
		low.push(price - 100);
		volume.push(1000 + i * 10);
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

describe("Strategy sandbox integration", () => {
	test("SMA crossover strategy produces correct features", async () => {
		const candles = generateCandles(100);
		const code = `
			var sma20 = indicator.sma(close, 20);
			var sma50 = indicator.sma(close, 50);

			if (sma20.length > 0 && sma50.length > 0) {
				var sma20Last = sma20[sma20.length - 1];
				var sma50Last = sma50[sma50.length - 1];

				defineFeature("sma_cross_diff", sma20Last - sma50Last, { method: "minmax" });
				defineFeature("price_vs_sma20", close[close.length - 1] - sma20Last, { method: "zscore" });

				setEntry(sma20Last > sma50Last);
			}
		`;

		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});

		expect(result.features.length).toBe(2);
		expect(result.features[0]!.name).toBe("sma_cross_diff");
		expect(typeof result.features[0]!.value).toBe("number");
		expect(result.features[1]!.name).toBe("price_vs_sma20");
		expect(result.entryCondition).not.toBeNull();
	});

	test("forbidden API access blocked in sandbox", () => {
		const code = 'require("fs").readFileSync("/etc/passwd");';
		expect(() => {
			sandbox.execute(code);
		}).toThrow();
	});

	test("timeout enforced for runaway strategy", () => {
		const code = "while(true) { var x = 1; }";
		expect(() => {
			sandbox.execute(code);
		}).toThrow("exceeded");
	});

	test("error isolation: one strategy crash doesn't affect next execution", async () => {
		// First: a crashing strategy
		try {
			sandbox.execute("throw new Error('crash');");
		} catch {
			// expected
		}

		// Second: a valid strategy still works
		const candles = generateCandles(50);
		const result = await executor.execute({
			code: 'defineFeature("ok", 42, { method: "none" });',
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: 0,
		});

		expect(result.features.length).toBe(1);
		expect(result.features[0]!.value).toBe(42);
	});

	test("RSI-based strategy with trade conditions", async () => {
		const candles = generateCandles(100);
		const code = `
			var rsiValues = indicator.rsi(close, 14);
			if (rsiValues.length > 0) {
				var lastRsi = rsiValues[rsiValues.length - 1];
				defineFeature("rsi_14", lastRsi, { method: "minmax" });
				defineFeature("price_change", close[close.length - 1] - close[close.length - 2], { method: "zscore" });
				setEntry(lastRsi < 30);
				setExit(lastRsi > 70);
			}
		`;

		const result = await executor.execute({
			code,
			symbol: "BTCUSDT",
			timeframe: "1m",
			candles,
			barIndex: candles.close.length - 1,
		});

		expect(result.features.length).toBe(2);
		expect(result.features[0]!.name).toBe("rsi_14");
		expect(result.features[0]!.value).toBeGreaterThanOrEqual(0);
		expect(result.features[0]!.value).toBeLessThanOrEqual(100);
		expect(result.entryCondition).not.toBeNull();
		expect(result.exitCondition).not.toBeNull();
	});
});
