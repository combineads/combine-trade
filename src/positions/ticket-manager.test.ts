/**
 * T-18-007: closeTicket() + Vector 라벨링 단일 트랜잭션 테스트
 *
 * 테스트 시나리오:
 * - closeTicket(vectorId="abc") → Vector.label WIN (pnl > 0)
 * - closeTicket(vectorId="abc") → Vector.label LOSS (pnl <= 0)
 * - closeTicket(vectorId + closeReason=TIME_EXIT) → Vector.label TIME_EXIT
 * - closeTicket(vectorId=null) → Vector 업데이트 없음, Ticket만 CLOSED
 * - DOUBLE_B + safety_passed + knn_winrate=0.70 → grade=A
 * - ONE_B → grade=C
 * - 트랜잭션 롤백: 라벨링 오류 시 Ticket close도 롤백
 * - Lock order: SymbolState → Ticket → Vector
 */

import { describe, expect, it } from "bun:test";
import type Decimal from "decimal.js";
import { d } from "@/core/decimal";
import type { CloseReason, SignalType, TradeResult, VectorGrade } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { closeTicket, type LabelingDeps } from "./ticket-manager";

// ---------------------------------------------------------------------------
// Pure labeling functions (mirrors labeling/engine.ts — injected via deps)
// ---------------------------------------------------------------------------

function classifyResult(pnl: Decimal, closeReason: CloseReason | string | null): TradeResult {
  if (closeReason === "TIME_EXIT") return "TIME_EXIT";
  if (pnl.gt(0)) return "WIN";
  return "LOSS";
}

function classifyGrade(
  signalType: SignalType,
  safetyPassed: boolean,
  knnWinrate: Decimal,
): VectorGrade {
  if (signalType === "ONE_B") return "C";
  if (safetyPassed && knnWinrate.gte(d("0.65"))) return "A";
  return "B";
}

const LABELING_DEPS: LabelingDeps = { classifyResult, classifyGrade };

// ---------------------------------------------------------------------------
// Mock DB builder
// ---------------------------------------------------------------------------

/**
 * Recorded DB operations during the transaction.
 */
type DbRecord = {
  selectQueries: string[];
  updateQueries: Array<{ table: string; values: Record<string, unknown> }>;
  lockQueries: string[];
  /** Whether the transaction completed (not rolled back) */
  committed: boolean;
};

type MockDbOptions = {
  /** SymbolState row returned by the first lookup. */
  symbolStateLookup: { symbol: string; exchange: string } | null;
  /** Ticket row returned when locking ticket FOR UPDATE. */
  ticketRow: {
    id: string;
    symbol: string;
    exchange: string;
    signal_id: string;
    state: string;
    entry_price: string;
    size: string;
    opened_at: Date;
  } | null;
  /** Signal row returned for signal_id. */
  signalRow: { signal_type: string; safety_passed: boolean } | null;
  /** knn_winrate value (null = row missing). */
  knnWinrateValue: string | null;
  /** Simulate error in transaction at this step (for rollback test). */
  throwAtStep?: "after_ticket_update" | "after_vector_lock";
};

/**
 * Detects the logical table name from a drizzle table object.
 * Drizzle tables expose a `_` property with the table name.
 * Falls back to known column-signature heuristics.
 */
function detectTableName(table: unknown): string {
  if (table === null || table === undefined) return "unknown";
  // biome-ignore lint/suspicious/noExplicitAny: runtime inspection of drizzle table
  const t = table as any;
  if (t._ && typeof t._.fullName === "string") return t._.fullName;
  if (t._ && typeof t._.name === "string") return t._.name;
  const keys = Object.keys(t);
  if (keys.includes("fsm_state") || keys.includes("execution_mode")) return "symbol_state";
  if (
    keys.includes("signal_id") &&
    keys.includes("entry_price") &&
    keys.includes("sl_price") &&
    keys.includes("direction")
  )
    return "tickets";
  if (keys.includes("signal_type") && keys.includes("safety_passed") && keys.includes("vector_id"))
    return "signals";
  if (keys.includes("signal_id") && keys.includes("key") && keys.includes("text_value"))
    return "signal_details";
  if (keys.includes("embedding") && keys.includes("labeled_at")) return "vectors";
  return "unknown";
}

