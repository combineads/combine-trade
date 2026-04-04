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

const WICK_RATIO_THRESHOLD = d("0.6");
const BOX_MARGIN_RATIO = d("0.3");
const ABNORMAL_CANDLE_MULTIPLE = d("3.0");

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
 * Doji (range == 0) always passes.
 */
function checkWickRatio(candle: Candle, direction: Direction): string | null {
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

  if (gt(wick, WICK_RATIO_THRESHOLD)) {
    return "wick_ratio_exceeded";
  }

  return null;
}

/**
 * Box range center filter.
 *
 * Entry price (candle.close) must fall within the extended session box:
 *   [box_low - margin, box_high + margin]
 *   where margin = (box_high - box_low) * BOX_MARGIN_RATIO
 *
 * Passes when session_box_high or session_box_low is null (no box data yet).
 */
function checkBoxRange(candle: Candle, symbolState: SymbolStateInput): string | null {
  const { session_box_high, session_box_low } = symbolState;

  if (session_box_high === null || session_box_low === null) {
    return null;
  }

  const boxRange = session_box_high.minus(session_box_low);
  const margin = boxRange.times(BOX_MARGIN_RATIO);
  const lowerBound = session_box_low.minus(margin);
  const upperBound = session_box_high.plus(margin);

  const entryPrice = candle.close;

  if (lt(entryPrice, lowerBound) || gt(entryPrice, upperBound)) {
    return "outside_box_range";
  }

  return null;
}

/**
 * Abnormal candle filter.
 *
 * If (high - low) > ATR * ABNORMAL_CANDLE_MULTIPLE → abnormal.
 * Passes when ATR is null.
 */
function checkAbnormalCandle(candle: Candle, indicators: AllIndicators): string | null {
  const { atr14 } = indicators;

  if (atr14 === null) {
    return null;
  }

  const range = candle.high.minus(candle.low);
  const threshold = atr14.times(ABNORMAL_CANDLE_MULTIPLE);

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
 */
export function checkSafety(
  candle: Candle,
  indicators: AllIndicators,
  signal: SignalInput,
  symbolState: SymbolStateInput,
): SafetyResult {
  const reasons: string[] = [];

  const wickFailure = checkWickRatio(candle, signal.direction);
  if (wickFailure) reasons.push(wickFailure);

  const boxFailure = checkBoxRange(candle, symbolState);
  if (boxFailure) reasons.push(boxFailure);

  const abnormalFailure = checkAbnormalCandle(candle, indicators);
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
