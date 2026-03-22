import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * Average True Range (Wilder's smoothed True Range).
 * Requires high[], low[], close[] arrays.
 */
export async function atr(
	high: number[],
	low: number[],
	close: number[],
	period = 14,
): Promise<IndicatorResult> {
	if (high.length < period + 1) return [];
	return indicators.atr(high, low, close, period);
}
