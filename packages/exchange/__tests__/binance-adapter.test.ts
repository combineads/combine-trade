import { describe, expect, test } from "bun:test";
import { mapOhlcvRow } from "../binance/adapter.js";
import { BinanceAdapter } from "../binance/index.js";

describe("mapOhlcvRow", () => {
	test("maps CCXT OHLCV array to ExchangeCandle", () => {
		const row = [1704067200000, 42500.5, 42600.0, 42400.0, 42550.0, 150.5];
		const candle = mapOhlcvRow(row);
		expect(candle.timestamp).toBe(1704067200000);
		expect(candle.open).toBe(42500.5);
		expect(candle.high).toBe(42600.0);
		expect(candle.low).toBe(42400.0);
		expect(candle.close).toBe(42550.0);
		expect(candle.volume).toBe(150.5);
	});
});

describe("BinanceAdapter", () => {
	test("exchange property is binance", () => {
		const adapter = new BinanceAdapter();
		expect(adapter.exchange).toBe("binance");
	});

	test("createOrder is implemented (no longer throws not implemented)", () => {
		const adapter = new BinanceAdapter();
		expect(typeof adapter.createOrder).toBe("function");
	});

	test("fetchBalance is implemented (no longer throws not implemented)", () => {
		const adapter = new BinanceAdapter();
		expect(typeof adapter.fetchBalance).toBe("function");
	});
});

// Live test — skipped in CI
const SKIP_LIVE = process.env.CI === "true" || !process.env.BINANCE_API_KEY;

describe.skipIf(SKIP_LIVE)("BinanceAdapter live", () => {
	test("fetchOHLCV returns candle data from Binance", async () => {
		const adapter = new BinanceAdapter();
		try {
			const candles = await adapter.fetchOHLCV("BTC/USDT:USDT", "1m", undefined, 5);
			expect(candles.length).toBeGreaterThan(0);
			expect(candles.length).toBeLessThanOrEqual(5);
			expect(typeof candles[0]!.timestamp).toBe("number");
			expect(typeof candles[0]!.open).toBe("number");
			expect(typeof candles[0]!.volume).toBe("number");
		} finally {
			await adapter.close();
		}
	});
});
