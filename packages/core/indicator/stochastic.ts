import { Indicators } from "@ixjb94/indicators";
import type { StochasticResult } from "./types.js";

const indicators = new Indicators();

/**
 * Stochastic Oscillator (%K and %D).
 * %K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
 * %D = SMA(%K, dPeriod)
 */
export async function stochastic(
	high: number[],
	low: number[],
	close: number[],
	kPeriod = 14,
	kSlowing = 1,
	dPeriod = 3,
): Promise<StochasticResult> {
	if (high.length < kPeriod) return { k: [], d: [] };
	const result = await indicators.stoch(high, low, close, kPeriod, kSlowing, dPeriod);
	return {
		k: result[0] ?? [],
		d: result[1] ?? [],
	};
}
