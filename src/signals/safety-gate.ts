import type Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { d, gt, lt, max, min } from "@/core/decimal";
import type { Candle, DailyBias, Direction, VectorTimeframe } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { signalDetailTable, signalTable } from "@/db/schema";
import type { AllIndicators } from "@/indicators/types";

// ---------------------------------------------------------------------------
// Constants — safety filter thresholds
// ---------------------------------------------------------------------------

/** Wick ratio thresholds per timeframe. 5M is tight (0.1); 1M is permissive (1.0). */
const WICK_RATIO_THRESHOLD: Record<VectorTimeframe, Decimal> = {
  "5M": d("0.1"),
  "1M": d("1.0"),
};

/** Box range margin factor applied to BB20 range around SMA20 midpoint. */
const BOX_MA20_MARGIN_RATIO = d("0.15");

const ABNORMAL_CANDLE_MULTIPLE = d("2.0");

// ---------------------------------------------------------------------------
// SafetyResult
// ---------------------------------------------------------------------------

export type SafetyResult = {
  passed: boolean;
  reasons: string[];
};

// ---------------------------------------------------------------------------
// Filter condition types
// ---------------------------------------------------------------------------

type SignalInput = {
  direction: Direction;
  timeframe: VectorTimeframe;
};

type SymbolStateInput = {
  session_box_high: Decimal | null;
  session_box_low: Decimal | null;
  daily_bias: DailyBias | null;
};

// ---------------------------------------------------------------------------
// Filter helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Wick ratio filter.
 *
 * LONG:  lower wick = (min(open, close) - low) / (high - low)
 * SHORT: upper wick = (high - max(open, close)) / (high - low)
 *
 * Threshold is timeframe-specific: 5M = 0.1, 1M = 1.0.
 * Doji (range == 0) always passes.
 *
 * Counter-trend bypass: when the trade direction aligns with dailyBias
 * (LONG + LONG_ONLY, or SHORT + SHORT_ONLY), the filter is skipped entirely.
 * NEUTRAL and null bias are treated conservatively (filter applied).
 */
function checkWickRatio(
  candle: Candle,
  direction: Direction,
  timeframe: VectorTimeframe,
  dailyBias: DailyBias | null,
): string | null {
  // 순추세 (trend-following) bypass: direction matches bias → skip wick filter
  const isTrendFollowing =
    (direction === "LONG" && dailyBias === "LONG_ONLY") ||
    (direction === "SHORT" && dailyBias === "SHORT_ONLY");

  if (isTrendFollowing) {
    return null;
  }

  const range = candle.high.minus(candle.low);

  if (range.isZero()) {
    // Doji candle — no wick ratio issue
    return null;
  }

  let wick: Decimal;
  if (direction === "LONG") {
    const bodyBottom = min(candle.open, candle.close);
    wick = bodyBottom.minus(candle.low).dividedBy(range);
  } else {
    const bodyTop = max(candle.open, candle.close);
    wick = candle.high.minus(bodyTop).dividedBy(range);
  }

  const threshold = WICK_RATIO_THRESHOLD[timeframe];
  if (gt(wick, threshold)) {
    return "wick_ratio_exceeded";
  }

  return null;
}

/**
 * Box range center filter.
 *
 * Entry price (candle.close) must fall within the MA20-anchored boundary:
 *   [sma20 - range_20 * 0.15, sma20 + range_20 * 0.15]
 *   where range_20 = bb20.upper - bb20.lower
 *
 * Passes when sma20 or bb20 is null (no indicator data yet).
 * Session box fields are ignored in favor of the indicator-based boundary.
 */
function checkBoxRange(candle: Candle, indicators: AllIndicators): string | null {
  const { sma20, bb20 } = indicators;

  if (sma20 === null || bb20 === null) {
    return null;
  }

  const range20 = bb20.upper.minus(bb20.lower);
  const margin = range20.times(BOX_MA20_MARGIN_RATIO);
  const lowerBound = sma20.minus(margin);
  const upperBound = sma20.plus(margin);

  const entryPrice = candle.close;

  if (lt(entryPrice, lowerBound) || gt(entryPrice, upperBound)) {
    return "outside_box_range";
  }

  return null;
}

/**
 * Abnormal candle filter.
 *
 * Computes avg_range_5 from the last 5 candles in recentCandles and blocks
 * counter-trend entries where (high - low) > avg_range_5 × ABNORMAL_CANDLE_MULTIPLE.
 *
 * Bypass conditions (returns null):
 *   - Fewer than 5 recentCandles available
 *   - Trend-following entry: direction matches dailyBias
 *     (LONG + LONG_ONLY, or SHORT + SHORT_ONLY)
 *
 * Counter-trend / NEUTRAL / null bias: filter is applied.
 */