/**
 * Builds a minimal mock DbInstance that records operations and returns
 * controlled data. Uses proper Promises (not thenables) throughout.
 *
 * The Drizzle DSL is mocked by returning chainable objects whose terminal
 * methods (`.for("update")`, `.limit()`, `.returning()`) return resolved Promises.
 */
function makeMockDb(opts: MockDbOptions, record: DbRecord): DbInstance {
  let lockCallOrder = 0;

  /**
   * Resolve data for a given table name based on mock options.
   */
  function resolveData(tableName: string): unknown[] {
    if (tableName === "symbol_state") return opts.symbolStateLookup ? [opts.symbolStateLookup] : [];
    if (tableName === "tickets") return opts.ticketRow ? [opts.ticketRow] : [];
    if (tableName === "signals") return opts.signalRow ? [opts.signalRow] : [];
    if (tableName === "signal_details")
      return opts.knnWinrateValue !== null ? [{ value: opts.knnWinrateValue }] : [];
    if (tableName === "vectors") return [{ id: "vec-1" }];
    return [];
  }

  /**
   * Build a chainable SELECT builder for a given table.
   *
   * Each intermediate builder is also a resolved Promise so that `await` on
   * it directly returns the data array (Drizzle's builder protocol).
   * Additional methods (.for, .limit, .where, .and) are attached to the
   * Promise object to support the full chain.
   */
  function makeSelectBuilder(tableName: string) {
    const data = resolveData(tableName);

    /** Returns a Promise resolving to `data` with extra chain methods attached. */
    function makeChain(forMode?: string): Promise<unknown[]> & {
      for: (mode: string) => Promise<unknown[]>;
      limit: (n: number) => Promise<unknown[]>;
      where: (cond: unknown) => ReturnType<typeof makeChain>;
      and: (cond: unknown) => ReturnType<typeof makeChain>;
    } {
      if (forMode === "update") {
        record.lockQueries.push(`${tableName}#${++lockCallOrder}`);
      }
      const p = Promise.resolve(data) as ReturnType<typeof makeChain>;
      // biome-ignore lint/suspicious/noExplicitAny: attaching methods to Promise
      const chain = p as any;
      chain.for = (mode: string) => makeChain(mode);
      chain.limit = (_n: number) => Promise.resolve(data);
      chain.where = (_cond: unknown) => makeChain();
      chain.and = (_cond: unknown) => makeChain();
      return chain;
    }

    return {
      where: (_cond: unknown) => makeChain(),
      for: (mode: string) => makeChain(mode),
      limit: (_n: number) => Promise.resolve(data),
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock needs loose typing
  const tx: any = {
    select: (_fields?: unknown) => ({
      from: (table: unknown) => {
        const tableName = detectTableName(table);
        record.selectQueries.push(tableName);
        return makeSelectBuilder(tableName);
      },
    }),

    update: (table: unknown) => {
      const tableName = detectTableName(table);
      return {
        set: (values: Record<string, unknown>) => {
          record.updateQueries.push({ table: tableName, values });

          if (opts.throwAtStep === "after_ticket_update" && tableName === "tickets") {
            throw new Error("Simulated error after ticket update");
          }
          if (opts.throwAtStep === "after_vector_lock" && tableName === "vectors") {
            throw new Error("Simulated error in vector update");
          }

          return {
            where: (_cond: unknown) => ({
              returning: () => {
                if (tableName === "tickets" && opts.ticketRow) {
                  return Promise.resolve([
                    {
                      ...opts.ticketRow,
                      state: "CLOSED",
                      close_reason: "SL",
                      result: "WIN",
                      pnl: "100",
                      pnl_pct: "0.1",
                      hold_duration_sec: 3600,
                      closed_at: new Date(),
                      updated_at: new Date(),
                    },
                  ]);
                }
                return Promise.resolve([]);
              },
            }),
          };
        },
      };
    },

    insert: (_table: unknown) => ({
      values: (_vals: unknown) => ({
        returning: () => Promise.resolve([]),
      }),
    }),
  };

  // biome-ignore lint/suspicious/noExplicitAny: mock needs loose typing
  const db: any = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await fn(tx);
        record.committed = true;
        return result;
      } catch (err) {
        record.committed = false;
        throw err;
      }
    },
  };

  return db as DbInstance;
}

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeDefaultTicketRow() {
  return {
    id: "ticket-1",
    symbol: "BTC/USDT",
    exchange: "binance",
    signal_id: "signal-1",
    state: "INITIAL",
    entry_price: "50000",
    size: "0.001",
    opened_at: new Date(Date.now() - 3600_000),
  };
}

