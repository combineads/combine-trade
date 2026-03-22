import { UserError } from "@combine/shared";
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
			if (err instanceof ccxt.BadSymbol) {
				throw new UserError("ERR_USER_INVALID_SYMBOL", `Invalid symbol: ${symbol}`);
			}
			if (err instanceof ccxt.RequestTimeout || err instanceof ccxt.NetworkError) {
				const { RetryableError } = await import("@combine/shared");
				throw new RetryableError(
					"ERR_RETRY_EXCHANGE_TIMEOUT",
					`Exchange timeout: ${(err as Error).message}`,
				);
			}
			throw err;
		}
	}

	async createOrder(
		_symbol: string,
		_type: OrderType,
		_side: OrderSide,
		_amount: number,
		_price?: number,
	): Promise<ExchangeOrder> {
		throw new UserError("ERR_USER_NOT_IMPLEMENTED", "createOrder not implemented — EP06");
	}

	async cancelOrder(_orderId: string, _symbol: string): Promise<void> {
		throw new UserError("ERR_USER_NOT_IMPLEMENTED", "cancelOrder not implemented — EP06");
	}

	async fetchBalance(): Promise<ExchangeBalance[]> {
		throw new UserError("ERR_USER_NOT_IMPLEMENTED", "fetchBalance not implemented — EP06");
	}

	async fetchPositions(_symbols?: string[]): Promise<ExchangePosition[]> {
		throw new UserError("ERR_USER_NOT_IMPLEMENTED", "fetchPositions not implemented — EP06");
	}

	async fetchFundingRate(_symbol: string): Promise<ExchangeFundingRate> {
		throw new UserError("ERR_USER_NOT_IMPLEMENTED", "fetchFundingRate not implemented — EP06");
	}

	/** Close the CCXT instance */
	async close(): Promise<void> {
		await this.ccxt.close();
	}
}
