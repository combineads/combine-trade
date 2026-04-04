import { and, desc, eq, gte, lte } from "drizzle-orm";

import type { DbInstance } from "@/db/pool";
import type { EventLogRow } from "@/db/schema";
import { eventLogTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// EVENT_TYPES — canonical list from DATA_MODEL.md (10 event types)
// ---------------------------------------------------------------------------

export const EVENT_TYPES = Object.freeze([
  "BIAS_CHANGE",
  "WATCHING_START",
  "WATCHING_END",
  "RECONCILIATION",
  "CRASH_RECOVERY",
  "SLIPPAGE_ABORT",
  "SLIPPAGE_CLOSE",
  "STATE_CHANGE",
  "SL_REGISTERED",
  "SL_MOVED",
] as const);

export type EventType = (typeof EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// insertEvent
// ---------------------------------------------------------------------------

export interface InsertEventParams {
  event_type: string;
  symbol?: string | null;
  exchange?: string | null;
  ref_id?: string | null;
  ref_type?: string | null;
  data?: Record<string, unknown> | null;
}

/**
 * Inserts a new event into the event_log table. Append-only — no updates
 * or deletes are supported.
 *
 * @param db - Drizzle ORM database instance.
 * @param params - Event fields. Only event_type is required; all others are nullable.
 * @returns The inserted EventLogRow including the auto-generated id and created_at.
 */
export async function insertEvent(db: DbInstance, params: InsertEventParams): Promise<EventLogRow> {
  const rows = await db
    .insert(eventLogTable)
    .values({
      event_type: params.event_type,
      symbol: params.symbol ?? null,
      exchange: params.exchange ?? null,
      ref_id: params.ref_id ?? null,
      ref_type: params.ref_type ?? null,
      data: params.data ?? null,
    })
    .returning();

  // insert().returning() always returns an array; with a single insert there
  // is exactly one row.
  const row = rows[0];
  if (!row) {
    throw new Error("insertEvent: unexpected empty result from INSERT RETURNING");
  }
  return row;
}

// ---------------------------------------------------------------------------
// queryEvents
// ---------------------------------------------------------------------------

export interface QueryEventsFilters {
  event_type?: string;
  symbol?: string;
  exchange?: string;
  ref_type?: string;
  ref_id?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

const DEFAULT_LIMIT = 100;

/**
 * Queries event_log rows with optional filters. Results are ordered by
 * created_at DESC (newest first). Returns an empty array when no rows match.
 *
 * @param db - Drizzle ORM database instance.
 * @param filters - Optional filter criteria. All fields are optional.
 * @returns Array of matching EventLogRow, up to `limit` (default 100).
 */
export async function queryEvents(
  db: DbInstance,
  filters: QueryEventsFilters,
): Promise<EventLogRow[]> {
  const conditions = [];

  if (filters.event_type !== undefined) {
    conditions.push(eq(eventLogTable.event_type, filters.event_type));
  }
  if (filters.symbol !== undefined) {
    conditions.push(eq(eventLogTable.symbol, filters.symbol));
  }
  if (filters.exchange !== undefined) {
    conditions.push(eq(eventLogTable.exchange, filters.exchange));
  }
  if (filters.ref_type !== undefined) {
    conditions.push(eq(eventLogTable.ref_type, filters.ref_type));
  }
  if (filters.ref_id !== undefined) {
    conditions.push(eq(eventLogTable.ref_id, filters.ref_id));
  }
  if (filters.since !== undefined) {
    conditions.push(gte(eventLogTable.created_at, filters.since));
  }
  if (filters.until !== undefined) {
    conditions.push(lte(eventLogTable.created_at, filters.until));
  }

  const effectiveLimit = filters.limit ?? DEFAULT_LIMIT;

  const query = db
    .select()
    .from(eventLogTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(eventLogTable.created_at))
    .limit(effectiveLimit);

  return query;
}
