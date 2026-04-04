/**
 * Trailing stop pure functions.
 *
 * Calculates trailing SL position based on direction, entry price,
 * and maximum favorable excursion. No DB imports allowed.
 *
 * Formulas (from PRD 7.13):
 *   LONG : new_sl = entry + max_profit x ratio  (SL moves UP)
 *   SHORT: new_sl = entry - max_profit x ratio  (SL moves DOWN)
 */

import type Decimal from "decimal.js";
import { add, d, max, mul, sub } from "@/core/decimal";
import type { Direction } from "@/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default trailing ratio from PRD 7.13 */
export const DEFAULT_TRAILING_RATIO: Decimal = d("0.50");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrailingParams = {
  entryPrice: Decimal;
  maxProfit: Decimal;
  direction: Direction;
  ratio?: Decimal;
};

export type TrailingResult = {
  newSl: Decimal;
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Calculates the trailing stop-loss price.
 *
 * LONG : entry + maxProfit x ratio  (SL above entry)
 * SHORT: entry - maxProfit x ratio  (SL below entry)
 *
 * @param entryPrice  - Position entry price
 * @param maxProfit   - Maximum favorable excursion (must be >= 0)
 * @param direction   - LONG or SHORT
 * @param ratio       - Trailing ratio (default 0.50)
 * @returns New stop-loss price as Decimal
 */
export function calculateTrailingSl(
  entryPrice: Decimal,
  maxProfit: Decimal,
  direction: Direction,
  ratio: Decimal = DEFAULT_TRAILING_RATIO,
): Decimal {
  const offset = mul(maxProfit, ratio);

  if (direction === "LONG") {
    return add(entryPrice, offset);
  }
  return sub(entryPrice, offset);
}

/**
 * Determines whether the trailing SL should be updated.
 * SL only moves in the favorable direction:
 *   LONG : newSl > currentSl  (upward only)
 *   SHORT: newSl < currentSl  (downward only)
 *
 * Equal values return false (no update needed).
 */
export function shouldUpdateTrailingSl(
  currentSl: Decimal,
  newSl: Decimal,
  direction: Direction,
): boolean {
  if (direction === "LONG") {
    return newSl.greaterThan(currentSl);
  }
  return newSl.lessThan(currentSl);
}

/**
 * Calculates the maximum profit (favorable excursion) for a position.
 * Result is clamped to zero -- never returns a negative value.
 *
 *   LONG : max(0, currentPrice - entryPrice)
 *   SHORT: max(0, entryPrice - currentPrice)
 */
export function calcMaxProfit(
  entryPrice: Decimal,
  currentPrice: Decimal,
  direction: Direction,
): Decimal {
  if (direction === "LONG") {
    return max(d("0"), sub(currentPrice, entryPrice));
  }
  return max(d("0"), sub(entryPrice, currentPrice));
}
