import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * Simple Moving Average.
 * Uses native float (not Decimal.js) per ARCHITECTURE.md § Decimal precision boundary.
 */
export async function sma(source: number[], period: number): Promise<IndicatorResult> {
	return indicators.sma(source, period);
}
