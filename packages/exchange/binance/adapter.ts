import { UserError, RetryableError } from "@combine/shared";
import type { Timeframe } from "@combine/shared";
import ccxt from "ccxt";
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

function mapCcxtOrderStatus(status: string | undefined): "open" | "closed" | "canceled" {
	if (status === "canceled" || status === "cancelled") return "canceled";
	if (status === "closed") return "closed";
	return "open";
}

/** Map a CCXT OHLCV row [timestamp, open, high, low, close, volume] to ExchangeCandle */
export function mapOhlcvRow(row: number[]): ExchangeCandle {
	return {
		timestamp: row[0]!,
		open: row[1]!,
		high: row[2]!,
		low: row[3]!,
		close: row[4]!,
		volume: row[5]!,
	};
}

interface BinanceAdapterOptions {
	apiKey?: string;
	apiSecret?: string;
}

/**
 * Binance USDT-M Futures adapter wrapping CCXT.
 * Implements ExchangeAdapter for fetchOHLCV.
 * Order methods are stubs until EP06.
 */
export class BinanceAdapter implements ExchangeAdapter {
	readonly exchange = "binance" as const;
	private readonly ccxt: ccxt.binanceusdm;

	constructor(options: BinanceAdapterOptions = {}) {
		const apiKey = options.apiKey ?? process.env.BINANCE_API_KEY;
		const apiSecret = options.apiSecret ?? process.env.BINANCE_API_SECRET;

		this.ccxt = new ccxt.binanceusdm({
			apiKey,
			secret: apiSecret,
			options: {
				defaultType: "future",
			},
		});
	}

	async fetchOHLCV(
		symbol: string,
		timeframe: Timeframe,
		since?: number,
		limit?: number,
	): Promise<ExchangeCandle[]> {
		try {
			const raw = await this.ccxt.fetchOHLCV(symbol, timeframe, since, limit);
			return raw.map((row) => mapOhlcvRow(row as number[]));
		} catch (err) {
			throw this.mapExchangeError(err, "fetchOHLCV");
		}
	}

	async createOrder(
		symbol: string,
		type: OrderType,
		side: OrderSide,
		amount: number,
		price?: number,
	): Promise<ExchangeOrder> {
		try {
			const result = await this.ccxt.createOrder(symbol, type, side, amount, price);
			return {
				id: result.id,
				symbol: result.symbol ?? symbol,
				side: result.side as OrderSide,
				type: result.type as OrderType,
				price: result.price ?? 0,
				amount: result.amount ?? amount,
				filled: result.filled ?? 0,
				status: mapCcxtOrderStatus(result.status),
				timestamp: result.timestamp ?? Date.now(),
			};
		} catch (err) {
			throw this.mapExchangeError(err, "createOrder");
		}
	}

	async cancelOrder(orderId: string, symbol: string): Promise<void> {
		try {
			await this.ccxt.cancelOrder(orderId, symbol);
		} catch (err) {
			throw this.mapExchangeError(err, "cancelOrder");
		}
	}

	async fetchBalance(): Promise<ExchangeBalance[]> {
		try {
			const raw = await this.ccxt.fetchBalance();
			const result: ExchangeBalance[] = [];
			for (const currency of Object.keys(raw.total ?? {})) {
				const total = raw.total?.[currency] ?? 0;
				if (total === 0) continue;
				result.push({
					currency,
					free: raw.free?.[currency] ?? 0,
					used: raw.used?.[currency] ?? 0,
					total,
				});
			}
			return result;
		} catch (err) {
			throw this.mapExchangeError(err, "fetchBalance");
		}
	}

	async fetchPositions(symbols?: string[]): Promise<ExchangePosition[]> {
		try {
			const raw = await this.ccxt.fetchPositions(symbols);
			return raw
				.filter((p) => (p.contracts ?? 0) !== 0)
				.map((p) => ({
					symbol: p.symbol ?? "",
					side: (p.side as "long" | "short") ?? "long",
					size: p.contracts ?? 0,
					entryPrice: p.entryPrice ?? 0,
					unrealizedPnl: p.unrealizedPnl ?? 0,
					leverage: p.leverage ?? 1,
				}));
		} catch (err) {
			throw this.mapExchangeError(err, "fetchPositions");
		}
	}

	async fetchFundingRate(symbol: string): Promise<ExchangeFundingRate> {
		try {
			const raw = await this.ccxt.fetchFundingRate(symbol);
			return {
				symbol: raw.symbol ?? symbol,
				fundingRate: raw.fundingRate ?? 0,
				nextFundingTime: raw.nextFundingTimestamp ?? 0,
			};
		} catch (err) {
			throw this.mapExchangeError(err, "fetchFundingRate");
		}
	}

	private mapExchangeError(err: unknown, method: string): Error {
		if (err instanceof ccxt.BadSymbol) {
			return new UserError("ERR_USER_INVALID_SYMBOL", `Invalid symbol: ${(err as Error).message}`);
		}
		if (err instanceof ccxt.InsufficientFunds) {
			return new UserError("ERR_USER_INSUFFICIENT_FUNDS", `Insufficient funds: ${(err as Error).message}`);
		}
		if (err instanceof ccxt.InvalidOrder) {
			return new UserError("ERR_USER_INVALID_ORDER", `Invalid order: ${(err as Error).message}`);
		}
		if (err instanceof ccxt.RequestTimeout || err instanceof ccxt.NetworkError) {
			return new RetryableError(
				"ERR_RETRY_EXCHANGE_TIMEOUT",
				`Exchange ${method} timeout: ${(err as Error).message}`,
			);
		}
		return err instanceof Error ? err : new Error(String(err));
	}

	/** Close the CCXT instance */
	async close(): Promise<void> {
		await this.ccxt.close();
	}
}
