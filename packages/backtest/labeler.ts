import type { Candle } from "@combine/candle";
import type { CandleBar, LabelResult } from "@combine/core/label";
import { labelEvent } from "@combine/core/label";
import type { BacktestEvent } from "./types.js";

export interface ResultConfig {
	tpPct: number;
	slPct: number;
	maxHoldBars: number;
}

/** Extract forward candles starting after fromIndex, capped at maxBars. */
export function toForwardCandles(
	allCandles: Candle[],
	fromIndex: number,
	maxBars: number,
): CandleBar[] {
	const start = fromIndex + 1;
	const end = Math.min(start + maxBars, allCandles.length);
	const slice: CandleBar[] = [];
	for (let i = start; i < end; i++) {
		const c = allCandles[i]!;
		slice.push({ open: c.open, high: c.high, low: c.low, close: c.close });
	}
	return slice;
}

/** Label a backtest event using forward candles from the full candle array. */
export function labelBacktestEvent(
	event: BacktestEvent,
	allCandles: Candle[],
	resultConfig: ResultConfig,
): LabelResult {
	const forwardCandles = toForwardCandles(allCandles, event.candleIndex, resultConfig.maxHoldBars);

	return labelEvent({
		entryPrice: event.entryPrice,
		direction: event.direction,
		tpPct: resultConfig.tpPct,
		slPct: resultConfig.slPct,
		maxHoldBars: resultConfig.maxHoldBars,
		forwardCandles,
	});
}
