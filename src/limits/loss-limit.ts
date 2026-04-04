/**
 * 3-tier loss limit check -- pure function + DB helpers.
 *
 * checkLossLimit() is a pure function (no DB, no side effects).
 * recordLoss() and loadLossLimitConfig() handle DB interaction.
 *
 * Layer: L5 (limits)
 * No imports from positions module (L5 -> L5 forbidden).
 */

import type Decimal from "decimal.js";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { d, gte, mul } from "@/core/decimal";
import { commonCodeTable, symbolStateTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Violation category identifiers. */
export type LossViolation = "DAILY" | "SESSION" | "HOURLY_5M" | "HOURLY_1M";

/** Timeframe for recording a loss event. */
export type LossTimeframe = "5M" | "1M";

/** Result of the loss limit check. */
export interface LossLimitResult {
  /** true when all limits pass -- entry is allowed. */
  allowed: boolean;
  /** List of violated limit categories (empty when allowed). */
  violations: LossViolation[];
}

/** Configuration for loss limits (loaded from CommonCode). */
export interface LossLimitConfig {
  /** Max daily loss as a ratio of balance (default 0.10 = 10%). */
  maxDailyLossPct: Decimal;
  /** Max consecutive session losses (default 3). */
  maxSessionLosses: number;
  /** Max 5M-timeframe losses in the current hour (default 2). */
  maxHourly5m: number;
  /** Max 1M-timeframe losses in the current hour (default 1). */
  maxHourly1m: number;
}

/** Subset of SymbolState fields relevant to loss checking. */
export interface SymbolLossState {
  /** Cumulative daily loss amount (Decimal). */
  lossesToday: Decimal;
  /** Session loss count. */
  lossesSession: number;
  /** Hourly 5M loss count. */
  lossesThisHour5m: number;
  /** Hourly 1M loss count. */
  lossesThisHour1m: number;
}

// ---------------------------------------------------------------------------
// Default config values
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: LossLimitConfig = {
  maxDailyLossPct: d("0.10"),
  maxSessionLosses: 3,
  maxHourly5m: 2,
  maxHourly1m: 1,
};

// ---------------------------------------------------------------------------
// Pure function: checkLossLimit
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a new entry is allowed based on current loss counters.
 *
 * Pure function -- no DB access, no side effects.
 * Multiple violations can be reported simultaneously.
 *
 * Fail-closed: if any limit is breached, allowed = false.
 */
export function checkLossLimit(
  state: SymbolLossState,
  balance: Decimal | string,
  config: LossLimitConfig,
): LossLimitResult {
  const violations: LossViolation[] = [];

  // Daily loss: losses_today >= balance * max_daily_loss_pct
  const dailyThreshold = mul(balance, config.maxDailyLossPct);
  if (gte(state.lossesToday, dailyThreshold)) {
    violations.push("DAILY");
  }

  // Session losses: losses_session >= max_session_losses
  if (state.lossesSession >= config.maxSessionLosses) {
    violations.push("SESSION");
  }

  // Hourly 5M: losses_this_1h_5m >= max_hourly_5m
  if (state.lossesThisHour5m >= config.maxHourly5m) {
    violations.push("HOURLY_5M");
  }

  // Hourly 1M: losses_this_1h_1m >= max_hourly_1m
  if (state.lossesThisHour1m >= config.maxHourly1m) {
    violations.push("HOURLY_1M");
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------------------
// DB function: recordLoss
// ---------------------------------------------------------------------------

/**
 * Increments the appropriate loss counters in symbolStateTable.
 *
 * - losses_today += lossAmount (Decimal, cumulative monetary loss)
 * - losses_session += 1 (always incremented on any loss)
 * - losses_this_1h_5m += 1 (if timeframe is '5M')
 * - losses_this_1h_1m += 1 (if timeframe is '1M')
 */
export async function recordLoss(
  db: NodePgDatabase,
  symbol: string,
  exchange: string,
  lossAmount: Decimal | string,
  timeframe: LossTimeframe,
): Promise<void> {
  const lossStr = d(lossAmount).toString();
  const hourlyColumn =
    timeframe === "5M" ? symbolStateTable.losses_this_1h_5m : symbolStateTable.losses_this_1h_1m;

  await db
    .update(symbolStateTable)
    .set({
      losses_today: sql`COALESCE(${symbolStateTable.losses_today}, '0')::numeric + ${lossStr}::numeric`,
      losses_session: sql`COALESCE(${symbolStateTable.losses_session}, 0) + 1`,
      [hourlyColumn.name]: sql`COALESCE(${hourlyColumn}, 0) + 1`,
      updated_at: new Date(),
    })
    .where(and(eq(symbolStateTable.symbol, symbol), eq(symbolStateTable.exchange, exchange)));
}

// ---------------------------------------------------------------------------
// DB function: loadLossLimitConfig
// ---------------------------------------------------------------------------

/**
 * Reads loss limit configuration from the CommonCode table (group_code = 'LOSS_LIMIT').
 *
 * Expected codes:
 *   - max_daily_loss_pct: { value: "0.10" }
 *   - max_session_losses: { value: 3 }
 *   - max_hourly_5m:      { value: 2 }
 *   - max_hourly_1m:      { value: 1 }
 *
 * Falls back to defaults for any missing code.
 */
export async function loadLossLimitConfig(db: NodePgDatabase): Promise<LossLimitConfig> {
  const rows = await db
    .select({
      code: commonCodeTable.code,
      value: commonCodeTable.value,
    })
    .from(commonCodeTable)
    .where(and(eq(commonCodeTable.group_code, "LOSS_LIMIT"), eq(commonCodeTable.is_active, true)));

  const config: LossLimitConfig = { ...DEFAULT_CONFIG };

  for (const row of rows) {
    const val = row.value as Record<string, unknown>;
    const rawValue = val.value ?? val;

    switch (row.code) {
      case "max_daily_loss_pct":
        config.maxDailyLossPct = d(String(rawValue));
        break;
      case "max_session_losses":
        config.maxSessionLosses = Number(rawValue);
        break;
      case "max_hourly_5m":
        config.maxHourly5m = Number(rawValue);
        break;
      case "max_hourly_1m":
        config.maxHourly1m = Number(rawValue);
        break;
    }
  }

  return config;
}
