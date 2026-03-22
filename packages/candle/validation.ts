import type { Candle, CandleGap } from "./types.js";
import { TIMEFRAME_MS } from "./types.js";

/**
 * Validates continuity of a sorted candle sequence.
 * Returns an array of detected gaps. Empty array means no gaps.
 */
export function validateContinuity(candles: Candle[]): CandleGap[] {
	if (candles.length <= 1) return [];

	const gaps: CandleGap[] = [];
	const intervalMs = TIMEFRAME_MS[candles[0]!.timeframe];

	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1]!;
		const curr = candles[i]!;
		const expectedTime = new Date(prev.openTime.getTime() + intervalMs);
		const actualTime = curr.openTime;

		if (actualTime.getTime() !== expectedTime.getTime()) {
			let missing = new Date(expectedTime.getTime());
			while (missing.getTime() < actualTime.getTime()) {
				gaps.push({
					expectedTime: new Date(missing.getTime()),
					actualTime,
					timeframe: curr.timeframe,
				});
				missing = new Date(missing.getTime() + intervalMs);
			}
		}
	}

	return gaps;
}

/** Returns true if the candle sequence has no gaps */
export function isContinuous(candles: Candle[]): boolean {
	return validateContinuity(candles).length === 0;
}
