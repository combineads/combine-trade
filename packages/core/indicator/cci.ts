import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * Commodity Channel Index.
 * CCI = (Typical Price - SMA(TP)) / (0.015 * Mean Deviation)
 */
export async function cci(
	high: number[],
	low: number[],
	close: number[],
	period = 20,
): Promise<IndicatorResult> {
	if (high.length < period) return [];
	return indicators.cci(high, low, close, period);
}
