/** OHLCV candle data for indicator calculations */
export interface OHLCVInput {
	open: number[];
	high: number[];
	low: number[];
	close: number[];
	volume: number[];
}

/** Simple array result from indicator calculation */
export type IndicatorResult = number[];

/** Bollinger Bands result */
export interface BollingerBandsResult {
	upper: number[];
	middle: number[];
	lower: number[];
}
