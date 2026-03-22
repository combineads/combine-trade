import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * Volume Weighted Average Price.
 * VWAP = Cumulative(Typical Price * Volume) / Cumulative(Volume)
 * @param period - Rolling window size. Defaults to full series length (session VWAP).
 */
export async function vwap(
	high: number[],
	low: number[],
	close: number[],
	volume: number[],
	period?: number,
): Promise<IndicatorResult> {
	if (high.length < 1) return [];
	const p = period ?? high.length;
	return indicators.vwap(high, low, close, volume, p);
}
