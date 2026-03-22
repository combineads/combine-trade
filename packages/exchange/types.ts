import type { Exchange, Timeframe } from "@combine/shared";

/** OHLCV candle data from exchange */
export interface ExchangeCandle {
	timestamp: number; // Unix ms
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/** Order side */
export type OrderSide = "buy" | "sell";

/** Order type */
export type OrderType = "market" | "limit";

/** Order response from exchange */
export interface ExchangeOrder {
	id: string;
	symbol: string;
	side: OrderSide;
	type: OrderType;
	price: number;
	amount: number;
	filled: number;
	status: "open" | "closed" | "canceled";
	timestamp: number;
}

/** Balance info */
export interface ExchangeBalance {
	currency: string;
	free: number;
	used: number;
	total: number;
}

/** Position info */
export interface ExchangePosition {
	symbol: string;
	side: "long" | "short";
	size: number;
	entryPrice: number;
	unrealizedPnl: number;
	leverage: number;
}

/** Funding rate info */
export interface ExchangeFundingRate {
	symbol: string;
	fundingRate: number;
	nextFundingTime: number;
}

/** Exchange adapter interface — implemented by both real CCXT and mock adapter */
export interface ExchangeAdapter {
	readonly exchange: Exchange;

	fetchOHLCV(
		symbol: string,
		timeframe: Timeframe,
		since?: number,
		limit?: number,
	): Promise<ExchangeCandle[]>;

	createOrder(
		symbol: string,
		type: OrderType,
		side: OrderSide,
		amount: number,
		price?: number,
	): Promise<ExchangeOrder>;

	cancelOrder(orderId: string, symbol: string): Promise<void>;

	fetchBalance(): Promise<ExchangeBalance[]>;

	fetchPositions(symbols?: string[]): Promise<ExchangePosition[]>;

	fetchFundingRate(symbol: string): Promise<ExchangeFundingRate>;
}
