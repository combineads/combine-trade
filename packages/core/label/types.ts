/** A single candle bar for forward scanning */
export interface CandleBar {
	open: string;
	high: string;
	low: string;
	close: string;
}

/** Input for the labeler */
export interface LabelInput {
	entryPrice: string;
	direction: "long" | "short";
	tpPct: number; // Take profit percentage (e.g., 2.0 = 2%)
	slPct: number; // Stop loss percentage (e.g., 1.0 = 1%)
	maxHoldBars: number;
	forwardCandles: CandleBar[];
}

/** Result type for labeled events */
export type ResultType = "WIN" | "LOSS" | "TIME_EXIT";

/** Output from the labeler */
export interface LabelResult {
	resultType: ResultType;
	pnlPct: number;
	mfePct: number;
	maePct: number;
	holdBars: number;
	exitPrice: string;
	slHitFirst: boolean;
}
