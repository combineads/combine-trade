/**
 * 3-tier loss limit check -- pure function + DB helpers.
 *
 * checkLossLimit() is a pure function (no DB, no side effects).
 * recordLoss() and loadLossLimitConfig() handle DB interaction.
 * shouldReset*() are pure time-boundary functions.
 * reset*() functions handle DB writes for counter resets.
 * resetAllExpired() orchestrates checking + resetting all counters.
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

/** Timestamps of the last resets, used by resetAllExpired(). */
export interface LastResets {
  /** When the daily counter was last reset. */
  lastDailyReset: Date;
  /** When the hourly counters were last reset. */
  lastHourlyReset: Date;
  /** Session start time (market open). Omit if not applicable. */
  sessionStartTime?: Date | undefined;
}

/** Result of resetAllExpired() indicating which resets were performed. */
export interface ResetResult {
  /** true if losses_today was reset. */
  dailyReset: boolean;
  /** true if losses_session was reset. */
  sessionReset: boolean;
  /** true if losses_this_1h_5m and losses_this_1h_1m were reset. */
  hourlyReset: boolean;
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

// ---------------------------------------------------------------------------
// Pure function: shouldResetDaily
// ---------------------------------------------------------------------------

/**
 * Returns true when `now` is on a different UTC day than `lastResetTime`,
 * indicating the daily loss counter should be reset (UTC 00:00 boundary).
 *
 * Pure function -- deterministic given the same inputs.
 */
export function shouldResetDaily(now: Date, lastResetTime: Date): boolean {
  return utcDateKey(now) !== utcDateKey(lastResetTime);
}

// ---------------------------------------------------------------------------
// Pure function: shouldResetSession
// ---------------------------------------------------------------------------

/**
 * Returns true when `now` is at or after `sessionStartTime`, indicating the
 * session (market open) loss counter should be reset.
 *
 * Pure function -- deterministic given the same inputs.
 */
export function shouldResetSession(now: Date, sessionStartTime: Date): boolean {
  return now.getTime() >= sessionStartTime.getTime();
}

// ---------------------------------------------------------------------------
// Pure function: shouldResetHourly
// ---------------------------------------------------------------------------

/**
 * Returns true when `now` is in a different UTC hour than `lastResetTime`,
 * indicating the hourly loss counters should be reset (HH:00 boundary).
 *
 * Pure function -- deterministic given the same inputs.
 */
export function shouldResetHourly(now: Date, lastResetTime: Date): boolean {
  return utcHourKey(now) !== utcHourKey(lastResetTime);
}

// ---------------------------------------------------------------------------
// DB function: resetDailyLosses
// ---------------------------------------------------------------------------

/**
 * Resets the daily loss counter (losses_today) to '0' for the given symbol.
 */
export async function resetDailyLosses(
  db: NodePgDatabase,
  symbol: string,
  exchange: string,
): Promise<void> {
  await db
    .update(symbolStateTable)
    .set({
      losses_today: "0",
      updated_at: new Date(),
    })
    .where(and(eq(symbolStateTable.symbol, symbol), eq(symbolStateTable.exchange, exchange)));
}

// ---------------------------------------------------------------------------
// DB function: resetSessionLosses
// ---------------------------------------------------------------------------

/**
 * Resets the session loss counter (losses_session) to 0 for the given symbol.
 */
export async function resetSessionLosses(
  db: NodePgDatabase,
  symbol: string,
  exchange: string,
): Promise<void> {
  await db
    .update(symbolStateTable)
    .set({
      losses_session: 0,
      updated_at: new Date(),
    })
    .where(and(eq(symbolStateTable.symbol, symbol), eq(symbolStateTable.exchange, exchange)));
}

// ---------------------------------------------------------------------------
// DB function: resetHourlyLosses
// ---------------------------------------------------------------------------

/**
 * Resets the hourly loss counters (losses_this_1h_5m, losses_this_1h_1m)
 * to 0 for the given symbol.
 */
export async function resetHourlyLosses(
  db: NodePgDatabase,
  symbol: string,
  exchange: string,
): Promise<void> {
  await db
    .update(symbolStateTable)
    .set({
      losses_this_1h_5m: 0,
      losses_this_1h_1m: 0,
      updated_at: new Date(),
    })
    .where(and(eq(symbolStateTable.symbol, symbol), eq(symbolStateTable.exchange, exchange)));
}

// ---------------------------------------------------------------------------
// Orchestrator: resetAllExpired
// ---------------------------------------------------------------------------

/**
 * Checks all time boundaries and resets the appropriate loss counters.
 *
 * Multiple resets can trigger simultaneously (e.g., midnight = daily + hourly).
 * Session reset only fires when sessionStartTime is provided.
 */
export async function resetAllExpired(
  db: NodePgDatabase,
  symbol: string,
  exchange: string,
  now: Date,
  lastResets: LastResets,
): Promise<ResetResult> {
  const dailyReset = shouldResetDaily(now, lastResets.lastDailyReset);
  const sessionReset =
    lastResets.sessionStartTime !== undefined &&
    shouldResetSession(now, lastResets.sessionStartTime);
  const hourlyReset = shouldResetHourly(now, lastResets.lastHourlyReset);

  // Execute all applicable resets (they are independent -- no ordering needed)
  const promises: Promise<void>[] = [];
  if (dailyReset) promises.push(resetDailyLosses(db, symbol, exchange));
  if (sessionReset) promises.push(resetSessionLosses(db, symbol, exchange));
  if (hourlyReset) promises.push(resetHourlyLosses(db, symbol, exchange));

  await Promise.all(promises);

  return { dailyReset, sessionReset, hourlyReset };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a string key "YYYY-MM-DD" for the UTC date of the given timestamp. */
function utcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

/** Returns a string key "YYYY-MM-DD-HH" for the UTC date+hour of the given timestamp. */
function utcHourKey(date: Date): string {
  return `${utcDateKey(date)}-${date.getUTCHours()}`;
}
