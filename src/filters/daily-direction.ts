import { and, eq, sql } from "drizzle-orm";
import type { Decimal } from "@/core/decimal";
import type { DailyBias } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { symbolStateTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// determineDailyBias — pure function
// ---------------------------------------------------------------------------

/**
 * Determines the daily trading bias based on the MA20 slope and close vs open.
 *
 * Rules (PRD §7.2 L217-218, T-18-003):
 * - MA20 slope = (ma20Today - ma20Yesterday)
 * - slope >= 0 AND close > open  → LONG_ONLY  (slope=0 횡보 허용, strict >)
 * - slope <= 0 AND close < open  → SHORT_ONLY (slope=0 횡보 허용, strict <)
 * - Conditions disagree or slope=0+close=open → NEUTRAL
 *
 * @param todayClose    - Today's closing price (Decimal)
 * @param dailyOpen     - Today's opening price (Decimal)
 * @param ma20Today     - MA20 value for today (Decimal)
 * @param ma20Yesterday - MA20 value for yesterday (Decimal)
 * @returns DailyBias
 */
export function determineDailyBias(
  todayClose: Decimal,
  dailyOpen: Decimal,
  ma20Today: Decimal,
  ma20Yesterday: Decimal,
): DailyBias {
  const slope = ma20Today.minus(ma20Yesterday);

  const slopePositive = slope.isPositive(); // slope >= 0: Decimal.js isPositive() returns true for zero (PRD §7.2: >=)
  const slopeNegative = slope.isNegative() || slope.isZero(); // slope <= 0 (PRD §7.2: <=)

  const closeAboveOpen = todayClose.greaterThan(dailyOpen); // strict > (PRD §7.2)
  const closeBelowOpen = todayClose.lessThan(dailyOpen); // strict < (PRD §7.2)

  if (slopePositive && closeAboveOpen) {
    return "LONG_ONLY";
  }

  if (slopeNegative && closeBelowOpen) {
    return "SHORT_ONLY";
  }

  return "NEUTRAL";
}

// ---------------------------------------------------------------------------
// updateDailyBias — DB side-effect
// ---------------------------------------------------------------------------

/**
 * Updates SymbolState.daily_bias and SymbolState.daily_open for the given
 * symbol + exchange in a single SQL statement.
 *
 * @param db        - Drizzle ORM instance (obtained via getDb())
 * @param symbol    - Trading symbol (e.g. "BTCUSDT")
 * @param exchange  - Exchange name (e.g. "binance")
 * @param bias      - The DailyBias to store
 * @param dailyOpen - The 1D candle open price to store
 */
export async function updateDailyBias(
  db: DbInstance,
  symbol: string,
  exchange: string,
  bias: DailyBias,
  dailyOpen: Decimal,
): Promise<void> {
  await db
    .update(symbolStateTable)
    .set({
      daily_bias: bias,
      daily_open: dailyOpen.toString(),
      updated_at: sql`NOW()`,
    })
    .where(and(eq(symbolStateTable.symbol, symbol), eq(symbolStateTable.exchange, exchange)));
}
