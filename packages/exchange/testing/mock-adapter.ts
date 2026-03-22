import type { Exchange, Timeframe } from "@combine/shared";
import type {
	ExchangeAdapter,
	ExchangeBalance,
	ExchangeCandle,
	ExchangeFundingRate,
	ExchangeOrder,
	ExchangePosition,
	OrderSide,
	OrderType,
} from "../types.js";

interface MockAdapterOptions {
	exchange?: Exchange;
	candles?: ExchangeCandle[];
	balance?: ExchangeBalance[];
	positions?: ExchangePosition[];
	fundingRate?: ExchangeFundingRate;
}

/**
 * Mock CCXT adapter for testing.
 * Returns configurable data; tracks calls for assertion.
 */
export class MockExchangeAdapter implements ExchangeAdapter {
	readonly exchange: Exchange;
	private candles: ExchangeCandle[];
	private balances: ExchangeBalance[];
	private positions: ExchangePosition[];
	private fundingRate: ExchangeFundingRate;
	private orderCounter = 0;

	readonly calls: { method: string; args: unknown[] }[] = [];

	constructor(options: MockAdapterOptions = {}) {
		this.exchange = options.exchange ?? "binance";
		this.candles = options.candles ?? [];
		this.balances = options.balance ?? [{ currency: "USDT", free: 10000, used: 0, total: 10000 }];
		this.positions = options.positions ?? [];
		this.fundingRate = options.fundingRate ?? {
			symbol: "BTCUSDT",
			fundingRate: 0.0001,
			nextFundingTime: Date.now() + 3600_000,
		};
	}

	async fetchOHLCV(
		symbol: string,
		timeframe: Timeframe,
		since?: number,
		limit?: number,
	): Promise<ExchangeCandle[]> {
		this.calls.push({ method: "fetchOHLCV", args: [symbol, timeframe, since, limit] });
		let result = this.candles;
		if (since) {
			result = result.filter((c) => c.timestamp >= since);
		}
		if (limit) {
			result = result.slice(0, limit);
		}
		return result;
	}

	async createOrder(
		symbol: string,
		type: OrderType,
		side: OrderSide,
		amount: number,
		price?: number,
	): Promise<ExchangeOrder> {
		this.calls.push({ method: "createOrder", args: [symbol, type, side, amount, price] });
		this.orderCounter++;
		return {
			id: `mock-order-${this.orderCounter}`,
			symbol,
			side,
			type,
			price: price ?? 50000,
			amount,
			filled: amount,
			status: "closed",
			timestamp: Date.now(),
		};
	}

	async cancelOrder(orderId: string, symbol: string): Promise<void> {
		this.calls.push({ method: "cancelOrder", args: [orderId, symbol] });
	}

	async fetchBalance(): Promise<ExchangeBalance[]> {
		this.calls.push({ method: "fetchBalance", args: [] });
		return this.balances;
	}

	async fetchPositions(symbols?: string[]): Promise<ExchangePosition[]> {
		this.calls.push({ method: "fetchPositions", args: [symbols] });
		if (symbols) {
			return this.positions.filter((p) => symbols.includes(p.symbol));
		}
		return this.positions;
	}

	async fetchFundingRate(symbol: string): Promise<ExchangeFundingRate> {
		this.calls.push({ method: "fetchFundingRate", args: [symbol] });
		return { ...this.fundingRate, symbol };
	}
}
