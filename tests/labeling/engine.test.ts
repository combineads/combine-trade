import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "../../src/db/pool";
import type { DbInstance } from "../../src/db/pool";
import {
  signalTable,
  signalDetailTable,
  ticketTable,
  vectorTable,
} from "../../src/db/schema";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";
import {
  classifyResult,
  classifyGrade,
  finalizeLabel,
  TicketNotFoundError,
} from "../../src/labeling/engine";
import { d } from "../../src/core/decimal";

// ---------------------------------------------------------------------------
// Pure function tests — no DB required
// ---------------------------------------------------------------------------

describe("labeling engine — classifyResult (pure)", () => {
  it("returns WIN when pnl > 0", () => {
    expect(classifyResult(d("100.50"), null)).toBe("WIN");
  });

  it("returns LOSS when pnl < 0", () => {
    expect(classifyResult(d("-50.00"), null)).toBe("LOSS");
  });

  it("returns LOSS when pnl = 0 (no profit = loss)", () => {
    expect(classifyResult(d("0"), null)).toBe("LOSS");
  });

  it("returns TIME_EXIT when closeReason=TIME_EXIT regardless of positive pnl", () => {
    expect(classifyResult(d("200.00"), "TIME_EXIT")).toBe("TIME_EXIT");
  });

  it("returns TIME_EXIT when closeReason=TIME_EXIT regardless of negative pnl", () => {
    expect(classifyResult(d("-100.00"), "TIME_EXIT")).toBe("TIME_EXIT");
  });

  it("returns WIN when closeReason is SL but pnl > 0", () => {
    // Non-TIME_EXIT close reasons do not override pnl-based classification
    expect(classifyResult(d("10.00"), "SL")).toBe("WIN");
  });

  it("returns LOSS when closeReason is TP1 but pnl <= 0", () => {
    expect(classifyResult(d("0"), "TP1")).toBe("LOSS");
  });
});

describe("labeling engine — classifyGrade (pure)", () => {
  it("returns A for DOUBLE_B + safety_passed + winrate >= 0.65", () => {
    expect(classifyGrade("DOUBLE_B", true, d("0.70"))).toBe("A");
  });

  it("returns A for DOUBLE_B + safety_passed + winrate exactly 0.65 (boundary)", () => {
    expect(classifyGrade("DOUBLE_B", true, d("0.65"))).toBe("A");
  });

  it("returns B for DOUBLE_B + safety_passed + winrate < 0.65", () => {
    expect(classifyGrade("DOUBLE_B", true, d("0.60"))).toBe("B");
  });

  it("returns B for DOUBLE_B + safety_failed (regardless of winrate)", () => {
    expect(classifyGrade("DOUBLE_B", false, d("0.90"))).toBe("B");
  });

  it("returns C for ONE_B regardless of safety and winrate", () => {
    expect(classifyGrade("ONE_B", true, d("0.90"))).toBe("C");
  });

  it("returns C for ONE_B with safety=false", () => {
    expect(classifyGrade("ONE_B", false, d("0.50"))).toBe("C");
  });
});

// ---------------------------------------------------------------------------
// DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

// Shared helpers for setting up prerequisite rows
async function insertParentSymbol(
  symbol = "BTC/USDT",
  exchange = "binance",
): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;
}

async function insertWatchSession(
  symbol = "BTC/USDT",
  exchange = "binance",
): Promise<string> {
  const pool = getPool();
  await pool`
    UPDATE watch_session
    SET invalidated_at = now(), invalidation_reason = 'test cleanup'
    WHERE symbol = ${symbol} AND exchange = ${exchange} AND invalidated_at IS NULL
  `;
  const result = await pool`
    INSERT INTO watch_session
      (symbol, exchange, detection_type, direction, detected_at)
    VALUES
      (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${"LONG"}, now())
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertSignal(opts: {
  watchSessionId: string;
  symbol?: string;
  exchange?: string;
  signalType?: string;
  safetyPassed?: boolean;
  knnDecision?: string | null;
  vectorId?: string | null;
}): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO signals
      (symbol, exchange, watch_session_id, timeframe, signal_type, direction,
       entry_price, sl_price, safety_passed, knn_decision, vector_id)
    VALUES
      (${opts.symbol ?? "BTC/USDT"}, ${opts.exchange ?? "binance"},
       ${opts.watchSessionId}, ${"5M"},
       ${opts.signalType ?? "DOUBLE_B"}, ${"LONG"},
       ${"85000.00"}, ${"84500.00"},
       ${opts.safetyPassed ?? true},
       ${opts.knnDecision ?? null},
       ${opts.vectorId ?? null})
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertSignalDetail(
  signalId: string,
  key: string,
  value: string,
): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO signal_details (signal_id, key, value)
    VALUES (${signalId}, ${key}, ${value})
  `;
}

