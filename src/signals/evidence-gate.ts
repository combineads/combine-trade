import Decimal from "decimal.js";
import { d, gte, lte } from "@/core/decimal";
import type {
  Candle,
  Direction,
  Signal,
  SignalType,
  VectorTimeframe,
  WatchSession,
} from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { signalDetailTable, signalTable } from "@/db/schema";
import type { AllIndicators } from "@/indicators/types";

// ---------------------------------------------------------------------------
// EvidenceResult
// ---------------------------------------------------------------------------

export type EvidenceResult = {
  signalType: SignalType;
  direction: Direction;
  entryPrice: Decimal;
  slPrice: Decimal;
  /** true when 1H BB4 touch was detected simultaneously — eligible for a_grade promotion */
  aGrade: boolean;
  details: Record<string, Decimal | string>;
};

// ---------------------------------------------------------------------------
// SL price calculation (pure)
// ---------------------------------------------------------------------------

/**
 * Computes SL price for LONG or SHORT using the PRD tail-length formula.
 *
 * LONG:  tailLength = min(open, close) - low
 *        SL = low - tailLength × 0.15
 * SHORT: tailLength = high - max(open, close)
 *        SL = high + tailLength × 0.15
 *
 * Fallbacks:
 * - tailLength = 0 (doji) → use (high - low) × 0.15 as buffer
 * - range = 0 (fully flat candle) → SL = close
 */
export function calcSlPrice(candle: Candle, direction: Direction): Decimal {
  const range = candle.high.minus(candle.low);

  if (direction === "LONG") {
    const bodyBottom = Decimal.min(candle.open, candle.close);
    const tailLength = bodyBottom.minus(candle.low);
    const buffer = tailLength.isZero() ? range.times("0.15") : tailLength.times("0.15");
    if (buffer.isZero()) {
      // Fully flat candle: range=0 and tailLength=0
      return candle.close;
    }
    return candle.low.minus(buffer);
  }

  // SHORT
  const bodyTop = Decimal.max(candle.open, candle.close);
  const tailLength = candle.high.minus(bodyTop);
  const buffer = tailLength.isZero() ? range.times("0.15") : tailLength.times("0.15");
  if (buffer.isZero()) {
    // Fully flat candle: range=0 and tailLength=0
    return candle.close;
  }
  return candle.high.plus(buffer);
}

// ---------------------------------------------------------------------------
// checkEvidence — pure
// ---------------------------------------------------------------------------

/**
 * Evaluates BB4 touch conditions for the given candle against the active
 * WatchSession and returns an EvidenceResult, or null when:
 * - BB4 is not available
 * - No BB4 touch occurred
 * - Candle direction does not match the session direction
 * - Signal is ONE_B and the MA20 slope does not match the signal direction
 */
