// ---------------------------------------------------------------------------
// Config updater — updateCommonCode
// ---------------------------------------------------------------------------
// Performs a DB upsert for a CommonCode row identified by (group_code, code).
// ANCHOR groups are rejected to protect structural strategy parameters.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { commonCodeTable } from "@/db/schema";
import { AnchorModificationError } from "./loader";
import { ANCHOR_GROUPS } from "./schema";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upserts a CommonCode row in the DB by (group_code, code).
 *
 * Uses INSERT … ON CONFLICT DO UPDATE so the row is created when absent and
 * updated when already present.
 *
 * Throws AnchorModificationError for ANCHOR group codes — structural strategy
 * parameters must not be modified at runtime.
 *
 * @param db        Drizzle DB instance.
 * @param groupCode CommonCode group identifier (e.g. "KNN", "WFO_PARAMS").
 * @param code      Code within the group (e.g. "top_k").
 * @param value     New value to persist.
 */
export async function updateCommonCode(
  // biome-ignore lint/suspicious/noExplicitAny: accepts any drizzle-compatible DB or mock
  db: Pick<PostgresJsDatabase<any>, "insert">,
  groupCode: string,
  code: string,
  value: unknown,
): Promise<void> {
  if ((ANCHOR_GROUPS as readonly string[]).includes(groupCode)) {
    throw new AnchorModificationError(groupCode);
  }

  const now = new Date();

  await db
    .insert(commonCodeTable)
    .values({
      group_code: groupCode,
      code,
      value,
      is_active: true,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [commonCodeTable.group_code, commonCodeTable.code],
      set: { value, updated_at: now },
    });
}
