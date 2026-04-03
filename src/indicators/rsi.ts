import { IndicatorsSync } from "@ixjb94/indicators";
import type { Decimal } from "@/core/decimal";
import { d } from "@/core/decimal";

const ind = new IndicatorsSync();

export const RSI_DEFAULT_PERIOD = 14;

/**
 * Calculates the most recent RSI value for the given close price series.
 *
 * Returns null when there are fewer data points than period + 1 (minimum warm-up),
 * or when the library returns NaN (e.g., at initial warm-up indices).
 * Result is clamped to [0, 100].
 */
export function calcRSI(closes: number[], period: number = RSI_DEFAULT_PERIOD): Decimal | null {
  if (closes.length < period + 1) return null;
  const result = ind.rsi(closes, period);
  const last = result[result.length - 1];
  if (last === undefined || Number.isNaN(last)) return null;
  const clamped = Math.max(0, Math.min(100, last));
  return d(clamped.toString());
}

/**
 * Calculates the full RSI series for the given close price series.
 *
 * Returns an empty array when there are fewer data points than period + 1.
 * NaN values are filtered out. Each value is clamped to [0, 100].
 */
export function calcRSISeries(closes: number[], period: number = RSI_DEFAULT_PERIOD): Decimal[] {
  if (closes.length < period + 1) return [];
  const result = ind.rsi(closes, period);
  return result
    .filter((v) => !Number.isNaN(v))
    .map((v) => d(Math.max(0, Math.min(100, v)).toString()));
}