export function checkEvidence(
  candle: Candle,
  indicators: AllIndicators,
  watchSession: WatchSession,
): EvidenceResult | null {
  if (!indicators.bb4) return null;

  const { upper: bb4Upper, lower: bb4Lower } = indicators.bb4;

  // BB4 touch detection
  const bb4TouchLong = lte(candle.low, bb4Lower);
  const bb4TouchShort = gte(candle.high, bb4Upper);

  // Direction determined by BB4 touch
  let touchDirection: Direction | null = null;
  if (bb4TouchLong) touchDirection = "LONG";
  else if (bb4TouchShort) touchDirection = "SHORT";

  // No touch → null
  if (touchDirection === null) return null;

  // Direction mismatch with watchSession → null
  if (touchDirection !== watchSession.direction) return null;

  // Double-B classification: BB4 + BB20 simultaneous touch in same candle
  let signalType: SignalType = "ONE_B";
  if (indicators.bb20) {
    const { upper: bb20Upper, lower: bb20Lower } = indicators.bb20;
    if (touchDirection === "LONG" && lte(candle.low, bb20Lower)) {
      signalType = "DOUBLE_B";
    } else if (touchDirection === "SHORT" && gte(candle.high, bb20Upper)) {
      signalType = "DOUBLE_B";
    }
  }

  // ONE_B MA20 slope validation:
  // When signal_type is ONE_B, verify that the MA20 slope matches the signal direction.
  // LONG requires MA20 slope > 0 (sma20 > prevSma20).
  // SHORT requires MA20 slope < 0 (sma20 < prevSma20).
  // If slope data is unavailable (null), the filter is skipped.
  // DOUBLE_B signals bypass this check — they have stronger confluence evidence.
  if (signalType === "ONE_B" && indicators.sma20 !== null && indicators.prevSma20 !== null) {
    const slopePositive = indicators.sma20.greaterThan(indicators.prevSma20);
    if (touchDirection === "LONG" && !slopePositive) return null;
    if (touchDirection === "SHORT" && slopePositive) return null;
    // Flat slope (sma20 === prevSma20): SHORT requires slope < 0, so flat = fail for SHORT
    if (touchDirection === "SHORT" && indicators.sma20.equals(indicators.prevSma20)) return null;
  }

  // entry_price = candle.close
  const entryPrice = candle.close;

  // SL price
  const slPrice = calcSlPrice(candle, touchDirection);

  // a_grade: true when the 1H BB4 band is also touched simultaneously.
  // The 1H BB4 data is supplied via indicators.bb4_1h by the daemon pipeline.
  // If bb4_1h is not available, a_grade defaults to false.
  let aGrade = false;
  if (indicators.bb4_1h) {
    const { upper: bb4_1h_upper, lower: bb4_1h_lower } = indicators.bb4_1h;
    if (touchDirection === "LONG" && lte(candle.low, bb4_1h_lower)) {
      aGrade = true;
    } else if (touchDirection === "SHORT" && gte(candle.high, bb4_1h_upper)) {
      aGrade = true;
    }
  }

  // Build details record
  const details: Record<string, Decimal | string> = {
    detection_type: signalType,
  };

  if (touchDirection === "LONG") {
    details.bb4_touch_price = candle.low;
    details.bb4_lower = bb4Lower;
  } else {
    details.bb4_touch_price = candle.high;
    details.bb4_upper = bb4Upper;
  }

  if (indicators.bb20) {
    details.bb20_lower = indicators.bb20.lower;
    details.bb20_upper = indicators.bb20.upper;
  }

  if (indicators.atr14) {
    details.atr14 = indicators.atr14;
  }

  // daily_bias from watchSession.context_data if present
  if (
    watchSession.context_data !== null &&
    typeof watchSession.context_data === "object" &&
    "daily_bias" in (watchSession.context_data as object)
  ) {
    details.daily_bias = String((watchSession.context_data as Record<string, unknown>).daily_bias);
  }

  return {
    signalType,
    direction: touchDirection,
    entryPrice,
    slPrice,
    aGrade,
    details,
  };
}

// ---------------------------------------------------------------------------
// rowToSignal — DB row → Signal domain type
// ---------------------------------------------------------------------------

function rowToSignal(row: typeof signalTable.$inferSelect): Signal {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange as Signal["exchange"],
    watch_session_id: row.watch_session_id,
    timeframe: row.timeframe as Signal["timeframe"],
    signal_type: row.signal_type as Signal["signal_type"],
    direction: row.direction as Signal["direction"],
    entry_price: d(row.entry_price),
    sl_price: d(row.sl_price),
    safety_passed: row.safety_passed,
    knn_decision: (row.knn_decision as Signal["knn_decision"]) ?? null,
    a_grade: row.a_grade,
    vector_id: row.vector_id ?? null,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// createSignal — DB write
// ---------------------------------------------------------------------------

/**
 * Inserts a Signal row and associated SignalDetail rows derived from
 * evidence.details. Returns the created Signal.
 *
 * - knn_decision = null (filled later by KNN stage)
 * - a_grade = evidence.aGrade (true when 1H BB4 touch is detected; KNN stage may override)
 * - safety_passed = false (filled later by Safety Gate)
 * - vector_id = null
 */
export async function createSignal(
  db: DbInstance,
  evidence: EvidenceResult,
  watchSession: WatchSession,
  timeframe: VectorTimeframe,
): Promise<Signal> {
  // Insert signal row
  const inserted = await db
    .insert(signalTable)
    .values({
      symbol: watchSession.symbol,
      exchange: watchSession.exchange,
      watch_session_id: watchSession.id,
      timeframe,
      signal_type: evidence.signalType,
      direction: evidence.direction,
      entry_price: evidence.entryPrice.toString(),
      sl_price: evidence.slPrice.toString(),
      safety_passed: false,
      knn_decision: null,
      a_grade: evidence.aGrade,
      vector_id: null,
    })
    .returning();

  const signalRow = inserted[0];
  if (!signalRow) {
    throw new Error("createSignal: INSERT into signals did not return a row");
  }

  // Insert SignalDetail rows
  const detailEntries = Object.entries(evidence.details);
  if (detailEntries.length > 0) {
    const detailValues = detailEntries.map(([key, val]) => {
      if (val instanceof Decimal) {
        return {
          signal_id: signalRow.id,
          key,
          value: val.toString(),
          text_value: null,
        };
      }
      return {
        signal_id: signalRow.id,
        key,
        value: null,
        text_value: val,
      };
    });

    await db.insert(signalDetailTable).values(detailValues);
  }

  return rowToSignal(signalRow);
}
