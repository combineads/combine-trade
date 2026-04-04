import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { BlockType } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { tradeBlockTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// Recurrence rule shapes
// ---------------------------------------------------------------------------

interface MarketOpenRule {
  utc_hour: number;
  duration_min: number;
}

interface FundingRule {
  utc_hours: number[];
  duration_min: number;
}

type RecurrenceRule = MarketOpenRule | FundingRule;

// ---------------------------------------------------------------------------
// Pure time-matching helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Returns true if `now` falls within the MARKET_OPEN block defined by the rule.
 * Window: [utc_hour, utc_hour + duration_min / 60) in UTC.
 *
 * utc_hour may be fractional (e.g. 13.5 = 13:30 UTC).
 */
export function isInMarketOpenWindow(rule: MarketOpenRule, now: Date): boolean {
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinutes = Math.floor(rule.utc_hour * 60);
  const endMinutes = startMinutes + rule.duration_min;

  // Handle day wrap-around: if endMinutes >= 1440 (24*60) the window crosses midnight
  if (endMinutes >= 1440) {
    // blocked either at the tail of the day or the head of the next
    return nowMinutes >= startMinutes || nowMinutes < endMinutes - 1440;
  }

  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

/**
 * Returns true if `now` falls within any FUNDING block defined by the rule.
 * Each funding window: [utc_hour - duration_min/2, utc_hour + duration_min/2).
 */
export function isInFundingWindow(rule: FundingRule, now: Date): boolean {
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const halfMin = rule.duration_min / 2;

  for (const utcHour of rule.utc_hours) {
    const centerMinutes = utcHour * 60;
    const startMinutes = centerMinutes - halfMin;
    const endMinutes = centerMinutes + halfMin;

    // Normalize for midnight wrap-around
    // e.g. utc_hour=0 → center=0, start=-15, end=+15
    if (startMinutes < 0) {
      // window spans midnight: now is in [1440+startMinutes, 1440) OR [0, endMinutes)
      if (nowMinutes >= 1440 + startMinutes || nowMinutes < endMinutes) {
        return true;
      }
    } else if (endMinutes >= 1440) {
      // window spans midnight: now is in [startMinutes, 1440) OR [0, endMinutes-1440)
      if (nowMinutes >= startMinutes || nowMinutes < endMinutes - 1440) {
        return true;
      }
    } else {
      if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluates a single recurrence_rule against `now`.
 * Returns true if `now` is inside the block window.
 */
export function matchesRecurrenceRule(blockType: string, rule: RecurrenceRule, now: Date): boolean {
  if (blockType === "MARKET_OPEN") {
    return isInMarketOpenWindow(rule as MarketOpenRule, now);
  }

  if (blockType === "FUNDING") {
    return isInFundingWindow(rule as FundingRule, now);
  }

  return false;
}

// ---------------------------------------------------------------------------
// isTradeBlocked
// ---------------------------------------------------------------------------

/**
 * Checks whether trading is currently blocked by any active TradeBlock rule.
 *
 * Two categories are evaluated:
 * 1. Recurring patterns (is_recurring=true): recurrence_rule is evaluated
 *    against `now` using UTC time matching.
 * 2. One-time events (is_recurring=false): blocked if start_time <= now <= end_time.
 *
 * Fail-closed: any DB error returns { blocked: true, reason: 'DB error — fail-closed' }.
 */
export async function isTradeBlocked(
  db: DbInstance,
  now: Date,
): Promise<{ blocked: boolean; reason?: string }> {
  try {
    // Query all recurring rows
    const recurringRows = await db
      .select()
      .from(tradeBlockTable)
      .where(eq(tradeBlockTable.is_recurring, true));

    for (const row of recurringRows) {
      if (row.recurrence_rule == null) {
        continue;
      }

      const rule = row.recurrence_rule as RecurrenceRule;
      if (matchesRecurrenceRule(row.block_type, rule, now)) {
        return { blocked: true, reason: row.reason ?? row.block_type };
      }
    }

    // Query one-time rows active at `now`
    const oneTimeRows = await db
      .select()
      .from(tradeBlockTable)
      .where(
        and(
          eq(tradeBlockTable.is_recurring, false),
          lte(tradeBlockTable.start_time, now),
          gte(tradeBlockTable.end_time, now),
        ),
      );

    if (oneTimeRows.length > 0) {
      const first = oneTimeRows[0];
      const reason = first ? (first.reason ?? first.block_type) : undefined;
      return reason !== undefined ? { blocked: true, reason } : { blocked: true };
    }

    return { blocked: false };
  } catch {
    return { blocked: true, reason: "DB error — fail-closed" };
  }
}

// ---------------------------------------------------------------------------
// seedTradeBlocks
// ---------------------------------------------------------------------------

/**
 * Fixed recurring trade-block seed data (5 patterns).
 * UPSERT by reason string to ensure idempotency.
 */
const SEED_PATTERNS: Array<{
  block_type: BlockType;
  reason: string;
  recurrence_rule: RecurrenceRule;
}> = [
  {
    block_type: "MARKET_OPEN",
    reason: "아시아장 00:00-02:00 UTC",
    recurrence_rule: { utc_hour: 0, duration_min: 120 },
  },
  {
    block_type: "MARKET_OPEN",
    reason: "유럽장 07:00-09:00 UTC",
    recurrence_rule: { utc_hour: 7, duration_min: 120 },
  },
  {
    block_type: "MARKET_OPEN",
    reason: "미국장(S) 13:30-15:30 UTC",
    recurrence_rule: { utc_hour: 13.5, duration_min: 120 },
  },
  {
    block_type: "MARKET_OPEN",
    reason: "미국장(W) 14:30-16:30 UTC",
    recurrence_rule: { utc_hour: 14.5, duration_min: 120 },
  },
  {
    block_type: "FUNDING",
    reason: "펀딩 0/8/16시 ±15분 UTC",
    recurrence_rule: { utc_hours: [0, 8, 16], duration_min: 30 },
  },
];

/**
 * Inserts 5 fixed recurring trade-block patterns.
 * Idempotent: skips any pattern whose reason already exists as a recurring row.
 * start_time / end_time are set to epoch sentinels — they are irrelevant for
 * recurring rows (time matching is done via recurrence_rule at runtime).
 */
export async function seedTradeBlocks(db: DbInstance): Promise<void> {
  // Sentinel timestamps — recurring rows do not use start/end time
  const EPOCH = new Date(0);

  const seedReasons = SEED_PATTERNS.map((p) => p.reason);

  // Fetch existing seed reasons to skip already-present rows
  const existing = await db
    .select({ reason: tradeBlockTable.reason })
    .from(tradeBlockTable)
    .where(
      and(eq(tradeBlockTable.is_recurring, true), inArray(tradeBlockTable.reason, seedReasons)),
    );

  const existingReasons = new Set(existing.map((r) => r.reason));

  for (const pattern of SEED_PATTERNS) {
    if (existingReasons.has(pattern.reason)) {
      continue;
    }

    await db.insert(tradeBlockTable).values({
      block_type: pattern.block_type,
      start_time: EPOCH,
      end_time: EPOCH,
      reason: pattern.reason,
      is_recurring: true,
      recurrence_rule: pattern.recurrence_rule,
    });
  }
}

// ---------------------------------------------------------------------------
// addOneTimeBlock
// ---------------------------------------------------------------------------

export interface OneTimeBlockParams {
  block_type: BlockType;
  start_time: Date;
  end_time: Date;
  reason?: string;
  source_data?: unknown;
}

/**
 * Inserts a one-time trade block (is_recurring=false).
 */
export async function addOneTimeBlock(db: DbInstance, params: OneTimeBlockParams): Promise<void> {
  await db.insert(tradeBlockTable).values({
    block_type: params.block_type,
    start_time: params.start_time,
    end_time: params.end_time,
    reason: params.reason ?? null,
    is_recurring: false,
    recurrence_rule: null,
    source_data: params.source_data ?? null,
  });
}