function makeDefaultSymbolStateLookup() {
  return { symbol: "BTC/USDT", exchange: "binance" };
}

function makeRecord(): DbRecord {
  return { selectQueries: [], updateQueries: [], lockQueries: [], committed: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("closeTicket() — core behavior (no vector labeling)", () => {
  it("vectorId=null → Ticket CLOSED, no Vector update", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "LOSS",
      pnl: "-50",
      vectorId: null,
      labelingDeps: LABELING_DEPS,
    });

    expect(record.committed).toBe(true);
    expect(record.updateQueries.filter((q) => q.table === "vectors")).toHaveLength(0);
    expect(record.updateQueries.filter((q) => q.table === "tickets").length).toBeGreaterThan(0);
  });

  it("vectorId=undefined → treated as null, no Vector update", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "LOSS",
      pnl: "-50",
      labelingDeps: LABELING_DEPS,
      // vectorId not provided
    });

    expect(record.committed).toBe(true);
    expect(record.updateQueries.filter((q) => q.table === "vectors")).toHaveLength(0);
  });
});

describe("classifyResult — pure function", () => {
  it("pnl > 0 → WIN", () => {
    expect(classifyResult(d("100"), "SL")).toBe("WIN");
  });

  it("pnl = 0 → LOSS", () => {
    expect(classifyResult(d("0"), "SL")).toBe("LOSS");
  });

  it("pnl < 0 → LOSS", () => {
    expect(classifyResult(d("-50"), "SL")).toBe("LOSS");
  });

  it("closeReason = TIME_EXIT → TIME_EXIT (pnl positive)", () => {
    expect(classifyResult(d("100"), "TIME_EXIT")).toBe("TIME_EXIT");
  });

  it("closeReason = TIME_EXIT → TIME_EXIT (pnl negative)", () => {
    expect(classifyResult(d("-100"), "TIME_EXIT")).toBe("TIME_EXIT");
  });
});

describe("classifyGrade — pure function", () => {
  it("DOUBLE_B + safety_passed + knnWinrate=0.70 → A", () => {
    expect(classifyGrade("DOUBLE_B", true, d("0.70"))).toBe("A");
  });

  it("DOUBLE_B + safety_passed + knnWinrate=0.65 (boundary) → A", () => {
    expect(classifyGrade("DOUBLE_B", true, d("0.65"))).toBe("A");
  });

  it("DOUBLE_B + safety_passed + knnWinrate=0.64 → B", () => {
    expect(classifyGrade("DOUBLE_B", true, d("0.64"))).toBe("B");
  });

  it("DOUBLE_B + safety_passed=false → B", () => {
    expect(classifyGrade("DOUBLE_B", false, d("0.70"))).toBe("B");
  });

  it("ONE_B → C (safety_passed=true, winrate=0.90)", () => {
    expect(classifyGrade("ONE_B", true, d("0.90"))).toBe("C");
  });

  it("ONE_B → C (safety_passed=false, winrate=0)", () => {
    expect(classifyGrade("ONE_B", false, d("0"))).toBe("C");
  });
});

