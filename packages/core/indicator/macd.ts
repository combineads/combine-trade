import { Indicators } from "@ixjb94/indicators";
import type { MACDResult } from "./types.js";

const indicators = new Indicators();

/**
 * MACD (Moving Average Convergence Divergence).
 * MACD line = EMA(short) - EMA(long), signal = EMA(signal) of MACD, histogram = MACD - signal.
 * Uses native float per ARCHITECTURE.md § Decimal precision boundary.
 */
export async function macd(
	source: number[],
	shortPeriod = 12,
	longPeriod = 26,
	signalPeriod = 9,
): Promise<MACDResult> {
	if (source.length < longPeriod + signalPeriod) {
		return { macd: [], signal: [], histogram: [] };
	}
	const result = await indicators.macd(source, shortPeriod, longPeriod, signalPeriod);
	return {
		macd: result[0] ?? [],
		signal: result[1] ?? [],
		histogram: result[2] ?? [],
	};
}
