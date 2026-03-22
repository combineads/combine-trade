import type { Exchange, Timeframe } from "@combine/shared";

export interface Candle {
	exchange: Exchange;
	symbol: string;
	timeframe: Timeframe;
	openTime: Date;
	open: string;
	high: string;
	low: string;
	close: string;
	volume: string;
	isClosed: boolean;
}

export interface CandleKey {
	exchange: Exchange;
	symbol: string;
	timeframe: Timeframe;
	openTime: Date;
}

export interface CandleGap {
	expectedTime: Date;
	actualTime: Date | null;
	timeframe: Timeframe;
}

/** Timeframe to milliseconds mapping */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
	"1m": 60_000,
	"3m": 180_000,
	"5m": 300_000,
	"15m": 900_000,
	"1h": 3_600_000,
	"4h": 14_400_000,
	"1d": 86_400_000,
};
