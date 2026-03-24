import { describe, expect, mock, test } from "bun:test";
import { RetryableError, UserError } from "@combine/shared";
import ccxt from "ccxt";
import { OkxFuturesAdapter, mapOhlcvRow } from "../adapters/okx-futures.js";

/**
 * Creates an OkxFuturesAdapter with its internal CCXT instance mocked.
 * Access private field via cast to inject mocks.
 */
function createMockedAdapter() {
	const adapter = new OkxFuturesAdapter({ apiKey: "test", apiSecret: "test", password: "test" });
	// biome-ignore lint/suspicious/noExplicitAny: test mock access
	const internal = adapter as any;
	const ccxtMock = internal.ccxt;
	return { adapter, ccxtMock };
}

describe("mapOhlcvRow (OKX)", () => {
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

describe("OkxFuturesAdapter", () => {
	test("exchange property is okx", () => {
		const adapter = new OkxFuturesAdapter();
		expect(adapter.exchange).toBe("okx");
	});

	test("createOrder is implemented", () => {
		const adapter = new OkxFuturesAdapter();
		expect(typeof adapter.createOrder).toBe("function");
	});

	test("fetchBalance is implemented", () => {
		const adapter = new OkxFuturesAdapter();
		expect(typeof adapter.fetchBalance).toBe("function");
	});

	test("accepts OKX-specific contract type config", () => {
		const adapter = new OkxFuturesAdapter({ contractType: "swap" });
		expect(adapter.exchange).toBe("okx");
	});

	test("accepts margin mode config", () => {
		const adapter = new OkxFuturesAdapter({ marginMode: "cross" });
		expect(adapter.exchange).toBe("okx");
	});
});

describe("OkxFuturesAdapter.fetchOHLCV", () => {
	test("fetches and maps OHLCV data", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchOHLCV = mock(() =>
			Promise.resolve([
				[1704067200000, 42500.5, 42600.0, 42400.0, 42550.0, 150.5],
				[1704067260000, 42550.0, 42700.0, 42500.0, 42650.0, 200.0],
			]),
		);

		const candles = await adapter.fetchOHLCV("BTC-USDT-SWAP", "1m", undefined, 2);

		expect(candles).toHaveLength(2);
		expect(candles[0]!.timestamp).toBe(1704067200000);
		expect(candles[0]!.open).toBe(42500.5);
		expect(candles[1]!.close).toBe(42650.0);
	});

	test("passes since and limit to CCXT", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();
		let capturedArgs: unknown[] = [];

		ccxtMock.fetchOHLCV = mock((...args: unknown[]) => {
			capturedArgs = args;
			return Promise.resolve([]);
		});

		await adapter.fetchOHLCV("BTC-USDT-SWAP", "5m", 1704067200000, 10);

		expect(capturedArgs[0]).toBe("BTC-USDT-SWAP");
		expect(capturedArgs[1]).toBe("5m");
		expect(capturedArgs[2]).toBe(1704067200000);
		expect(capturedArgs[3]).toBe(10);
	});

	test("throws UserError on BadSymbol", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchOHLCV = mock(() => {
			throw new ccxt.BadSymbol("Bad symbol: XXXUSDT");
		});

		await expect(adapter.fetchOHLCV("XXXUSDT", "1m")).rejects.toThrow(UserError);
	});

	test("throws RetryableError on RequestTimeout", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchOHLCV = mock(() => {
			throw new ccxt.RequestTimeout("Timeout");
		});

		await expect(adapter.fetchOHLCV("BTC-USDT-SWAP", "1m")).rejects.toThrow(RetryableError);
	});

	test("throws RetryableError on NetworkError", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchOHLCV = mock(() => {
			throw new ccxt.NetworkError("Network error");
		});

		await expect(adapter.fetchOHLCV("BTC-USDT-SWAP", "1m")).rejects.toThrow(RetryableError);
	});
});

describe("OkxFuturesAdapter.createOrder", () => {
	test("creates a market order and maps response", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() =>
			Promise.resolve({
				id: "okx-123456",
				symbol: "BTC-USDT-SWAP",
				side: "buy",
				type: "market",
				price: 50000,
				amount: 0.1,
				filled: 0.1,
				status: "closed",
				timestamp: 1704067200000,
			}),
		);

		const result = await adapter.createOrder("BTC-USDT-SWAP", "market", "buy", 0.1);

		expect(result.id).toBe("okx-123456");
		expect(result.symbol).toBe("BTC-USDT-SWAP");
		expect(result.side).toBe("buy");
		expect(result.type).toBe("market");
		expect(result.status).toBe("closed");
	});

	test("creates a limit order with price", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() =>
			Promise.resolve({
				id: "okx-789",
				symbol: "BTC-USDT-SWAP",
				side: "sell",
				type: "limit",
				price: 55000,
				amount: 0.05,
				filled: 0,
				status: "open",
				timestamp: 1704067200000,
			}),
		);

		const result = await adapter.createOrder("BTC-USDT-SWAP", "limit", "sell", 0.05, 55000);
		expect(result.type).toBe("limit");
		expect(result.price).toBe(55000);
		expect(result.status).toBe("open");
	});

	test("throws UserError on InsufficientFunds", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.InsufficientFunds("Insufficient funds");
		});

		await expect(adapter.createOrder("BTC-USDT-SWAP", "market", "buy", 100)).rejects.toThrow(
			UserError,
		);

		try {
			await adapter.createOrder("BTC-USDT-SWAP", "market", "buy", 100);
		} catch (err) {
			expect((err as UserError).code).toBe("ERR_USER_INSUFFICIENT_FUNDS");
		}
	});

	test("throws UserError on InvalidOrder", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.InvalidOrder("Invalid order params");
		});

		await expect(
			adapter.createOrder("BTC-USDT-SWAP", "market", "buy", 0.001),
		).rejects.toThrow(UserError);
	});

	test("throws RetryableError on RequestTimeout", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.RequestTimeout("Timeout");
		});

		await expect(
			adapter.createOrder("BTC-USDT-SWAP", "market", "buy", 0.1),
		).rejects.toThrow(RetryableError);
	});
});

