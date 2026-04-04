import { IndicatorsSync } from "@ixjb94/indicators";
import { BB4_CONFIG, BB20_CONFIG } from "@/core/constants";
import { d } from "@/core/decimal";
import type { Candle } from "@/core/types";
import type { BollingerResult } from "./types";

const ind = new IndicatorsSync();

// Capture structural anchor values at module load time.
// These are code-fixed constants — they must never change at runtime.
const BB20_LENGTH = BB20_CONFIG.length;
const BB20_STDDEV = BB20_CONFIG.stddev;
const BB4_LENGTH = BB4_CONFIG.length;
const BB4_STDDEV = BB4_CONFIG.stddev;
const BB4_SOURCE = BB4_CONFIG.source;

/**
 * Extracts close prices from a Candle array as plain numbers.
 * Numbers are required here because @ixjb94/indicators accepts number[].
 * WARNING: Only use for passing to external indicator libraries — never for
 * monetary arithmetic.
 */
export function candlesToCloses(candles: Candle[]): number[] {
  return candles.map((c) => c.close.toNumber());
}

/**
 * Extracts open prices from a Candle array as plain numbers.
 * Numbers are required here because @ixjb94/indicators accepts number[].
 * WARNING: Only use for passing to external indicator libraries — never for
 * monetary arithmetic.
 */
export function candlesToOpens(candles: Candle[]): number[] {
  return candles.map((c) => c.open.toNumber());
}

/**
 * Generic Bollinger Band calculation.
 *
 * Returns null when there are fewer data points than the required period,
 * or when the library returns NaN values (e.g., at warm-up indices).
 */
export function calcBB(
  closes: number[],
  length: number,
  stddev: number,
  currentClose: number,
): BollingerResult | null {
  if (closes.length < length) return null;

  const result = ind.bbands(closes, length, stddev);
  // bbands returns [lower[], middle[], upper[]]
  const lowerArr = result[0];
  const middleArr = result[1];
  const upperArr = result[2];

  if (!lowerArr || !middleArr || !upperArr) return null;

  // Get the last values (most recent)
  const lower = lowerArr[lowerArr.length - 1];
  const middle = middleArr[middleArr.length - 1];
  const upper = upperArr[upperArr.length - 1];

  if (
    lower === undefined ||
    middle === undefined ||
    upper === undefined ||
    Number.isNaN(lower) ||
    Number.isNaN(middle) ||
    Number.isNaN(upper) ||
    middle === 0
  ) {
    return null;
  }

  const bandwidth = (upper - lower) / middle;
  const range = upper - lower;
  const percentB = range === 0 ? 0.5 : (currentClose - lower) / range;

  return {
    upper: d(upper.toString()),
    middle: d(middle.toString()),
    lower: d(lower.toString()),
    bandwidth: d(bandwidth.toString()),
    percentB: d(percentB.toString()),
  };
}

/**
 * Calculates BB20 (20-period, 2-stddev) for the given candle series.
 * Uses the last candle's close as currentClose for percentB.
 * Returns null if the series is shorter than BB20_CONFIG.length.
 */
export function calcBB20(candles: Candle[]): BollingerResult | null {
  if (candles.length < BB20_LENGTH) return null;
  const closes = candlesToCloses(candles);
  const currentClose = closes[closes.length - 1];
  if (currentClose === undefined) return null;
  return calcBB(closes, BB20_LENGTH, BB20_STDDEV, currentClose);
}

/**
 * Calculates BB4 (4-period, 4-stddev) for the given candle series.
 * Uses open prices as the source (BB4_CONFIG.source = "open").
 * Uses the last candle's open as the currentClose argument for percentB.
 * Returns null if the series is shorter than BB4_CONFIG.length.
 */
export function calcBB4(candles: Candle[]): BollingerResult | null {
  if (candles.length < BB4_LENGTH) return null;
  const prices = BB4_SOURCE === "open" ? candlesToOpens(candles) : candlesToCloses(candles);
  const currentPrice = prices[prices.length - 1];
  if (currentPrice === undefined) return null;
  return calcBB(prices, BB4_LENGTH, BB4_STDDEV, currentPrice);
}
