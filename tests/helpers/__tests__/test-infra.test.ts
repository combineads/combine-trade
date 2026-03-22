import { describe, expect, test } from "bun:test";
import { isContinuous } from "@combine/candle";
import { generateCandles } from "../candle-generator.js";
import { createTestDbConfig } from "../db-lifecycle.js";
import { sampleStrategyCode, sampleStrategyMeta } from "../fixtures/sample-strategy.js";

describe("Candle generator", () => {
	test("generates specified number of candles", () => {
		const candles = generateCandles({ count: 50 });
		expect(candles.length).toBe(50);
	});

	test("generated candles have realistic OHLCV relationships", () => {
		const candles = generateCandles({ count: 100 });
		for (const c of candles) {
			const high = Number(c.high);
			const low = Number(c.low);
			const open = Number(c.open);
			const close = Number(c.close);
			expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
			expect(low).toBeLessThanOrEqual(Math.min(open, close));
			expect(Number(c.volume)).toBeGreaterThan(0);
		}
	});

	test("generated candles pass continuity validation", () => {
		const candles = generateCandles({ count: 100 });
		expect(isContinuous(candles)).toBe(true);
	});

	test("deterministic with same seed", () => {
		const a = generateCandles({ count: 10, seed: 123 });
		const b = generateCandles({ count: 10, seed: 123 });
		expect(a.map((c) => c.close)).toEqual(b.map((c) => c.close));
	});

	test("different seeds produce different data", () => {
		const a = generateCandles({ count: 10, seed: 1 });
		const b = generateCandles({ count: 10, seed: 2 });
		expect(a[5]!.close).not.toBe(b[5]!.close);
	});

	test("supports different timeframes", () => {
		const candles = generateCandles({ timeframe: "1h", count: 5 });
		const diff = candles[1]!.openTime.getTime() - candles[0]!.openTime.getTime();
		expect(diff).toBe(3_600_000);
	});
});

describe("Mock adapter", async () => {
	const { MockExchangeAdapter } = await import("@combine/exchange/testing/mock-adapter");

	test("fetchOHLCV returns configured candles", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [{ timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 50 }],
		});
		const result = await adapter.fetchOHLCV("BTCUSDT", "1m");
		expect(result.length).toBe(1);
		expect(result[0]!.close).toBe(105);
		expect(adapter.calls[0]!.method).toBe("fetchOHLCV");
	});

	test("createOrder returns mock order with incremented id", async () => {
		const adapter = new MockExchangeAdapter();
		const order1 = await adapter.createOrder("BTCUSDT", "market", "buy", 0.1);
		const order2 = await adapter.createOrder("ETHUSDT", "limit", "sell", 1, 3000);
		expect(order1.id).toBe("mock-order-1");
		expect(order2.id).toBe("mock-order-2");
		expect(order2.price).toBe(3000);
	});

	test("fetchBalance returns configured balance", async () => {
		const adapter = new MockExchangeAdapter({
			balance: [{ currency: "BTC", free: 1, used: 0.5, total: 1.5 }],
		});
		const balances = await adapter.fetchBalance();
		expect(balances[0]!.currency).toBe("BTC");
		expect(balances[0]!.total).toBe(1.5);
	});
});

describe("Test DB config", () => {
	test("creates unique schema name per suite", () => {
		const a = createTestDbConfig("suite-a");
		const b = createTestDbConfig("suite-b");
		expect(a.schemaName).not.toBe(b.schemaName);
		expect(a.schemaName).toContain("test_suite-a");
	});
});

describe("Sample strategy fixture", () => {
	test("strategy metadata has required fields", () => {
		expect(sampleStrategyMeta.id).toBeDefined();
		expect(sampleStrategyMeta.name).toBe("SMA Cross");
		expect(sampleStrategyMeta.version).toBe(1);
		expect(sampleStrategyMeta.executionMode).toBe("paper");
	});

	test("strategy code contains evaluate function", () => {
		expect(sampleStrategyCode).toContain("export function evaluate");
		expect(sampleStrategyCode).toContain("direction");
	});
});
