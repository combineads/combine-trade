import type Decimal from "decimal.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { d, gte, lte } from "@/core/decimal";
import type { Candle, DailyBias, DetectionType, Direction, WatchSession } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { watchSessionTable } from "@/db/schema";
import type { AllIndicators } from "@/indicators/types";

// ---------------------------------------------------------------------------
// WatchingResult
// ---------------------------------------------------------------------------

export type WatchingResult = {
  detectionType: DetectionType;
  direction: Direction;
  tp1Price: Decimal;
  tp2Price: Decimal;
  contextData: object;
};

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

function isDirectionAllowed(direction: Direction, bias: DailyBias): boolean {
  if (bias === "LONG_ONLY") return direction === "LONG";
  if (bias === "SHORT_ONLY") return direction === "SHORT";
  // NEUTRAL allows both
  return true;
}

// ---------------------------------------------------------------------------
// Detection sub-functions (pure)
// ---------------------------------------------------------------------------

/**
 * Squeeze Breakout: squeeze state is "expansion" (caller's indicators reflect
 * that the *current* state is expansion, implying it transitioned from squeeze)
 * AND the close has broken out of the BB20 band in the matching direction.
 *
 * Wick ratio filter: the opposite wick must be < 0.5 of the candle range,
 * ensuring the candle body (not a wick) drove the breakout.
 * - LONG: upper wick ratio = (high − close) / (high − low) must be < 0.5
 * - SHORT: lower wick ratio = (close − low) / (high − low) must be < 0.5
 */
function detectSqueezeBreakout(
  candle: Candle,
  indicators: AllIndicators,
  bias: DailyBias,
): WatchingResult | null {
  if (indicators.squeeze !== "expansion") return null;
  if (!indicators.bb20 || !indicators.sma20) return null;

  const close = candle.close;
  const high = candle.high;
  const low = candle.low;
  const { upper: bb20Upper, lower: bb20Lower, middle: bb20Middle } = indicators.bb20;
  const sma20 = indicators.sma20;

  const range = high.minus(low);

  // LONG: close breaks above BB20 upper with upper wick ratio < 0.5
  if (close.greaterThan(bb20Upper) && isDirectionAllowed("LONG", bias)) {
    // If range is zero, skip the wick filter (degenerate candle)
    if (!range.isZero()) {
      const upperWickRatio = high.minus(close).dividedBy(range);
      if (upperWickRatio.greaterThanOrEqualTo("0.5")) return null;
    }
    return {
      detectionType: "SQUEEZE_BREAKOUT",
      direction: "LONG",
      tp1Price: sma20,
      tp2Price: bb20Lower,
      contextData: {
        squeeze: indicators.squeeze,
        bb20Upper: bb20Upper.toString(),
        bb20Middle: bb20Middle.toString(),
        bb20Lower: bb20Lower.toString(),
        close: close.toString(),
        sma20: sma20.toString(),
      },
    };
  }

  // SHORT: close breaks below BB20 lower with lower wick ratio < 0.5
  if (close.lessThan(bb20Lower) && isDirectionAllowed("SHORT", bias)) {
    // If range is zero, skip the wick filter (degenerate candle)
    if (!range.isZero()) {
      const lowerWickRatio = close.minus(low).dividedBy(range);
      if (lowerWickRatio.greaterThanOrEqualTo("0.5")) return null;
    }
    return {
      detectionType: "SQUEEZE_BREAKOUT",
      direction: "SHORT",
      tp1Price: sma20,
      tp2Price: bb20Upper,
      contextData: {
        squeeze: indicators.squeeze,
        bb20Upper: bb20Upper.toString(),
        bb20Middle: bb20Middle.toString(),
        bb20Lower: bb20Lower.toString(),
        close: close.toString(),
        sma20: sma20.toString(),
      },
    };
  }

  return null;
}

/**
 * S/R Confluence: simplified check — close is between BB4 and BB20 bands
 * with confluence (close is near both BB4 and BB20 on the same side).
 *
 * LONG: close is between BB20 lower and BB4 lower (near support).
 * SHORT: close is between BB4 upper and BB20 upper (near resistance).
 *
 * ATR proximity filter: the close must be within ATR14 × 0.3 of the S/R level
 * (BB20 lower for LONG, BB20 upper for SHORT) to confirm price is close enough
 * to the level to constitute confluence.
 */
