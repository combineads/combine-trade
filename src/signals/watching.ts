import type Decimal from "decimal.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { d, gte, lte } from "@/core/decimal";
import type { Candle, DailyBias, DetectionType, Direction, WatchSession } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { symbolStateTable, watchSessionTable } from "@/db/schema";
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
// SRSymbolState — optional daily S/R level data passed to detectWatching
// ---------------------------------------------------------------------------

/**
 * Optional symbol state data used by detectSRConfluence() to include
 * daily-timeframe S/R levels (daily_open, prev_day_high, prev_day_low).
 * All fields are optional — missing fields are simply excluded from S/R counting.
 */
export type SRSymbolState = {
  /** Today's daily open price (UTC 00:00). */
  daily_open?: Decimal | null;
  /** Previous day's high. */
  prev_day_high?: Decimal | null;
  /** Previous day's low. */
  prev_day_low?: Decimal | null;
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
 * S/R Confluence: PRD §7.4 L240 — count ≥ 2 independent S/R levels within ATR14 × 0.3.
 *
 * S/R level sources (up to 6):
 *   - indicators.sma20, indicators.sma60, indicators.sma120 (MA levels)
 *   - symbolState.daily_open, symbolState.prev_day_high, symbolState.prev_day_low (daily S/R)
 *
 * A level counts when: |close − level| < ATR14 × 0.3
 * If atr14 is null, we cannot determine the threshold → return null (fail-safe).
 * If fewer than 2 levels pass → return null.
 * If ≥ 2 levels pass → determine direction from the average of nearby levels:
 *   avg > close → SHORT (price near resistance), avg < close → LONG (price near support)
 *
 * TP prices follow the BB4_TOUCH pattern:
 *   tp1Price = sma20
 *   tp2Price = LONG → bb20.upper, SHORT → bb20.lower
 */
function detectSRConfluence(
  candle: Candle,
  indicators: AllIndicators,
  bias: DailyBias,
  symbolState?: SRSymbolState,
): WatchingResult | null {
  // atr14 required — cannot determine ATR proximity threshold without it
  if (indicators.atr14 == null) return null;
  if (!indicators.bb20 || !indicators.sma20) return null;

  const close = candle.close;
  const atrThreshold = indicators.atr14.times("0.3");
  const { upper: bb20Upper, lower: bb20Lower, middle: bb20Middle } = indicators.bb20;
  const sma20 = indicators.sma20;

  // Collect candidate S/R levels (null/undefined entries excluded)
  const candidateLevels: Decimal[] = [];
  if (indicators.sma20 != null) candidateLevels.push(indicators.sma20);
  if (indicators.sma60 != null) candidateLevels.push(indicators.sma60);
  if (indicators.sma120 != null) candidateLevels.push(indicators.sma120);
  if (symbolState?.daily_open != null) candidateLevels.push(symbolState.daily_open);
  if (symbolState?.prev_day_high != null) candidateLevels.push(symbolState.prev_day_high);
  if (symbolState?.prev_day_low != null) candidateLevels.push(symbolState.prev_day_low);

  // Filter to levels within ATR proximity
  const nearLevels = candidateLevels.filter((level) =>
    close.minus(level).abs().lessThan(atrThreshold),
  );

  if (nearLevels.length < 2) return null;

  // Determine direction from the average of nearby levels
  const sumLevels = nearLevels.reduce((acc, lv) => acc.plus(lv), d("0"));
  const avgLevel = sumLevels.dividedBy(nearLevels.length);

  const direction: Direction = avgLevel.greaterThan(close) ? "SHORT" : "LONG";

  if (!isDirectionAllowed(direction, bias)) return null;

  const tp2Price = direction === "LONG" ? bb20Upper : bb20Lower;

  return {
    detectionType: "SR_CONFLUENCE",
    direction,
    tp1Price: sma20,
    tp2Price,
    contextData: {
      nearLevelCount: nearLevels.length,
      nearLevels: nearLevels.map((l) => l.toString()),
      avgLevel: avgLevel.toString(),
      atrThreshold: atrThreshold.toString(),
      close: close.toString(),
      sma20: sma20.toString(),
      bb20Upper: bb20Upper.toString(),
      bb20Middle: bb20Middle.toString(),
      bb20Lower: bb20Lower.toString(),
    },
  };
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
 *
 * @param symbolState Optional daily S/R level data (daily_open, prev_day_high,
 *   prev_day_low). When omitted, detectSRConfluence() uses only MA levels
 *   (sma20, sma60, sma120). Existing callers without this parameter continue
 *   to work unchanged.
 */
export function detectWatching(
  candle: Candle,
  indicators: AllIndicators,
  dailyBias: DailyBias,
  symbolState?: SRSymbolState,
): WatchingResult | null {
  return (
    detectSqueezeBreakout(candle, indicators, dailyBias) ??
    detectSRConfluence(candle, indicators, dailyBias, symbolState) ??
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

  // Transition symbol_state from IDLE → WATCHING.
  // The WHERE clause guards against overwriting HAS_POSITION (active ticket protection).
  await db
    .update(symbolStateTable)
    .set({ fsm_state: "WATCHING", updated_at: now })
    .where(
      and(
        eq(symbolStateTable.symbol, params.symbol),
        eq(symbolStateTable.exchange, params.exchange),
        eq(symbolStateTable.fsm_state, "IDLE"),
      ),
    );

  return rowToWatchSession(row);
}

/**
 * Marks a WatchSession as invalidated by setting invalidated_at and
 * invalidation_reason, then transitions symbol_state from WATCHING → IDLE.
 *
 * The symbol_state UPDATE is guarded: it only fires when fsm_state is
 * currently WATCHING, so HAS_POSITION (active ticket) is never overwritten.
 */
export async function invalidateWatchSession(
  db: DbInstance,
  sessionId: string,
  reason: string,
): Promise<void> {
  // Fetch symbol + exchange from the session row so we can update symbol_state.
  // This avoids changing the function signature and adding complexity to callers.
  const sessionRows = await db
    .select({
      symbol: watchSessionTable.symbol,
      exchange: watchSessionTable.exchange,
    })
    .from(watchSessionTable)
    .where(eq(watchSessionTable.id, sessionId))
    .limit(1);

  const session = sessionRows[0];

  // Mark session as invalidated
  await db
    .update(watchSessionTable)
    .set({
      invalidated_at: sql`NOW()`,
      invalidation_reason: reason,
    })
    .where(eq(watchSessionTable.id, sessionId));

  // Transition symbol_state WATCHING → IDLE.
  // The WHERE clause guards against overwriting HAS_POSITION (active ticket protection).
  if (session !== undefined) {
    await db
      .update(symbolStateTable)
      .set({ fsm_state: "IDLE", updated_at: new Date() })
      .where(
        and(
          eq(symbolStateTable.symbol, session.symbol),
          eq(symbolStateTable.exchange, session.exchange),
          eq(symbolStateTable.fsm_state, "WATCHING"),
        ),
      );
  }
}

/**
 * Updates tp1_price and tp2_price for an active WatchSession.
 * Called by process1H() on every 1H close to refresh TP targets based on
 * the current BB20 band values.
 */
export async function updateWatchSessionTp(
  db: DbInstance,
  sessionId: string,
  tp1: Decimal,
  tp2: Decimal,
): Promise<void> {
  await db
    .update(watchSessionTable)
    .set({
      tp1_price: tp1.toString(),
      tp2_price: tp2.toString(),
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