function checkAbnormalCandle(
  candle: Candle,
  recentCandles: Candle[],
  dailyBias: DailyBias | null,
  direction: Direction,
): string | null {
  // Bypass: insufficient history
  if (recentCandles.length < 5) {
    return null;
  }

  // Bypass: trend-following (순추세)
  const isTrendFollowing =
    (direction === "LONG" && dailyBias === "LONG_ONLY") ||
    (direction === "SHORT" && dailyBias === "SHORT_ONLY");

  if (isTrendFollowing) {
    return null;
  }

  // Compute avg_range_5 from last 5 candles
  const last5 = recentCandles.slice(-5);
  const totalRange = last5.reduce((sum, c) => sum.plus(c.high.minus(c.low)), d("0"));
  const avgRange5 = totalRange.dividedBy(5);

  const range = candle.high.minus(candle.low);
  const threshold = avgRange5.times(ABNORMAL_CANDLE_MULTIPLE);

  if (gt(range, threshold)) {
    return "abnormal_candle";
  }

  return null;
}

/**
 * 1M noise filter (only for 1M timeframe).
 *
 * When timeframe='1M':
 *   - Compare candle.close vs sma20 to determine sma20 direction:
 *     close > sma20 → bullish, close <= sma20 → bearish
 *   - LONG_ONLY daily_bias expects bullish sma20; if bearish → fail
 *   - SHORT_ONLY daily_bias expects bearish sma20; if bullish → fail
 *   - NEUTRAL daily_bias → pass
 *
 * When timeframe='5M' → skip (return null).
 * When sma20 is null → pass.
 */
function checkNoise1M(
  candle: Candle,
  indicators: AllIndicators,
  signal: SignalInput,
  symbolState: SymbolStateInput,
): string | null {
  if (signal.timeframe !== "1M") {
    return null;
  }

  const { daily_bias } = symbolState;
  const { sma20 } = indicators;

  if (sma20 === null) {
    return null;
  }

  if (daily_bias === null || daily_bias === "NEUTRAL") {
    return null;
  }

  // sma20 direction: close > sma20 → bullish; otherwise bearish
  const sma20Bullish = gt(candle.close, sma20);

  if (daily_bias === "LONG_ONLY" && !sma20Bullish) {
    return "noise_1m";
  }

  if (daily_bias === "SHORT_ONLY" && sma20Bullish) {
    return "noise_1m";
  }

  return null;
}

// ---------------------------------------------------------------------------
// checkSafety — pure
// ---------------------------------------------------------------------------

/**
 * Runs all four safety filters against the given candle + indicators.
 * All conditions must pass for SafetyResult.passed to be true.
 *
 * Filter thresholds use module-level constants (see top of file).
 *
 * @param recentCandles - Candles preceding the entry candle, used to compute
 *   avg_range_5 for the abnormal candle filter. Defaults to [] (bypass).
 *   Pipeline callers should pass the full candles array for the symbol.
 */
export function checkSafety(
  candle: Candle,
  indicators: AllIndicators,
  signal: SignalInput,
  symbolState: SymbolStateInput,
  recentCandles: Candle[] = [],
): SafetyResult {
  const reasons: string[] = [];

  const wickFailure = checkWickRatio(
    candle,
    signal.direction,
    signal.timeframe,
    symbolState.daily_bias,
  );
  if (wickFailure) reasons.push(wickFailure);

  const boxFailure = checkBoxRange(candle, indicators);
  if (boxFailure) reasons.push(boxFailure);

  const abnormalFailure = checkAbnormalCandle(
    candle,
    recentCandles,
    symbolState.daily_bias,
    signal.direction,
  );
  if (abnormalFailure) reasons.push(abnormalFailure);

  const noiseFailure = checkNoise1M(candle, indicators, signal, symbolState);
  if (noiseFailure) reasons.push(noiseFailure);

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// updateSignalSafety — DB write
// ---------------------------------------------------------------------------

/**
 * Updates Signal.safety_passed and inserts a safety_reject_reason
 * SignalDetail row when the signal failed.
 *
 * - When passed=true: sets safety_passed=true, no SignalDetail inserted.
 * - When passed=false: sets safety_passed=false, inserts SignalDetail
 *   with key='safety_reject_reason' and text_value=reasons.join(', ').
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE so the detail row is idempotent.
 */
export async function updateSignalSafety(
  db: DbInstance,
  signalId: string,
  result: SafetyResult,
): Promise<void> {
  await db
    .update(signalTable)
    .set({ safety_passed: result.passed })
    .where(eq(signalTable.id, signalId));

  if (!result.passed && result.reasons.length > 0) {
    await db
      .insert(signalDetailTable)
      .values({
        signal_id: signalId,
        key: "safety_reject_reason",
        value: null,
        text_value: result.reasons.join(", "),
      })
      .onConflictDoUpdate({
        target: [signalDetailTable.signal_id, signalDetailTable.key],
        set: { text_value: result.reasons.join(", ") },
      });
  }
}
