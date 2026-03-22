import { Indicators } from "@ixjb94/indicators";
import type { BollingerBandsResult } from "./types.js";

const indicators = new Indicators();

/**
 * Bollinger Bands (middle = SMA, upper/lower = middle +/- stddev * multiplier).
 * Uses native float (not Decimal.js) per ARCHITECTURE.md § Decimal precision boundary.
 */
export async function bb(
	source: number[],
	period: number,
	stddev = 2,
): Promise<BollingerBandsResult> {
	const result = await indicators.bbands(source, period, stddev);
	return {
		lower: result[0] ?? [],
		middle: result[1] ?? [],
		upper: result[2] ?? [],
	};
}