async function insertCandle(
  symbol = "BTC/USDT",
  exchange = "binance",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO candles
      (symbol, exchange, timeframe, open_time, open, high, low, close, volume, is_closed)
    VALUES
      (${symbol}, ${exchange}, ${"5M"}, now(), ${"85000"}, ${"85500"}, ${"84500"}, ${"85100"}, ${"1000"}, ${true})
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertVector(
  candleId: string,
  symbol = "BTC/USDT",
  exchange = "binance",
): Promise<string> {
  const pool = getPool();
  // Build a 202-dimensional zero vector
  const zeroVec = `[${Array(202).fill("0").join(",")}]`;
  const result = await pool`
    INSERT INTO vectors
      (candle_id, symbol, exchange, timeframe, embedding)
    VALUES
      (${candleId}, ${symbol}, ${exchange}, ${"5M"}, ${zeroVec}::vector)
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertSymbolState(
  symbol = "BTC/USDT",
  exchange = "binance",
  fsmState = "IDLE",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO symbol_state (symbol, exchange, fsm_state)
    VALUES (${symbol}, ${exchange}, ${fsmState})
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertClosedTicket(opts: {
  signalId: string;
  symbol?: string;
  exchange?: string;
  closeReason?: string;
  pnl?: string;
  result?: string | null;
}): Promise<string> {
  const pool = getPool();
  const openedAt = new Date(Date.now() - 3600000).toISOString();
  const closedAt = new Date().toISOString();
  const result = await pool`
    INSERT INTO tickets
      (symbol, exchange, signal_id, timeframe, direction, state,
       entry_price, sl_price, current_sl_price, size, remaining_size,
       leverage, opened_at, closed_at, close_reason, pnl, result)
    VALUES
      (${opts.symbol ?? "BTC/USDT"}, ${opts.exchange ?? "binance"},
       ${opts.signalId}, ${"5M"}, ${"LONG"}, ${"CLOSED"},
       ${"85000.00"}, ${"84500.00"}, ${"84500.00"},
       ${"0.10"}, ${"0"},
       ${10}, ${openedAt}::timestamptz, ${closedAt}::timestamptz,
       ${opts.closeReason ?? "SL"}, ${opts.pnl ?? "100.00"},
       ${opts.result ?? null})
    RETURNING id
  `;
  return result[0]!.id as string;
}

// ---------------------------------------------------------------------------
// finalizeLabel — DB integration tests
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("labeling engine — finalizeLabel (DB)", () => {
  let db: DbInstance;

  beforeAll(async () => {
    await initTestDb();
    db = getDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  it("labels vector with WIN and grade A when conditions are met", async () => {
    // Setup: symbol → watch_session → signal (DOUBLE_B, safety=true)
    //        → signal_detail (knn_winrate=0.70)
    //        → candle → vector (unlabeled)
    //        → ticket (CLOSED, pnl > 0)
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "DOUBLE_B",
      safetyPassed: true,
      knnDecision: "PASS",
      vectorId,
    });
    await insertSignalDetail(signalId, "knn_winrate", "0.70");
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "TP1",
      pnl: "150.00",
    });

    await finalizeLabel(db, ticketId, vectorId);

    // Verify vector was updated
    const pool = getPool();
    const vectors = await pool`SELECT label, grade, labeled_at FROM vectors WHERE id = ${vectorId}`;
    const vec = vectors[0]!;
    expect(vec.label).toBe("WIN");
    expect(vec.grade).toBe("A");
    expect(vec.labeled_at).not.toBeNull();
  });

  it("labels vector with LOSS and grade B when DOUBLE_B but winrate < 0.65", async () => {
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "DOUBLE_B",
      safetyPassed: true,
      knnDecision: "PASS",
      vectorId,
    });
    await insertSignalDetail(signalId, "knn_winrate", "0.60");
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "SL",
      pnl: "-50.00",
    });

    await finalizeLabel(db, ticketId, vectorId);

    const pool = getPool();
    const vectors = await pool`SELECT label, grade, labeled_at FROM vectors WHERE id = ${vectorId}`;
    const vec = vectors[0]!;
    expect(vec.label).toBe("LOSS");
    expect(vec.grade).toBe("B");
    expect(vec.labeled_at).not.toBeNull();
  });

  it("labels vector with grade C when ONE_B signal", async () => {
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "ONE_B",
      safetyPassed: false,
      knnDecision: null,
      vectorId,
    });
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "SL",
      pnl: "-30.00",
    });

    await finalizeLabel(db, ticketId, vectorId);

    const pool = getPool();
    const vectors = await pool`SELECT label, grade FROM vectors WHERE id = ${vectorId}`;
    expect(vectors[0]!.label).toBe("LOSS");
    expect(vectors[0]!.grade).toBe("C");
  });

  it("sets TIME_EXIT label when close_reason is TIME_EXIT", async () => {
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "DOUBLE_B",
      safetyPassed: true,
      vectorId,
    });
    await insertSignalDetail(signalId, "knn_winrate", "0.70");
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "TIME_EXIT",
      pnl: "20.00",
    });

    await finalizeLabel(db, ticketId, vectorId);

    const pool = getPool();
    const vectors = await pool`SELECT label FROM vectors WHERE id = ${vectorId}`;
    expect(vectors[0]!.label).toBe("TIME_EXIT");
  });

  it("skips vector update when vectorId is null (ticket-only finalization)", async () => {
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "DOUBLE_B",
      safetyPassed: true,
    });
    await insertSignalDetail(signalId, "knn_winrate", "0.70");
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "TP1",
      pnl: "100.00",
    });

    // Should NOT throw when vectorId is null
    const result = await finalizeLabel(db, ticketId, null);
    expect(result.label).toBe("WIN");
    expect(result.grade).toBe("A");
  });

  it("throws TicketNotFoundError for non-existent ticket", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await expect(finalizeLabel(db, fakeId, null)).rejects.toThrow(TicketNotFoundError);
  });

  it("uses default knn_winrate of 0 when signal_detail has no knn_winrate", async () => {
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "DOUBLE_B",
      safetyPassed: true,
      knnDecision: "SKIP",
      vectorId,
    });
    // No signal_detail for knn_winrate — should default to 0, so grade = B
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "TP2",
      pnl: "200.00",
    });

    await finalizeLabel(db, ticketId, vectorId);

    const pool = getPool();
    const vectors = await pool`SELECT label, grade FROM vectors WHERE id = ${vectorId}`;
    expect(vectors[0]!.label).toBe("WIN");
    expect(vectors[0]!.grade).toBe("B"); // Default winrate=0 < 0.65
  });

  it("updates ticket.result in the same transaction", async () => {
    await insertParentSymbol();
    await insertSymbolState();
    const watchSessionId = await insertWatchSession();
    const candleId = await insertCandle();
    const vectorId = await insertVector(candleId);
    const signalId = await insertSignal({
      watchSessionId,
      signalType: "DOUBLE_B",
      safetyPassed: true,
      vectorId,
    });
    await insertSignalDetail(signalId, "knn_winrate", "0.80");
    const ticketId = await insertClosedTicket({
      signalId,
      closeReason: "TP1",
      pnl: "120.00",
      result: null, // result not set yet
    });

    await finalizeLabel(db, ticketId, vectorId);

    // Verify ticket.result was updated
    const pool = getPool();
    const tickets = await pool`SELECT result FROM tickets WHERE id = ${ticketId}`;
    expect(tickets[0]!.result).toBe("WIN");
  });
});
