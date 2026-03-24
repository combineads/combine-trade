import { describe, expect, test } from "bun:test";
import { adx, atr, bb, cci, ema, macd, obv, rsi, sma, stochastic, vwap, wma } from "../index.js";

describe("SMA", () => {
	test("SMA(5) of [1,2,3,4,5] = [3]", async () => {
		const result = await sma([1, 2, 3, 4, 5], 5);
		expect(result.length).toBe(1);
		expect(result[0]).toBeCloseTo(3, 5);
	});

	test("SMA(3) of [2,4,6,8,10] = [4, 6, 8]", async () => {
		const result = await sma([2, 4, 6, 8, 10], 3);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(4, 5);
		expect(result[1]).toBeCloseTo(6, 5);
		expect(result[2]).toBeCloseTo(8, 5);
	});

	test("SMA(1) returns input values", async () => {
		const input = [10, 20, 30];
		const result = await sma(input, 1);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(10, 5);
		expect(result[1]).toBeCloseTo(20, 5);
		expect(result[2]).toBeCloseTo(30, 5);
	});

	test("SMA with period > length returns fewer results", async () => {
		const result = await sma([1, 2], 5);
		expect(result.length).toBeLessThanOrEqual(2);
	});

	test("SMA of constant values returns constant", async () => {
		const result = await sma([5, 5, 5, 5, 5], 3);
		for (const v of result) {
			expect(v).toBeCloseTo(5, 5);
		}
	});
});

describe("EMA", () => {
	test("EMA(3) of [1,2,3,4,5] produces expected output", async () => {
		const result = await ema([1, 2, 3, 4, 5], 3);
		expect(result.length).toBeGreaterThan(0);
		// EMA converges toward recent values — last value should be close to 5
		const last = result[result.length - 1];
		expect(last).toBeDefined();
		expect(last!).toBeGreaterThan(3);
		expect(last!).toBeLessThanOrEqual(5);
	});

	test("EMA(1) returns input values", async () => {
		const input = [10, 20, 30];
		const result = await ema(input, 1);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(10, 5);
		expect(result[1]).toBeCloseTo(20, 5);
		expect(result[2]).toBeCloseTo(30, 5);
	});

	test("EMA of constant values returns constant", async () => {
		const result = await ema([7, 7, 7, 7, 7], 3);
		for (const v of result) {
			expect(v).toBeCloseTo(7, 5);
		}
	});

	test("EMA gives more weight to recent values", async () => {
		const result = await ema([1, 1, 1, 1, 10], 3);
		const last = result[result.length - 1];
		const prev = result[result.length - 2];
		expect(last).toBeDefined();
		expect(prev).toBeDefined();
		expect(last!).toBeGreaterThan(prev!);
	});

	test("EMA with period > length still returns values", async () => {
		const result = await ema([1, 2], 5);
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("Bollinger Bands", () => {
	test("BB returns upper, middle, lower bands", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const result = await bb(input, 5);
		expect(result.upper.length).toBeGreaterThan(0);
		expect(result.middle.length).toBeGreaterThan(0);
		expect(result.lower.length).toBeGreaterThan(0);
	});

	test("BB middle band equals SMA", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const bbResult = await bb(input, 5);
		const smaResult = await sma(input, 5);
		expect(bbResult.middle.length).toBe(smaResult.length);
		for (let i = 0; i < smaResult.length; i++) {
			expect(bbResult.middle[i]).toBeCloseTo(smaResult[i]!, 5);
		}
	});

	test("BB upper > middle > lower", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const result = await bb(input, 5);
		for (let i = 0; i < result.middle.length; i++) {
			expect(result.upper[i]).toBeGreaterThanOrEqual(result.middle[i]!);
			expect(result.middle[i]).toBeGreaterThanOrEqual(result.lower[i]!);
		}
	});

	test("BB of constant values has upper = middle = lower", async () => {
		const result = await bb([10, 10, 10, 10, 10], 3);
		for (let i = 0; i < result.middle.length; i++) {
			expect(result.upper[i]).toBeCloseTo(result.middle[i]!, 5);
			expect(result.lower[i]).toBeCloseTo(result.middle[i]!, 5);
		}
	});

	test("BB with higher stddev produces wider bands", async () => {
		const input = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23];
		const narrow = await bb(input, 5, 1);
		const wide = await bb(input, 5, 3);
		const lastIdx = narrow.upper.length - 1;
		const narrowWidth = narrow.upper[lastIdx]! - narrow.lower[lastIdx]!;
		const wideWidth = wide.upper[lastIdx]! - wide.lower[lastIdx]!;
		expect(wideWidth).toBeGreaterThan(narrowWidth);
	});
});

