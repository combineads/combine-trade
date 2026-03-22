import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * On-Balance Volume.
 * Cumulative volume with sign based on close-to-close direction.
 */
export async function obv(close: number[], volume: number[]): Promise<IndicatorResult> {
	if (close.length < 2) return [];
	return indicators.obv(close, volume);
}
