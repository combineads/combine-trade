import { describe, expect, test } from "bun:test";
import { WarmupTracker, calculateWarmupPeriod } from "../warmup.js";

describe("calculateWarmupPeriod", () => {
	test("returns 0 for strategy with no indicator calls", () => {
		const code = `
			defineFeature("price", close[close.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(0);
	});

	test("detects EMA period", () => {
		const code = `
			var emaValues = indicator.ema(close, 200);
			defineFeature("ema_200", emaValues[emaValues.length - 1], { method: "minmax" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(200);
	});

	test("detects SMA period", () => {
		const code = `
			var smaValues = indicator.sma(close, 50);
			defineFeature("sma_50", smaValues[smaValues.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(50);
	});

	test("detects BB period", () => {
		const code = `
			var bb = indicator.bb(close, 20);
			defineFeature("bb_upper", bb.upper[bb.upper.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(20);
	});

	test("detects RSI period", () => {
		const code = `
			var rsi = indicator.rsi(close, 14);
			defineFeature("rsi", rsi[rsi.length - 1], { method: "minmax" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(14);
	});

	test("returns max period when multiple indicators used", () => {
		const code = `
			var sma = indicator.sma(close, 50);
			var ema = indicator.ema(close, 200);
			var rsi = indicator.rsi(close, 14);
			defineFeature("sma", sma[sma.length - 1], { method: "none" });
			defineFeature("ema", ema[ema.length - 1], { method: "none" });
			defineFeature("rsi", rsi[rsi.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(200);
	});

	test("detects ATR period", () => {
		const code = `
			var atr = indicator.atr(14);
			defineFeature("atr", atr[atr.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(14);
	});

	test("detects MACD with default periods (26 fast+slow)", () => {
		const code = `
			var macd = indicator.macd(close);
			defineFeature("macd", macd.macd[macd.macd.length - 1], { method: "none" });
		`;
		// MACD default: fast=12, slow=26, signal=9 → max=26
		expect(calculateWarmupPeriod(code)).toBe(26);
	});

	test("detects CCI period", () => {
		const code = `
			var cci = indicator.cci(20);
			defineFeature("cci", cci[cci.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(20);
	});

	test("detects stochastic period", () => {
		const code = `
			var stoch = indicator.stochastic(14);
			defineFeature("stoch_k", stoch.k[stoch.k.length - 1], { method: "none" });
		`;
		expect(calculateWarmupPeriod(code)).toBe(14);
	});

	test("handles non-numeric period arguments gracefully", () => {
		const code = `
			var period = getSomePeriod();
			var ema = indicator.ema(close, period);
			defineFeature("ema", ema[ema.length - 1], { method: "none" });
		`;
		// Non-numeric second arg should not throw; falls back to 0 for that call
		expect(() => calculateWarmupPeriod(code)).not.toThrow();
	});

	test("ignores indicator calls without a numeric period (defaults preserved)", () => {
		const code = `
			var sma = indicator.sma(close);
			defineFeature("sma", sma[sma.length - 1], { method: "none" });
		`;
		// No period argument → returns 0 (no warmup needed for unknown)
		expect(calculateWarmupPeriod(code)).toBe(0);
	});
});

describe("WarmupTracker", () => {
	test("warmupComplete is false during warmup period (first warmupPeriod bars suppressed)", () => {
		const tracker = new WarmupTracker();
		const key = "strat-1:BTC:1m";
		const warmupPeriod = 5;

		// All warmupPeriod bars should be suppressed
		for (let i = 0; i < warmupPeriod; i++) {
			tracker.increment(key);
			expect(tracker.isComplete(key, warmupPeriod)).toBe(false);
		}
	});

	test("warmupComplete is true after warmupPeriod+1 candles (first post-warmup bar)", () => {
		const tracker = new WarmupTracker();
		const key = "strat-1:BTC:1m";
		const warmupPeriod = 3;

		// warmupPeriod bars suppressed
		for (let i = 0; i < warmupPeriod; i++) {
			tracker.increment(key);
		}
		// One more bar completes the warmup
		tracker.increment(key);
		expect(tracker.isComplete(key, warmupPeriod)).toBe(true);
	});

	test("warmupComplete is true when warmupPeriod is 0", () => {
		const tracker = new WarmupTracker();
		const key = "strat-1:BTC:1m";
		expect(tracker.isComplete(key, 0)).toBe(true);
	});

	test("tracks multiple strategy keys independently", () => {
		const tracker = new WarmupTracker();
		const key1 = "strat-1:BTC:1m";
		const key2 = "strat-2:ETH:1m";

		// 3 bars for key1 — still in warmup (need >5 to complete)
		tracker.increment(key1);
		tracker.increment(key1);
		tracker.increment(key1);

		// key1 has 3 bars, not complete; key2 has 0 bars, not complete
		expect(tracker.isComplete(key1, 5)).toBe(false);
		expect(tracker.isComplete(key2, 5)).toBe(false);
	});

	test("getCandleCount returns 0 for unknown key", () => {
		const tracker = new WarmupTracker();
		expect(tracker.getCandleCount("unknown-key")).toBe(0);
	});

	test("getCandleCount increments correctly", () => {
		const tracker = new WarmupTracker();
		const key = "strat-1:BTC:1m";
		tracker.increment(key);
		tracker.increment(key);
		expect(tracker.getCandleCount(key)).toBe(2);
	});

	test("reset clears state for a strategy key", () => {
		const tracker = new WarmupTracker();
		const key = "strat-1:BTC:1m";
		// Need 4 increments to complete warmup=3 (count > 3)
		tracker.increment(key);
		tracker.increment(key);
		tracker.increment(key);
		tracker.increment(key);
		expect(tracker.isComplete(key, 3)).toBe(true);

		tracker.reset(key);
		expect(tracker.getCandleCount(key)).toBe(0);
		expect(tracker.isComplete(key, 3)).toBe(false);
	});
});