describe("closeTicket() — vector labeling integration", () => {
  it("vectorId + pnl > 0 → label=WIN on vector update", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "WIN",
      pnl: "100",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    expect(record.committed).toBe(true);
    const vUpdates = record.updateQueries.filter((q) => q.table === "vectors");
    expect(vUpdates).toHaveLength(1);
    expect(vUpdates[0]?.values.label).toBe("WIN");
  });

  it("vectorId + pnl <= 0 → label=LOSS on vector update", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "LOSS",
      pnl: "-50",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    expect(record.committed).toBe(true);
    const vUpdates = record.updateQueries.filter((q) => q.table === "vectors");
    expect(vUpdates).toHaveLength(1);
    expect(vUpdates[0]?.values.label).toBe("LOSS");
  });

  it("vectorId + closeReason=TIME_EXIT → label=TIME_EXIT on vector update", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "TIME_EXIT",
      result: "TIME_EXIT",
      pnl: "50",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    expect(record.committed).toBe(true);
    const vUpdates = record.updateQueries.filter((q) => q.table === "vectors");
    expect(vUpdates).toHaveLength(1);
    expect(vUpdates[0]?.values.label).toBe("TIME_EXIT");
  });

  it("DOUBLE_B + safety_passed + knnWinrate=0.70 → grade=A", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "WIN",
      pnl: "100",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    const vUpdates = record.updateQueries.filter((q) => q.table === "vectors");
    expect(vUpdates).toHaveLength(1);
    expect(vUpdates[0]?.values.grade).toBe("A");
  });

  it("ONE_B signal → grade=C", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "ONE_B", safety_passed: false },
        knnWinrateValue: null,
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "LOSS",
      pnl: "-50",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    const vUpdates = record.updateQueries.filter((q) => q.table === "vectors");
    expect(vUpdates).toHaveLength(1);
    expect(vUpdates[0]?.values.grade).toBe("C");
  });

  it("knn_winrate row absent → defaults to 0 → grade=B for DOUBLE_B", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: null,
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "WIN",
      pnl: "100",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    const vUpdates = record.updateQueries.filter((q) => q.table === "vectors");
    expect(vUpdates).toHaveLength(1);
    expect(vUpdates[0]?.values.grade).toBe("B");
  });
});

describe("closeTicket() — lock order verification", () => {
  it("with vectorId: SymbolState → Ticket → Vector lock order", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "WIN",
      pnl: "100",
      vectorId: "vec-1",
      labelingDeps: LABELING_DEPS,
    });

    const tables = record.lockQueries.map((q) => q.split("#")[0]);
    const symbolStateIdx = tables.indexOf("symbol_state");
    const ticketIdx = tables.indexOf("tickets");
    const vectorIdx = tables.indexOf("vectors");

    expect(symbolStateIdx).toBeGreaterThanOrEqual(0);
    expect(ticketIdx).toBeGreaterThanOrEqual(0);
    expect(vectorIdx).toBeGreaterThanOrEqual(0);
    expect(symbolStateIdx).toBeLessThan(ticketIdx);
    expect(ticketIdx).toBeLessThan(vectorIdx);
  });

  it("vectorId=null: no vector lock acquired", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "SL",
      result: "WIN",
      pnl: "100",
      vectorId: null,
      labelingDeps: LABELING_DEPS,
    });

    const tables = record.lockQueries.map((q) => q.split("#")[0]);
    expect(tables.includes("vectors")).toBe(false);
  });
});

describe("closeTicket() — transaction rollback on error", () => {
  it("error in vector update → transaction rolls back (committed=false)", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
        throwAtStep: "after_vector_lock",
      },
      record,
    );

    await expect(
      closeTicket(db, "ticket-1", {
        closeReason: "SL",
        result: "WIN",
        pnl: "100",
        vectorId: "vec-1",
        labelingDeps: LABELING_DEPS,
      }),
    ).rejects.toThrow();

    expect(record.committed).toBe(false);
  });

  it("error after ticket update → entire transaction rolls back", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
        throwAtStep: "after_ticket_update",
      },
      record,
    );

    await expect(
      closeTicket(db, "ticket-1", {
        closeReason: "SL",
        result: "WIN",
        pnl: "100",
        vectorId: "vec-1",
        labelingDeps: LABELING_DEPS,
      }),
    ).rejects.toThrow();

    expect(record.committed).toBe(false);
  });
});

describe("closeTicket() — labelingDeps absent (Panic Close scenario)", () => {
  it("vectorId provided but labelingDeps absent → skip labeling, ticket still closed", async () => {
    const record = makeRecord();
    const db = makeMockDb(
      {
        symbolStateLookup: makeDefaultSymbolStateLookup(),
        ticketRow: makeDefaultTicketRow(),
        signalRow: { signal_type: "DOUBLE_B", safety_passed: true },
        knnWinrateValue: "0.70",
      },
      record,
    );

    await closeTicket(db, "ticket-1", {
      closeReason: "PANIC_CLOSE",
      result: "LOSS",
      pnl: "-200",
      vectorId: "vec-1",
      // labelingDeps intentionally omitted
    });

    expect(record.committed).toBe(true);
    expect(record.updateQueries.filter((q) => q.table === "vectors")).toHaveLength(0);
  });
});
