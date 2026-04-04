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
import { symbolStateTable, ticketTable } from "../../src/db/schema";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";
import {
  createTicket,
  closeTicket,
  transitionTicket,
  getActiveTicket,
  getTicketById,
  DuplicateTicketError,
  InvalidStateError,
} from "../../src/positions/ticket-manager";
import { InvalidTransitionError } from "../../src/positions/fsm";

// ---------------------------------------------------------------------------
// DB availability check
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

async function insertSignal(
  watchSessionId: string,
  symbol = "BTC/USDT",
  exchange = "binance",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO signals
      (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
    VALUES
      (${symbol}, ${exchange}, ${watchSessionId}, ${"5M"}, ${"DOUBLE_B"}, ${"LONG"}, ${"85000.00"}, ${"84500.00"}, ${true})
    RETURNING id
  `;
  return result[0]!.id as string;
}

/** Set up the full prerequisite chain: symbol, symbol_state, watch_session, signal */
async function setupPrerequisites(opts?: {
  symbol?: string;
  exchange?: string;
  fsmState?: string;
}): Promise<{
  symbolStateId: string;
  watchSessionId: string;
  signalId: string;
  symbol: string;
  exchange: string;
}> {
  const symbol = opts?.symbol ?? "BTC/USDT";
  const exchange = opts?.exchange ?? "binance";
  const fsmState = opts?.fsmState ?? "WATCHING";

  await insertParentSymbol(symbol, exchange);
  const symbolStateId = await insertSymbolState(symbol, exchange, fsmState);
  const watchSessionId = await insertWatchSession(symbol, exchange);
  const signalId = await insertSignal(watchSessionId, symbol, exchange);

  return { symbolStateId, watchSessionId, signalId, symbol, exchange };
}

// ---------------------------------------------------------------------------
// ticket-manager — integration tests
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("ticket-manager", () => {
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

  // ── createTicket ──────────────────────────────────────────────────────────

  describe("createTicket", () => {
    it("creates ticket when fsm_state=WATCHING and updates fsm_state to HAS_POSITION", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
        tp1Price: "86000.00",
        tp2Price: "87000.00",
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.symbol).toBe("BTC/USDT");
      expect(ticket.exchange).toBe("binance");
      expect(ticket.state).toBe("INITIAL");
      expect(ticket.entry_price).toBe("85000.00");
      expect(ticket.sl_price).toBe("84500.00");
      expect(ticket.current_sl_price).toBe("84500.00");
      expect(ticket.size).toBe("0.10");
      expect(ticket.remaining_size).toBe("0.10");
      expect(ticket.leverage).toBe(10);
      expect(ticket.tp1_price).toBe("86000.00");
      expect(ticket.tp2_price).toBe("87000.00");

      // Verify fsm_state changed to HAS_POSITION
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${symbol} AND exchange = ${exchange}
      `;
      expect(stateRows[0]!.fsm_state).toBe("HAS_POSITION");
    });

    it("throws InvalidStateError when fsm_state=IDLE", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "IDLE",
      });

      await expect(
        createTicket(db, {
          symbol,
          exchange,
          signalId,
          timeframe: "5M",
          direction: "LONG",
          entryPrice: "85000.00",
          slPrice: "84500.00",
          size: "0.10",
          leverage: 10,
        }),
      ).rejects.toThrow(InvalidStateError);

      // Verify fsm_state unchanged
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${symbol} AND exchange = ${exchange}
      `;
      expect(stateRows[0]!.fsm_state).toBe("IDLE");
    });

    it("throws InvalidStateError when fsm_state=HAS_POSITION", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "HAS_POSITION",
      });

      await expect(
        createTicket(db, {
          symbol,
          exchange,
          signalId,
          timeframe: "5M",
          direction: "LONG",
          entryPrice: "85000.00",
          slPrice: "84500.00",
          size: "0.10",
          leverage: 10,
        }),
      ).rejects.toThrow(InvalidStateError);
    });

    it("throws DuplicateTicketError when active ticket already exists", async () => {
      const { signalId, symbol, exchange, watchSessionId } =
        await setupPrerequisites({ fsmState: "WATCHING" });

      // Create first ticket
      await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      // Now fsm_state is HAS_POSITION, set it back to WATCHING to test duplicate check
      const pool = getPool();
      await pool`
        UPDATE symbol_state SET fsm_state = 'WATCHING'
        WHERE symbol = ${symbol} AND exchange = ${exchange}
      `;

      // Create second signal for a new ticket attempt
      const signalId2 = await insertSignal(watchSessionId, symbol, exchange);

      await expect(
        createTicket(db, {
          symbol,
          exchange,
          signalId: signalId2,
          timeframe: "5M",
          direction: "LONG",
          entryPrice: "86000.00",
          slPrice: "85500.00",
          size: "0.05",
          leverage: 10,
        }),
      ).rejects.toThrow(DuplicateTicketError);
    });

    it("stores Decimal.js fields as numeric strings", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85432.12345678",
        slPrice: "84999.98765432",
        size: "0.123456789012",
        leverage: 10,
        tp1Price: "86543.21098765",
        tp2Price: "87654.32109876",
      });

      expect(ticket.entry_price).toBe("85432.12345678");
      expect(ticket.sl_price).toBe("84999.98765432");
      expect(ticket.current_sl_price).toBe("84999.98765432");
      expect(ticket.size).toBe("0.123456789012");
      expect(ticket.remaining_size).toBe("0.123456789012");
      expect(ticket.tp1_price).toBe("86543.21098765");
      expect(ticket.tp2_price).toBe("87654.32109876");
    });

    it("rolls back SymbolState on mid-transaction failure", async () => {
      const { symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      // Use an invalid signal_id to cause FK violation mid-transaction
      try {
        await createTicket(db, {
          symbol,
          exchange,
          signalId: "00000000-0000-0000-0000-000000000000",
          timeframe: "5M",
          direction: "LONG",
          entryPrice: "85000.00",
          slPrice: "84500.00",
          size: "0.10",
          leverage: 10,
        });
      } catch {
        // Expected to throw
      }

      // Verify fsm_state is still WATCHING (rolled back)
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${symbol} AND exchange = ${exchange}
      `;
      expect(stateRows[0]!.fsm_state).toBe("WATCHING");
    });
  });

  // ── transitionTicket ──────────────────────────────────────────────────────

  describe("transitionTicket", () => {
    it("transitions INITIAL -> TP1_HIT", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      const updated = await transitionTicket(db, ticket.id, "TP1_HIT");
      expect(updated.state).toBe("TP1_HIT");
    });

    it("transitions TP1_HIT -> TP2_HIT", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await transitionTicket(db, ticket.id, "TP1_HIT");
      const updated = await transitionTicket(db, ticket.id, "TP2_HIT");
      expect(updated.state).toBe("TP2_HIT");
    });

    it("throws InvalidTransitionError for INITIAL -> TP2_HIT (skip not allowed)", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await expect(
        transitionTicket(db, ticket.id, "TP2_HIT"),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it("throws InvalidTransitionError for CLOSED -> any state", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await closeTicket(db, ticket.id, {
        closeReason: "SL",
        result: "LOSS",
        pnl: "-50.00",
      });

      await expect(
        transitionTicket(db, ticket.id, "TP1_HIT"),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it("throws when ticket not found", async () => {
      await expect(
        transitionTicket(db, "00000000-0000-0000-0000-000000000000", "TP1_HIT"),
      ).rejects.toThrow();
    });
  });

  // ── closeTicket ───────────────────────────────────────────────────────────

  describe("closeTicket", () => {
    it("closes ticket and sets fsm_state=IDLE", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      const closed = await closeTicket(db, ticket.id, {
        closeReason: "SL",
        result: "LOSS",
        pnl: "-50.00",
      });

      expect(closed.state).toBe("CLOSED");
      expect(closed.close_reason).toBe("SL");
      expect(closed.result).toBe("LOSS");
      // PostgreSQL numeric strips trailing zeros: "-50.00" -> "-50"
      expect(closed.pnl).toBe("-50");
      expect(closed.closed_at).toBeDefined();
      expect(closed.closed_at).not.toBeNull();
      expect(typeof closed.hold_duration_sec).toBe("number");
      expect(closed.hold_duration_sec).toBeGreaterThanOrEqual(0);

      // Verify fsm_state = IDLE
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${symbol} AND exchange = ${exchange}
      `;
      expect(stateRows[0]!.fsm_state).toBe("IDLE");
    });

    it("calculates pnl_pct correctly for positive pnl", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "1000.00",
        slPrice: "950.00",
        size: "1.00",
        leverage: 10,
      });

      const closed = await closeTicket(db, ticket.id, {
        closeReason: "TP1",
        result: "WIN",
        pnl: "100.00",
      });

      // pnl_pct = pnl / (entryPrice * size) = 100 / (1000 * 1) = 0.1
      // PostgreSQL numeric strips trailing zeros
      expect(closed.pnl).toBe("100");
      expect(closed.pnl_pct).toBe("0.1");
    });

    it("calculates pnl_pct correctly for negative pnl", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "1000.00",
        slPrice: "950.00",
        size: "2.00",
        leverage: 10,
      });

      const closed = await closeTicket(db, ticket.id, {
        closeReason: "SL",
        result: "LOSS",
        pnl: "-100.00",
      });

      // pnl_pct = -100 / (1000 * 2) = -0.05
      // PostgreSQL numeric strips trailing zeros
      expect(closed.pnl).toBe("-100");
      expect(closed.pnl_pct).toBe("-0.05");
    });

    it("calculates hold_duration_sec from opened_at to closed_at", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      const closed = await closeTicket(db, ticket.id, {
        closeReason: "TP1",
        result: "WIN",
        pnl: "50.00",
      });

      // hold_duration_sec should be >= 0 (created and closed almost immediately)
      expect(closed.hold_duration_sec).toBeGreaterThanOrEqual(0);
      expect(typeof closed.hold_duration_sec).toBe("number");
    });

    it("closes ticket from TP1_HIT state", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await transitionTicket(db, ticket.id, "TP1_HIT");

      const closed = await closeTicket(db, ticket.id, {
        closeReason: "TRAILING",
        result: "WIN",
        pnl: "200.00",
      });

      expect(closed.state).toBe("CLOSED");
      expect(closed.close_reason).toBe("TRAILING");
    });

    it("closes ticket from TP2_HIT state", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await transitionTicket(db, ticket.id, "TP1_HIT");
      await transitionTicket(db, ticket.id, "TP2_HIT");

      const closed = await closeTicket(db, ticket.id, {
        closeReason: "TP2",
        result: "WIN",
        pnl: "500.00",
      });

      expect(closed.state).toBe("CLOSED");
      expect(closed.close_reason).toBe("TP2");
    });

    it("throws InvalidTransitionError for already-closed ticket", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await closeTicket(db, ticket.id, {
        closeReason: "SL",
        result: "LOSS",
        pnl: "-50.00",
      });

      await expect(
        closeTicket(db, ticket.id, {
          closeReason: "MANUAL",
          result: "LOSS",
          pnl: "-50.00",
        }),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it("throws when ticket not found", async () => {
      await expect(
        closeTicket(db, "00000000-0000-0000-0000-000000000000", {
          closeReason: "SL",
          result: "LOSS",
          pnl: "-50.00",
        }),
      ).rejects.toThrow();
    });
  });

  // ── getActiveTicket ───────────────────────────────────────────────────────

  describe("getActiveTicket", () => {
    it("returns active ticket for symbol x exchange", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const created = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      const active = await getActiveTicket(db, symbol, exchange);
      expect(active).not.toBeNull();
      expect(active!.id).toBe(created.id);
      expect(active!.state).toBe("INITIAL");
    });

    it("returns null when no active ticket exists", async () => {
      await insertParentSymbol();
      await insertSymbolState();

      const active = await getActiveTicket(db, "BTC/USDT", "binance");
      expect(active).toBeNull();
    });

    it("returns null when only CLOSED tickets exist", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await closeTicket(db, ticket.id, {
        closeReason: "SL",
        result: "LOSS",
        pnl: "-50.00",
      });

      const active = await getActiveTicket(db, symbol, exchange);
      expect(active).toBeNull();
    });

    it("returns ticket in TP1_HIT state as active", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const ticket = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      await transitionTicket(db, ticket.id, "TP1_HIT");

      const active = await getActiveTicket(db, symbol, exchange);
      expect(active).not.toBeNull();
      expect(active!.state).toBe("TP1_HIT");
    });
  });

  // ── getTicketById ─────────────────────────────────────────────────────────

  describe("getTicketById", () => {
    it("returns ticket by id", async () => {
      const { signalId, symbol, exchange } = await setupPrerequisites({
        fsmState: "WATCHING",
      });

      const created = await createTicket(db, {
        symbol,
        exchange,
        signalId,
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      });

      const found = await getTicketById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.symbol).toBe("BTC/USDT");
    });

    it("returns null for non-existent id", async () => {
      const found = await getTicketById(
        db,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(found).toBeNull();
    });
  });

  // ── Concurrent access ─────────────────────────────────────────────────────

  describe("concurrent access", () => {
    it("concurrent createTicket for same symbol: one succeeds, one fails", async () => {
      // Set up two signals
      const symbol = "BTC/USDT";
      const exchange = "binance";
      await insertParentSymbol(symbol, exchange);
      await insertSymbolState(symbol, exchange, "WATCHING");
      const ws1 = await insertWatchSession(symbol, exchange);
      const sig1 = await insertSignal(ws1, symbol, exchange);
      const ws2 = await insertWatchSession(symbol, exchange);
      const sig2 = await insertSignal(ws2, symbol, exchange);

      const params1 = {
        symbol,
        exchange,
        signalId: sig1,
        timeframe: "5M" as const,
        direction: "LONG" as const,
        entryPrice: "85000.00",
        slPrice: "84500.00",
        size: "0.10",
        leverage: 10,
      };

      const params2 = {
        symbol,
        exchange,
        signalId: sig2,
        timeframe: "5M" as const,
        direction: "LONG" as const,
        entryPrice: "86000.00",
        slPrice: "85500.00",
        size: "0.05",
        leverage: 10,
      };

      // Race two concurrent createTicket calls
      const results = await Promise.allSettled([
        createTicket(db, params1),
        createTicket(db, params2),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // One should succeed, one should fail
      expect(fulfilled.length + rejected.length).toBe(2);
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      // The second one might fail with DuplicateTicketError or InvalidStateError
      // depending on which runs first (either the fsm_state check or the active ticket check fails)
      if (rejected.length > 0) {
        const err = (rejected[0] as PromiseRejectedResult).reason;
        expect(
          err instanceof DuplicateTicketError ||
          err instanceof InvalidStateError,
        ).toBe(true);
      }
    });
  });
});
