import { Indicators } from "@ixjb94/indicators";
import type { IndicatorResult } from "./types.js";

const indicators = new Indicators();

/**
 * Relative Strength Index (Wilder's smoothing).
 * Uses native float per ARCHITECTURE.md § Decimal precision boundary.
 */
export async function rsi(source: number[], period = 14): Promise<IndicatorResult> {
	if (source.length < period + 1) return [];
	return indicators.rsi(source, period);
}