describe("OkxFuturesAdapter.cancelOrder", () => {
	test("cancels an order successfully", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.cancelOrder = mock(() => Promise.resolve({}));

		await expect(adapter.cancelOrder("okx-123", "BTC-USDT-SWAP")).resolves.toBeUndefined();
	});

	test("throws UserError on BadSymbol", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.cancelOrder = mock(() => {
			throw new ccxt.BadSymbol("Bad symbol");
		});

		await expect(adapter.cancelOrder("123", "XXXUSDT")).rejects.toThrow(UserError);
	});

	test("throws RetryableError on NetworkError", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.cancelOrder = mock(() => {
			throw new ccxt.NetworkError("Network error");
		});

		await expect(adapter.cancelOrder("123", "BTC-USDT-SWAP")).rejects.toThrow(RetryableError);
	});
});

describe("OkxFuturesAdapter.fetchBalance", () => {
	test("returns balance array", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchBalance = mock(() =>
			Promise.resolve({
				info: {},
				USDT: { free: 5000, used: 1000, total: 6000 },
				BTC: { free: 0.5, used: 0.1, total: 0.6 },
				free: { USDT: 5000, BTC: 0.5 },
				used: { USDT: 1000, BTC: 0.1 },
				total: { USDT: 6000, BTC: 0.6 },
			}),
		);

		const result = await adapter.fetchBalance();

		expect(result.length).toBeGreaterThanOrEqual(2);
		const usdt = result.find((b) => b.currency === "USDT");
		expect(usdt).toBeDefined();
		expect(usdt!.free).toBe(5000);
		expect(usdt!.used).toBe(1000);
		expect(usdt!.total).toBe(6000);
	});

	test("filters out zero-balance currencies", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchBalance = mock(() =>
			Promise.resolve({
				info: {},
				USDT: { free: 5000, used: 0, total: 5000 },
				ETH: { free: 0, used: 0, total: 0 },
				free: { USDT: 5000, ETH: 0 },
				used: { USDT: 0, ETH: 0 },
				total: { USDT: 5000, ETH: 0 },
			}),
		);

		const result = await adapter.fetchBalance();
		const eth = result.find((b) => b.currency === "ETH");
		expect(eth).toBeUndefined();
	});

	test("throws RetryableError on RequestTimeout", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchBalance = mock(() => {
			throw new ccxt.RequestTimeout("Timeout");
		});

		await expect(adapter.fetchBalance()).rejects.toThrow(RetryableError);
	});
});

describe("OkxFuturesAdapter.fetchPositions", () => {
	test("returns positions array", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchPositions = mock(() =>
			Promise.resolve([
				{
					symbol: "BTC-USDT-SWAP",
					side: "long",
					contracts: 0.1,
					entryPrice: 50000,
					unrealizedPnl: 100,
					leverage: 10,
				},
			]),
		);

		const result = await adapter.fetchPositions(["BTC-USDT-SWAP"]);

		expect(result).toHaveLength(1);
		expect(result[0]!.symbol).toBe("BTC-USDT-SWAP");
		expect(result[0]!.side).toBe("long");
		expect(result[0]!.size).toBe(0.1);
		expect(result[0]!.entryPrice).toBe(50000);
		expect(result[0]!.unrealizedPnl).toBe(100);
		expect(result[0]!.leverage).toBe(10);
	});

	test("filters out empty positions", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchPositions = mock(() =>
			Promise.resolve([
				{
					symbol: "BTC-USDT-SWAP",
					side: "long",
					contracts: 0.1,
					entryPrice: 50000,
					unrealizedPnl: 100,
					leverage: 10,
				},
				{
					symbol: "ETH-USDT-SWAP",
					side: "long",
					contracts: 0,
					entryPrice: 0,
					unrealizedPnl: 0,
					leverage: 10,
				},
			]),
		);

		const result = await adapter.fetchPositions();
		expect(result).toHaveLength(1);
		expect(result[0]!.symbol).toBe("BTC-USDT-SWAP");
	});

	test("throws RetryableError on NetworkError", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchPositions = mock(() => {
			throw new ccxt.NetworkError("Network error");
		});

		await expect(adapter.fetchPositions()).rejects.toThrow(RetryableError);
	});
});

describe("OkxFuturesAdapter.fetchFundingRate", () => {
	test("returns funding rate", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchFundingRate = mock(() =>
			Promise.resolve({
				symbol: "BTC-USDT-SWAP",
				fundingRate: 0.0001,
				nextFundingTimestamp: 1704070800000,
			}),
		);

		const result = await adapter.fetchFundingRate("BTC-USDT-SWAP");

		expect(result.symbol).toBe("BTC-USDT-SWAP");
		expect(result.fundingRate).toBe(0.0001);
		expect(result.nextFundingTime).toBe(1704070800000);
	});

	test("throws UserError on BadSymbol", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchFundingRate = mock(() => {
			throw new ccxt.BadSymbol("Bad symbol");
		});

		await expect(adapter.fetchFundingRate("XXXUSDT")).rejects.toThrow(UserError);
	});

	test("throws RetryableError on RequestTimeout", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchFundingRate = mock(() => {
			throw new ccxt.RequestTimeout("Timeout");
		});

		await expect(adapter.fetchFundingRate("BTC-USDT-SWAP")).rejects.toThrow(RetryableError);
	});
});
