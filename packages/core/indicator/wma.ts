import type { IndicatorResult } from "./types.js";

/**
 * Weighted Moving Average.
 * Formula: sum(price_i * weight_i) / sum(weights)
 * Weights = [1, 2, 3, ..., period] — most recent price gets highest weight.
 * Uses native float (not Decimal.js) per ARCHITECTURE.md § Decimal precision boundary.
 */
export function wma(source: number[], period: number): Promise<IndicatorResult> {
	if (period > source.length) return Promise.resolve([]);

	const denominator = (period * (period + 1)) / 2;
	const result: number[] = [];

	for (let i = period - 1; i < source.length; i++) {
		let weighted = 0;
		for (let j = 0; j < period; j++) {
			// weight for position j (oldest=1, newest=period)
			const weight = j + 1;
			weighted += source[i - (period - 1) + j]! * weight;
		}
		result.push(weighted / denominator);
	}

	return Promise.resolve(result);
}
