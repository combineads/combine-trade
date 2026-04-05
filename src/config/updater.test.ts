/**
 * updateCommonCode() 단위 테스트
 *
 * T-19-005: DB upsert + ANCHOR 가드
 */

import { describe, expect, it } from "bun:test";
import { AnchorModificationError } from "@/config/loader";
import { updateCommonCode } from "@/config/updater";

// ---------------------------------------------------------------------------
// Minimal DB mock
// ---------------------------------------------------------------------------

type InsertRow = {
  group_code: string;
  code: string;
  value: unknown;
  is_active: boolean;
  updated_at: Date;
};

type ConflictSet = { value: unknown; updated_at: Date };

/**
 * Creates a minimal Drizzle-compatible DB mock that records upsert calls.
 * The mock mimics the Drizzle builder chain:
 *   await db.insert(table).values(row).onConflictDoUpdate(opts)
 */
function makeMockDb() {
  const upsertCalls: InsertRow[] = [];
  const conflictSets: ConflictSet[] = [];
  let shouldThrow = false;

  const db = {
    insert: (_table: unknown) => ({
      values: (row: InsertRow) => ({
        onConflictDoUpdate: (opts: { target: unknown; set: ConflictSet }) =>
          new Promise<void>((resolve, reject) => {
            if (shouldThrow) {
              reject(new Error("DB error"));
            } else {
              upsertCalls.push(row);
              conflictSets.push(opts.set);
              resolve();
            }
          }),
      }),
    }),
  };

  return {
    db,
    upsertCalls,
    conflictSets,
    setShouldThrow: (v: boolean) => {
      shouldThrow = v;
    },
  };
}

// ---------------------------------------------------------------------------
// ANCHOR guard
// ---------------------------------------------------------------------------

describe("updateCommonCode / ANCHOR guard", () => {
  it("ANCHOR groupCode → throws AnchorModificationError", async () => {
    const { db } = makeMockDb();

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
      updateCommonCode(db as any, "ANCHOR", "bb20_length", 20),
    ).rejects.toThrow(AnchorModificationError);
  });

  it("non-ANCHOR groupCode → does not throw AnchorModificationError", async () => {
    const { db, upsertCalls } = makeMockDb();

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
      updateCommonCode(db as any, "KNN", "top_k", 50),
    ).resolves.toBeUndefined();

    expect(upsertCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Upsert behavior
// ---------------------------------------------------------------------------

describe("updateCommonCode / upsert behavior", () => {
  it("calls DB insert with correct group_code, code, value", async () => {
    const { db, upsertCalls } = makeMockDb();

    // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
    await updateCommonCode(db as any, "KNN", "top_k", 50);

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.group_code).toBe("KNN");
    expect(upsertCalls[0]?.code).toBe("top_k");
    expect(upsertCalls[0]?.value).toBe(50);
  });

  it("onConflictDoUpdate set includes value and updated_at", async () => {
    const { db, conflictSets } = makeMockDb();

    // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
    await updateCommonCode(db as any, "KNN", "top_k", 50);

    expect(conflictSets).toHaveLength(1);
    expect(conflictSets[0]?.value).toBe(50);
    expect(conflictSets[0]?.updated_at).toBeInstanceOf(Date);
  });

  it("multiple calls succeed independently", async () => {
    const { db, upsertCalls } = makeMockDb();

    // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
    await updateCommonCode(db as any, "KNN", "top_k", 50);
    // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
    await updateCommonCode(db as any, "POSITION", "max_leverage", 10);

    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0]?.group_code).toBe("KNN");
    expect(upsertCalls[1]?.group_code).toBe("POSITION");
  });

  it("propagates DB errors", async () => {
    const { db, setShouldThrow } = makeMockDb();
    setShouldThrow(true);

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: intentional cast for test
      updateCommonCode(db as any, "KNN", "top_k", 50),
    ).rejects.toThrow("DB error");
  });
});