// Sample OHLCV data for tests requiring high/low/close/volume
const sampleHigh = [
	48, 49, 50, 51, 50, 49, 48, 50, 52, 53, 51, 50, 49, 48, 50, 52, 54, 53, 51, 50, 49, 48, 50, 52,
	53, 51, 50, 49, 48, 50,
];
const sampleLow = [
	45, 46, 47, 48, 47, 46, 45, 47, 49, 50, 48, 47, 46, 45, 47, 49, 51, 50, 48, 47, 46, 45, 47, 49,
	50, 48, 47, 46, 45, 47,
];
const sampleClose = [
	47, 48, 49, 50, 49, 48, 47, 49, 51, 52, 50, 49, 48, 47, 49, 51, 53, 52, 50, 49, 48, 47, 49, 51,
	52, 50, 49, 48, 47, 49,
];
const sampleVolume = [
	100, 120, 130, 150, 110, 90, 80, 140, 160, 170, 130, 110, 95, 85, 145, 165, 180, 140, 120, 100,
	90, 80, 150, 170, 175, 135, 115, 95, 85, 145,
];

describe("RSI", () => {
	test("RSI(14) produces values between 0 and 100", async () => {
		const result = await rsi(sampleClose, 14);
		expect(result.length).toBeGreaterThan(0);
		for (const v of result) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(100);
		}
	});

	test("RSI of strongly rising prices is high", async () => {
		const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
		const result = await rsi(rising, 14);
		const last = result[result.length - 1]!;
		expect(last).toBeGreaterThan(70);
	});

	test("RSI of strongly falling prices is low", async () => {
		const falling = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
		const result = await rsi(falling, 14);
		const last = result[result.length - 1]!;
		expect(last).toBeLessThan(30);
	});

	test("RSI with insufficient data returns empty", async () => {
		const result = await rsi([1, 2, 3], 14);
		expect(result.length).toBe(0);
	});
});

describe("MACD", () => {
	test("MACD returns macd, signal, histogram arrays", async () => {
		const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
		const result = await macd(data);
		expect(result.macd.length).toBeGreaterThan(0);
		expect(result.signal.length).toBeGreaterThan(0);
		expect(result.histogram.length).toBeGreaterThan(0);
	});

	test("MACD histogram = macd - signal", async () => {
		const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
		const result = await macd(data);
		const minLen = Math.min(result.macd.length, result.signal.length, result.histogram.length);
		for (let i = 0; i < minLen; i++) {
			const expected = result.macd[i]! - result.signal[i]!;
			expect(result.histogram[i]).toBeCloseTo(expected, 5);
		}
	});

	test("MACD with insufficient data returns empty", async () => {
		const result = await macd([1, 2, 3, 4, 5]);
		expect(result.macd.length).toBe(0);
	});
});

describe("ATR", () => {
	test("ATR(14) produces positive values", async () => {
		const result = await atr(sampleHigh, sampleLow, sampleClose, 14);
		expect(result.length).toBeGreaterThan(0);
		for (const v of result) {
			expect(v).toBeGreaterThan(0);
		}
	});

	test("ATR is higher for more volatile data", async () => {
		const stableHigh = Array.from({ length: 30 }, () => 101);
		const stableLow = Array.from({ length: 30 }, () => 99);
		const stableClose = Array.from({ length: 30 }, () => 100);
		const volatileHigh = Array.from({ length: 30 }, () => 110);
		const volatileLow = Array.from({ length: 30 }, () => 90);
		const volatileClose = Array.from({ length: 30 }, () => 100);

		const stableATR = await atr(stableHigh, stableLow, stableClose, 14);
		const volatileATR = await atr(volatileHigh, volatileLow, volatileClose, 14);
		const stableLast = stableATR[stableATR.length - 1]!;
		const volatileLast = volatileATR[volatileATR.length - 1]!;
		expect(volatileLast).toBeGreaterThan(stableLast);
	});

	test("ATR with insufficient data returns empty", async () => {
		const result = await atr([1, 2], [0, 1], [1, 1], 14);
		expect(result.length).toBe(0);
	});
});

describe("Stochastic", () => {
	test("Stochastic returns %K and %D between 0 and 100", async () => {
		const result = await stochastic(sampleHigh, sampleLow, sampleClose);
		expect(result.k.length).toBeGreaterThan(0);
		expect(result.d.length).toBeGreaterThan(0);
		for (const v of result.k) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(100);
		}
	});

	test("Stochastic with insufficient data returns empty", async () => {
		const result = await stochastic([1, 2], [0, 1], [1, 1], 14);
		expect(result.k.length).toBe(0);
	});
});

describe("CCI", () => {
	test("CCI produces values (can be negative or positive)", async () => {
		const result = await cci(sampleHigh, sampleLow, sampleClose, 14);
		expect(result.length).toBeGreaterThan(0);
	});

	test("CCI with insufficient data returns empty", async () => {
		const result = await cci([1, 2], [0, 1], [1, 1], 20);
		expect(result.length).toBe(0);
	});
});

