import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * Exponential Moving Average.
 * Uses native float (not Decimal.js) per ARCHITECTURE.md § Decimal precision boundary.
 */
export async function ema(source: number[], period: number): Promise<IndicatorResult> {
	return indicators.ema(source, period);
}