function detectSRConfluence(
  candle: Candle,
  indicators: AllIndicators,
  bias: DailyBias,
): WatchingResult | null {
  if (!indicators.bb20 || !indicators.bb4 || !indicators.sma20) return null;

  const close = candle.close;
  const { upper: bb20Upper, lower: bb20Lower, middle: bb20Middle } = indicators.bb20;
  const { upper: bb4Upper, lower: bb4Lower } = indicators.bb4;
  const sma20 = indicators.sma20;

  // ATR proximity threshold (optional — only applied when atr14 is available)
  const atrThreshold = indicators.atr14 != null ? indicators.atr14.times("0.3") : null;

  // LONG confluence: close is between BB20 lower and BB4 lower
  // (BB4 lower is inside BB20 lower on the upside, so BB4 lower > BB20 lower)
  if (
    bb4Lower.greaterThan(bb20Lower) &&
    gte(close, bb20Lower) &&
    lte(close, bb4Lower) &&
    isDirectionAllowed("LONG", bias)
  ) {
    // ATR filter: close must be within ATR14 × 0.3 of bb20Lower (support level)
    if (atrThreshold != null) {
      const distanceFromLevel = close.minus(bb20Lower).abs();
      if (distanceFromLevel.greaterThan(atrThreshold)) return null;
    }
    return {
      detectionType: "SR_CONFLUENCE",
      direction: "LONG",
      tp1Price: sma20,
      tp2Price: bb20Upper,
      contextData: {
        bb20Upper: bb20Upper.toString(),
        bb20Middle: bb20Middle.toString(),
        bb20Lower: bb20Lower.toString(),
        bb4Upper: bb4Upper.toString(),
        bb4Lower: bb4Lower.toString(),
        close: close.toString(),
        sma20: sma20.toString(),
      },
    };
  }

  // SHORT confluence: close is between BB4 upper and BB20 upper
  if (
    bb4Upper.lessThan(bb20Upper) &&
    gte(close, bb4Upper) &&
    lte(close, bb20Upper) &&
    isDirectionAllowed("SHORT", bias)
  ) {
    // ATR filter: close must be within ATR14 × 0.3 of bb20Upper (resistance level)
    if (atrThreshold != null) {
      const distanceFromLevel = bb20Upper.minus(close).abs();
      if (distanceFromLevel.greaterThan(atrThreshold)) return null;
    }
    return {
      detectionType: "SR_CONFLUENCE",
      direction: "SHORT",
      tp1Price: sma20,
      tp2Price: bb20Lower,
      contextData: {
        bb20Upper: bb20Upper.toString(),
        bb20Middle: bb20Middle.toString(),
        bb20Lower: bb20Lower.toString(),
        bb4Upper: bb4Upper.toString(),
        bb4Lower: bb4Lower.toString(),
        close: close.toString(),
        sma20: sma20.toString(),
      },
    };
  }

  return null;
}

/**
 * BB4 Touch: 1H close touches or crosses the BB4 upper (SHORT) or lower (LONG) band.
 */