describe("ADX", () => {
	// ADX needs ~2*period+1 data points to produce output
	const longHigh = [...sampleHigh, ...sampleHigh];
	const longLow = [...sampleLow, ...sampleLow];
	const longClose = [...sampleClose, ...sampleClose];

	test("ADX returns adx, plusDI, minusDI", async () => {
		const result = await adx(longHigh, longLow, longClose, 14);
		expect(result.adx.length).toBeGreaterThan(0);
		expect(result.plusDI.length).toBeGreaterThan(0);
		expect(result.minusDI.length).toBeGreaterThan(0);
	});

	test("ADX values are non-negative", async () => {
		const result = await adx(longHigh, longLow, longClose, 14);
		for (const v of result.adx) {
			expect(v).toBeGreaterThanOrEqual(0);
		}
	});

	test("ADX with insufficient data returns empty", async () => {
		const result = await adx([1, 2, 3], [0, 1, 2], [1, 1, 2], 14);
		expect(result.adx.length).toBe(0);
	});
});

describe("OBV", () => {
	test("OBV produces cumulative volume values", async () => {
		const result = await obv(sampleClose, sampleVolume);
		expect(result.length).toBeGreaterThan(0);
	});

	test("OBV increases on rising close", async () => {
		const close = [10, 11, 12, 13, 14];
		const volume = [100, 100, 100, 100, 100];
		const result = await obv(close, volume);
		// Each bar adds volume, so OBV should be monotonically increasing
		for (let i = 1; i < result.length; i++) {
			expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]!);
		}
	});

	test("OBV decreases on falling close", async () => {
		const close = [14, 13, 12, 11, 10];
		const volume = [100, 100, 100, 100, 100];
		const result = await obv(close, volume);
		for (let i = 1; i < result.length; i++) {
			expect(result[i]).toBeLessThanOrEqual(result[i - 1]!);
		}
	});

	test("OBV with insufficient data returns empty", async () => {
		const result = await obv([1], [100]);
		expect(result.length).toBe(0);
	});
});

describe("VWAP", () => {
	test("VWAP produces values", async () => {
		const result = await vwap(sampleHigh, sampleLow, sampleClose, sampleVolume);
		expect(result.length).toBeGreaterThan(0);
	});

	test("VWAP is between low and high range", async () => {
		const result = await vwap(sampleHigh, sampleLow, sampleClose, sampleVolume, 10);
		for (const v of result) {
			expect(v).toBeGreaterThanOrEqual(Math.min(...sampleLow));
			expect(v).toBeLessThanOrEqual(Math.max(...sampleHigh));
		}
	});

	test("VWAP of constant prices equals that price", async () => {
		const h = Array.from({ length: 10 }, () => 100);
		const l = Array.from({ length: 10 }, () => 100);
		const c = Array.from({ length: 10 }, () => 100);
		const v = Array.from({ length: 10 }, () => 50);
		const result = await vwap(h, l, c, v, 5);
		for (const val of result) {
			expect(val).toBeCloseTo(100, 2);
		}
	});
});

describe("WMA", () => {
	test("WMA(3) of [1,2,3,4,5] produces linearly weighted values", async () => {
		// WMA(3): weights=[1,2,3], denominator=6
		// position 0: (1*1 + 2*2 + 3*3)/6 = 14/6 ≈ 2.333
		// position 1: (2*1 + 3*2 + 4*3)/6 = 20/6 ≈ 3.333
		// position 2: (3*1 + 4*2 + 5*3)/6 = 26/6 ≈ 4.333
		const result = await wma([1, 2, 3, 4, 5], 3);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(14 / 6, 5);
		expect(result[1]).toBeCloseTo(20 / 6, 5);
		expect(result[2]).toBeCloseTo(26 / 6, 5);
	});

	test("WMA(1) returns input values unchanged", async () => {
		const input = [10, 20, 30];
		const result = await wma(input, 1);
		expect(result.length).toBe(3);
		expect(result[0]).toBeCloseTo(10, 5);
		expect(result[1]).toBeCloseTo(20, 5);
		expect(result[2]).toBeCloseTo(30, 5);
	});

	test("WMA of constant values returns that constant", async () => {
		const result = await wma([7, 7, 7, 7, 7], 3);
		for (const v of result) {
			expect(v).toBeCloseTo(7, 5);
		}
	});

	test("WMA gives more weight to recent values", async () => {
		// spike at the end should pull last WMA value higher than previous
		const result = await wma([1, 1, 1, 1, 100], 3);
		const last = result[result.length - 1];
		const prev = result[result.length - 2];
		expect(last).toBeDefined();
		expect(prev).toBeDefined();
		expect(last!).toBeGreaterThan(prev!);
	});

	test("WMA with period > length returns empty array", async () => {
		const result = await wma([1, 2], 5);
		expect(result.length).toBe(0);
	});

	test("WMA(5) of [1,2,3,4,5] equals 5*1+4*2+3*3+2*4+1*5 / 15", async () => {
		// weights oldest→newest = 1,2,3,4,5; denominator = 15
		// (1*1 + 2*2 + 3*3 + 4*4 + 5*5)/15 = (1+4+9+16+25)/15 = 55/15 ≈ 3.667
		const result = await wma([1, 2, 3, 4, 5], 5);
		expect(result.length).toBe(1);
		expect(result[0]).toBeCloseTo(55 / 15, 5);
	});
});
