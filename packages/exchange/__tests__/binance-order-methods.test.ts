import { describe, expect, test, mock, beforeEach } from "bun:test";
import ccxt from "ccxt";
import { BinanceAdapter } from "../binance/adapter.js";
import { UserError, RetryableError } from "@combine/shared";

/**
 * Creates a BinanceAdapter with its internal CCXT instance mocked.
 * We access the private field via cast to inject mocks.
 */
function createMockedAdapter() {
	const adapter = new BinanceAdapter({ apiKey: "test", apiSecret: "test" });
	// biome-ignore lint/suspicious/noExplicitAny: test mock access
	const internal = adapter as any;
	const ccxtMock = internal.ccxt;
	return { adapter, ccxtMock };
}

describe("BinanceAdapter.createOrder", () => {
	test("creates a market order and maps response", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() =>
			Promise.resolve({
				id: "123456",
				symbol: "BTC/USDT:USDT",
				side: "buy",
				type: "market",
				price: 50000,
				amount: 0.1,
				filled: 0.1,
				status: "closed",
				timestamp: 1704067200000,
			}),
		);

		const result = await adapter.createOrder("BTC/USDT:USDT", "market", "buy", 0.1);

		expect(result.id).toBe("123456");
		expect(result.symbol).toBe("BTC/USDT:USDT");
		expect(result.side).toBe("buy");
		expect(result.type).toBe("market");
		expect(result.price).toBe(50000);
		expect(result.amount).toBe(0.1);
		expect(result.filled).toBe(0.1);
		expect(result.status).toBe("closed");
		expect(result.timestamp).toBe(1704067200000);
	});

	test("creates a limit order with price", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() =>
			Promise.resolve({
				id: "789",
				symbol: "BTC/USDT:USDT",
				side: "sell",
				type: "limit",
				price: 55000,
				amount: 0.05,
				filled: 0,
				status: "open",
				timestamp: 1704067200000,
			}),
		);

		const result = await adapter.createOrder("BTC/USDT:USDT", "limit", "sell", 0.05, 55000);
		expect(result.type).toBe("limit");
		expect(result.price).toBe(55000);
		expect(result.status).toBe("open");
	});

	test("throws UserError on InsufficientFunds", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.InsufficientFunds("Insufficient funds");
		});

		await expect(adapter.createOrder("BTC/USDT:USDT", "market", "buy", 100)).rejects.toThrow(
			UserError,
		);

		try {
			await adapter.createOrder("BTC/USDT:USDT", "market", "buy", 100);
		} catch (err) {
			expect((err as UserError).code).toBe("ERR_USER_INSUFFICIENT_FUNDS");
		}
	});

	test("throws UserError on InvalidOrder", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.InvalidOrder("Invalid order params");
		});

		await expect(adapter.createOrder("BTC/USDT:USDT", "market", "buy", 0.001)).rejects.toThrow(
			UserError,
		);
	});

	test("throws UserError on BadSymbol", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.BadSymbol("Bad symbol: XXXUSDT");
		});

		await expect(adapter.createOrder("XXXUSDT", "market", "buy", 1)).rejects.toThrow(UserError);
	});

	test("throws RetryableError on RequestTimeout", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.RequestTimeout("Request timed out");
		});

		await expect(adapter.createOrder("BTC/USDT:USDT", "market", "buy", 0.1)).rejects.toThrow(
			RetryableError,
		);
	});

	test("throws RetryableError on NetworkError", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.createOrder = mock(() => {
			throw new ccxt.NetworkError("Network error");
		});

		await expect(adapter.createOrder("BTC/USDT:USDT", "market", "buy", 0.1)).rejects.toThrow(
			RetryableError,
		);
	});
});

describe("BinanceAdapter.cancelOrder", () => {
	test("cancels an order successfully", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.cancelOrder = mock(() => Promise.resolve({}));

		await expect(adapter.cancelOrder("123", "BTC/USDT:USDT")).resolves.toBeUndefined();
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

		await expect(adapter.cancelOrder("123", "BTC/USDT:USDT")).rejects.toThrow(RetryableError);
	});
});

describe("BinanceAdapter.fetchBalance", () => {
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

describe("BinanceAdapter.fetchPositions", () => {
	test("returns positions array", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchPositions = mock(() =>
			Promise.resolve([
				{
					symbol: "BTC/USDT:USDT",
					side: "long",
					contracts: 0.1,
					entryPrice: 50000,
					unrealizedPnl: 100,
					leverage: 10,
				},
			]),
		);

		const result = await adapter.fetchPositions(["BTC/USDT:USDT"]);

		expect(result).toHaveLength(1);
		expect(result[0]!.symbol).toBe("BTC/USDT:USDT");
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
					symbol: "BTC/USDT:USDT",
					side: "long",
					contracts: 0.1,
					entryPrice: 50000,
					unrealizedPnl: 100,
					leverage: 10,
				},
				{
					symbol: "ETH/USDT:USDT",
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
		expect(result[0]!.symbol).toBe("BTC/USDT:USDT");
	});

	test("throws RetryableError on NetworkError", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchPositions = mock(() => {
			throw new ccxt.NetworkError("Network error");
		});

		await expect(adapter.fetchPositions()).rejects.toThrow(RetryableError);
	});
});

describe("BinanceAdapter.fetchFundingRate", () => {
	test("returns funding rate", async () => {
		const { adapter, ccxtMock } = createMockedAdapter();

		ccxtMock.fetchFundingRate = mock(() =>
			Promise.resolve({
				symbol: "BTC/USDT:USDT",
				fundingRate: 0.0001,
				nextFundingTimestamp: 1704070800000,
			}),
		);

		const result = await adapter.fetchFundingRate("BTC/USDT:USDT");

		expect(result.symbol).toBe("BTC/USDT:USDT");
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

		await expect(adapter.fetchFundingRate("BTC/USDT:USDT")).rejects.toThrow(RetryableError);
	});
});