function detectBB4Touch(
  candle: Candle,
  indicators: AllIndicators,
  bias: DailyBias,
): WatchingResult | null {
  if (!indicators.bb4 || !indicators.bb20 || !indicators.sma20) return null;

  const close = candle.close;
  const { upper: bb4Upper, lower: bb4Lower } = indicators.bb4;
  const { upper: bb20Upper, lower: bb20Lower, middle: bb20Middle } = indicators.bb20;
  const sma20 = indicators.sma20;

  // LONG: close touches or goes below BB4 lower
  if (lte(close, bb4Lower) && isDirectionAllowed("LONG", bias)) {
    return {
      detectionType: "BB4_TOUCH",
      direction: "LONG",
      tp1Price: sma20,
      tp2Price: bb20Upper,
      contextData: {
        bb4Upper: bb4Upper.toString(),
        bb4Lower: bb4Lower.toString(),
        bb20Upper: bb20Upper.toString(),
        bb20Middle: bb20Middle.toString(),
        bb20Lower: bb20Lower.toString(),
        close: close.toString(),
        sma20: sma20.toString(),
      },
    };
  }

  // SHORT: close touches or goes above BB4 upper
  if (gte(close, bb4Upper) && isDirectionAllowed("SHORT", bias)) {
    return {
      detectionType: "BB4_TOUCH",
      direction: "SHORT",
      tp1Price: sma20,
      tp2Price: bb20Lower,
      contextData: {
        bb4Upper: bb4Upper.toString(),
        bb4Lower: bb4Lower.toString(),
        bb20Upper: bb20Upper.toString(),
        bb20Middle: bb20Middle.toString(),
        bb20Lower: bb20Lower.toString(),
        close: close.toString(),
        sma20: sma20.toString(),
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// detectWatching — main entry point (pure)
// ---------------------------------------------------------------------------

/**
 * Evaluates the three WATCHING detection types in order and returns the first
 * match, or null if no condition is met.
 *
 * Evaluation order: Squeeze Breakout → S/R Confluence → BB4 Touch
 */
export function detectWatching(
  candle: Candle,
  indicators: AllIndicators,
  dailyBias: DailyBias,
): WatchingResult | null {
  return (
    detectSqueezeBreakout(candle, indicators, dailyBias) ??
    detectSRConfluence(candle, indicators, dailyBias) ??
    detectBB4Touch(candle, indicators, dailyBias) ??
    null
  );
}

// ---------------------------------------------------------------------------
// checkInvalidation — pure
// ---------------------------------------------------------------------------

/**
 * Checks whether an active WatchSession should be invalidated.
 *
 * Returns the invalidation reason string, or null if the session is still valid.
 *
 * Reasons:
 * - 'bias_changed': current bias no longer permits the session direction
 * - 'bias_changed_to_neutral': current bias is NEUTRAL (no directional conviction)
 * - 'price_breakout': price has moved beyond the opposite BB20 band
 */
export function checkInvalidation(
  candle: Candle,
  indicators: AllIndicators,
  session: WatchSession,
  currentBias?: DailyBias,
): string | null {
  // NEUTRAL bias — invalidate any active WATCHING session (no directional conviction)
  if (currentBias === "NEUTRAL") {
    return "bias_changed_to_neutral";
  }

  // Bias changed — direction no longer permitted
  if (currentBias !== undefined && !isDirectionAllowed(session.direction, currentBias)) {
    return "bias_changed";
  }

  if (!indicators.bb20) return null;

  const close = candle.close;
  const { upper: bb20Upper, lower: bb20Lower } = indicators.bb20;

  // For a LONG session, invalidate if price breaks below BB20 lower (opposite band)
  if (session.direction === "LONG" && close.lessThan(bb20Lower)) {
    return "price_breakout";
  }

  // For a SHORT session, invalidate if price breaks above BB20 upper (opposite band)
  if (session.direction === "SHORT" && close.greaterThan(bb20Upper)) {
    return "price_breakout";
  }

  return null;
}

// ---------------------------------------------------------------------------
// DB helpers — WatchSession lifecycle
// ---------------------------------------------------------------------------

/**
 * Maps a DB row to the WatchSession domain type.
 */
function rowToWatchSession(row: typeof watchSessionTable.$inferSelect): WatchSession {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange as WatchSession["exchange"],
    detection_type: row.detection_type as WatchSession["detection_type"],
    direction: row.direction as WatchSession["direction"],
    tp1_price: row.tp1_price != null ? d(row.tp1_price) : null,
    tp2_price: row.tp2_price != null ? d(row.tp2_price) : null,
    detected_at: row.detected_at,
    invalidated_at: row.invalidated_at ?? null,
    invalidation_reason: row.invalidation_reason ?? null,
    context_data: row.context_data ?? null,
    created_at: row.created_at,
  };
}

export type OpenWatchSessionParams = {
  symbol: string;
  exchange: string;
  detectionType: DetectionType;
  direction: Direction;
  tp1Price: Decimal;
  tp2Price: Decimal;
  detectedAt: Date;
  contextData: object;
};

/**
 * Opens a new WatchSession. Automatically invalidates any existing active
 * session for the same symbol × exchange with reason 'new_session_started'.
 */
export async function openWatchSession(
  db: DbInstance,
  params: OpenWatchSessionParams,
): Promise<WatchSession> {
  const now = new Date();

  // Invalidate any existing active session first
  await db
    .update(watchSessionTable)
    .set({
      invalidated_at: now,
      invalidation_reason: "new_session_started",
    })
    .where(
      and(
        eq(watchSessionTable.symbol, params.symbol),
        eq(watchSessionTable.exchange, params.exchange),
        isNull(watchSessionTable.invalidated_at),
      ),
    );

  // Insert new session
  const inserted = await db
    .insert(watchSessionTable)
    .values({
      symbol: params.symbol,
      exchange: params.exchange,
      detection_type: params.detectionType,
      direction: params.direction,
      tp1_price: params.tp1Price.toString(),
      tp2_price: params.tp2Price.toString(),
      detected_at: params.detectedAt,
      context_data: params.contextData,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error("openWatchSession: INSERT did not return a row");
  }

  return rowToWatchSession(row);
}

/**
 * Marks a WatchSession as invalidated by setting invalidated_at and
 * invalidation_reason.
 */
export async function invalidateWatchSession(
  db: DbInstance,
  sessionId: string,
  reason: string,
): Promise<void> {
  await db
    .update(watchSessionTable)
    .set({
      invalidated_at: sql`NOW()`,
      invalidation_reason: reason,
    })
    .where(eq(watchSessionTable.id, sessionId));
}

/**
 * Returns the currently active WatchSession for a symbol × exchange,
 * or null if none exists.
 */
export async function getActiveWatchSession(
  db: DbInstance,
  symbol: string,
  exchange: string,
): Promise<WatchSession | null> {
  const rows = await db
    .select()
    .from(watchSessionTable)
    .where(
      and(
        eq(watchSessionTable.symbol, symbol),
        eq(watchSessionTable.exchange, exchange),
        isNull(watchSessionTable.invalidated_at),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? rowToWatchSession(row) : null;
}
