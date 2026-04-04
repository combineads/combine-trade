import {
  abs,
  type Decimal,
  d,
  div,
  gt,
  isPositive,
  isZero,
  lt,
  lte,
  mul,
  sub,
} from "@/core/decimal";
import type { ExchangeSymbolInfo } from "@/core/ports";
import type { Direction } from "@/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap leverage — 김직선 전략 규칙 */
const HARD_CAP_LEVERAGE = 38;

/** Risk tier boundaries (KRW) */
const TIER_LOW_BALANCE = d("300000"); // 300K KRW → 3%
const TIER_HIGH_BALANCE = d("30000000"); // 30M KRW → 1%
const TIER_LOW_RISK = d("0.03"); // 3%
const TIER_HIGH_RISK = d("0.01"); // 1%

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SizeParams = {
  /** Account balance (KRW or USDT — unit doesn't matter, consistent) */
  balance: Decimal;
  /** Entry price */
  entryPrice: Decimal;
  /** Stop-loss price */
  slPrice: Decimal;
  /** Trade direction */
  direction: Direction;
  /** Exchange symbol constraints */
  exchangeInfo: ExchangeSymbolInfo;
  /** Risk percentage as a ratio (e.g., 0.01 for 1%). Use getRiskPct() to derive from balance. */
  riskPct: Decimal;
};

export type SizeResult = {
  /** Position size in contracts/units (rounded to tickSize) */
  size: Decimal;
  /** Leverage to set on exchange (integer, ceil) */
  leverage: number;
  /** Risk amount = balance × riskPct (before leverage-cap adjustment) */
  riskAmount: Decimal;
  /** Actual max loss = size × slDistance (may be less if leverage-capped) */
  maxLoss: Decimal;
  /** Whether position was reduced to satisfy leverage cap */
  adjustedForLevCap: boolean;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MinSizeError extends Error {
  readonly calculatedSize: Decimal;
  readonly minOrderSize: Decimal;

  constructor(calculatedSize: Decimal, minOrderSize: Decimal) {
    super(
      `Calculated size ${calculatedSize.toString()} is below minimum order size ${minOrderSize.toString()}`,
    );
    this.name = "MinSizeError";
    this.calculatedSize = calculatedSize;
    this.minOrderSize = minOrderSize;
  }
}

export class InvalidSlError extends Error {
  constructor(direction: Direction, entryPrice: Decimal, slPrice: Decimal) {
    super(
      `Invalid SL for ${direction}: entry=${entryPrice.toString()}, sl=${slPrice.toString()}. ` +
        `LONG requires SL < entry; SHORT requires SL > entry.`,
    );
    this.name = "InvalidSlError";
  }
}

// ---------------------------------------------------------------------------
// getRiskPct — balance-tier risk percentage
// ---------------------------------------------------------------------------

/**
 * Determines the risk percentage based on account balance.
 * Uses linear interpolation between tiers:
 *   - balance <= 300K KRW → 3%
 *   - balance >= 30M KRW  → 1%
 *   - between → linear interpolation
 */
export function getRiskPct(balance: Decimal): Decimal {
  if (lte(balance, TIER_LOW_BALANCE)) {
    return TIER_LOW_RISK;
  }
  if (!lt(balance, TIER_HIGH_BALANCE)) {
    return TIER_HIGH_RISK;
  }

  // Linear interpolation: risk = high_risk + (low_risk - high_risk) * (high_balance - balance) / (high_balance - low_balance)
  const balanceRange = sub(TIER_HIGH_BALANCE, TIER_LOW_BALANCE);
  const riskRange = sub(TIER_LOW_RISK, TIER_HIGH_RISK);
  const balanceFromHigh = sub(TIER_HIGH_BALANCE, balance);
  const ratio = div(balanceFromHigh, balanceRange);
  return d(TIER_HIGH_RISK).plus(mul(riskRange, ratio));
}

// ---------------------------------------------------------------------------
// roundDownToTick — floor to tickSize multiple
// ---------------------------------------------------------------------------

function roundDownToTick(size: Decimal, tickSize: Decimal): Decimal {
  // floor(size / tickSize) * tickSize
  const steps = size.dividedBy(tickSize).floor();
  return steps.times(tickSize);
}

// ---------------------------------------------------------------------------
// calculateSize — core position sizer
// ---------------------------------------------------------------------------

/**
 * Calculates position size and leverage using risk-inverse method.
 *
 * Core formula (김직선 전략):
 *   riskAmount = balance × riskPct
 *   slDistance  = |entryPrice − slPrice|
 *   rawSize    = riskAmount / slDistance
 *   leverage   = (rawSize × entryPrice) / balance
 *
 * If leverage exceeds the cap (min of 38x and exchange maxLeverage),
 * the position size is reduced so leverage = cap, and maxLoss is recalculated.
 *
 * Returns null if:
 *   - balance is zero or negative
 *   - riskPct is zero
 *   - calculated size < minOrderSize
 *
 * Throws if:
 *   - slPrice equals entryPrice (division by zero)
 *   - riskPct is negative
 *   - SL is on wrong side of entry for the given direction
 */
export function calculateSize(params: SizeParams): SizeResult | null {
  const { balance, entryPrice, slPrice, direction, exchangeInfo, riskPct } = params;

  // --- Validate inputs ---
  if (lt(riskPct, "0")) {
    throw new Error("riskPct must be non-negative");
  }

  if (isZero(riskPct)) {
    return null;
  }

  if (!isPositive(balance)) {
    return null;
  }

  const slDistance = abs(sub(entryPrice, slPrice));

  if (isZero(slDistance)) {
    throw new Error("slPrice cannot equal entryPrice (slDistance = 0)");
  }

  // Validate SL direction
  if (direction === "LONG" && !gt(entryPrice, slPrice)) {
    throw new InvalidSlError(direction, entryPrice, slPrice);
  }
  if (direction === "SHORT" && !lt(entryPrice, slPrice)) {
    throw new InvalidSlError(direction, entryPrice, slPrice);
  }

  // --- Core calculation ---
  const riskAmount = mul(balance, riskPct);
  const rawSize = div(riskAmount, slDistance);
  const rawLeverage = div(mul(rawSize, entryPrice), balance);

  // Effective max leverage = min(HARD_CAP_LEVERAGE, exchange maxLeverage)
  const effectiveMaxLev = Math.min(HARD_CAP_LEVERAGE, exchangeInfo.maxLeverage);
  const effectiveMaxLevDecimal = d(effectiveMaxLev.toString());

  let finalSize: Decimal;
  let adjustedForLevCap = false;

  if (gt(rawLeverage, effectiveMaxLevDecimal)) {
    // Reduce position: size = (balance × maxLeverage) / entryPrice
    finalSize = div(mul(balance, effectiveMaxLevDecimal), entryPrice);
    adjustedForLevCap = true;
  } else {
    finalSize = rawSize;
  }

  // Round down to tickSize multiple
  finalSize = roundDownToTick(finalSize, exchangeInfo.tickSize);

  // Check minOrderSize
  if (lt(finalSize, exchangeInfo.minOrderSize)) {
    return null;
  }

  // Calculate actual max loss after rounding and possible adjustment
  const maxLoss = mul(finalSize, slDistance);

  // Calculate leverage: ceil so exchange accepts
  const actualLevDecimal = div(mul(finalSize, entryPrice), balance);
  const leverage = Math.ceil(actualLevDecimal.toNumber());

  return {
    size: finalSize,
    leverage,
    riskAmount,
    maxLoss,
    adjustedForLevCap,
  };
}
