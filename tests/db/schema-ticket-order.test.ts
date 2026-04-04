import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { getTableName } from "drizzle-orm";
import { ticketTable, orderTable } from "../../src/db/schema";
import { getPool } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// schema-ticket — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("schema-ticket — ticketTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(ticketTable)).toBe("tickets");
  });

  it("has all 26 required columns", () => {
    const cols = Object.keys(ticketTable);
    const expected = [
      "id",
      "symbol",
      "exchange",
      "signal_id",
      "parent_ticket_id",
      "timeframe",
      "direction",
      "state",
      "entry_price",
      "sl_price",
      "current_sl_price",
      "size",
      "remaining_size",
      "leverage",
      "tp1_price",
      "tp2_price",
      "trailing_active",
      "trailing_price",
      "max_profit",
      "pyramid_count",
      "opened_at",
      "closed_at",
      "close_reason",
      "result",
      "pnl",
      "pnl_pct",
      "max_favorable",
      "max_adverse",
      "hold_duration_sec",
      "created_at",
      "updated_at",
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  it("id column is PgUUID type", () => {
    expect(ticketTable.id.columnType).toBe("PgUUID");
  });

  it("signal_id column is PgUUID type", () => {
    expect(ticketTable.signal_id.columnType).toBe("PgUUID");
  });

  it("parent_ticket_id column is nullable", () => {
    expect(ticketTable.parent_ticket_id.notNull).toBe(false);
  });

  it("entry_price column is PgNumeric type", () => {
    expect(ticketTable.entry_price.columnType).toBe("PgNumeric");
  });

  it("sl_price column is PgNumeric type", () => {
    expect(ticketTable.sl_price.columnType).toBe("PgNumeric");
  });

  it("current_sl_price column is PgNumeric type", () => {
    expect(ticketTable.current_sl_price.columnType).toBe("PgNumeric");
  });

  it("size column is PgNumeric type", () => {
    expect(ticketTable.size.columnType).toBe("PgNumeric");
  });

  it("remaining_size column is PgNumeric type", () => {
    expect(ticketTable.remaining_size.columnType).toBe("PgNumeric");
  });

  it("pnl column is PgNumeric and nullable", () => {
    expect(ticketTable.pnl.columnType).toBe("PgNumeric");
    expect(ticketTable.pnl.notNull).toBe(false);
  });

  it("trailing_active default is false", () => {
    expect(ticketTable.trailing_active.default).toBe(false);
  });

  it("max_profit default is '0'", () => {
    expect(ticketTable.max_profit.default).toBe("0");
  });

  it("pyramid_count default is 0", () => {
    expect(ticketTable.pyramid_count.default).toBe(0);
  });

  it("closed_at column is nullable", () => {
    expect(ticketTable.closed_at.notNull).toBe(false);
  });

  it("close_reason column is nullable", () => {
    expect(ticketTable.close_reason.notNull).toBe(false);
  });

  it("result column is nullable", () => {
    expect(ticketTable.result.notNull).toBe(false);
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof ticketTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "symbol",
      "exchange",
      "signal_id",
      "parent_ticket_id",
      "timeframe",
      "direction",
      "state",
      "entry_price",
      "sl_price",
      "current_sl_price",
      "size",
      "remaining_size",
      "leverage",
      "tp1_price",
      "tp2_price",
      "trailing_active",
      "trailing_price",
      "max_profit",
      "pyramid_count",
      "opened_at",
      "closed_at",
      "close_reason",
      "result",
      "pnl",
      "pnl_pct",
      "max_favorable",
      "max_adverse",
      "hold_duration_sec",
      "created_at",
      "updated_at",
    ];
    expect(keys).toHaveLength(31);
  });
});

// ---------------------------------------------------------------------------
// schema-order — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("schema-order — orderTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(orderTable)).toBe("orders");
  });

  it("has all 17 required columns", () => {
    const cols = Object.keys(orderTable);
    const expected = [
      "id",
      "ticket_id",
      "exchange",
      "order_type",
      "status",
      "side",
      "price",
      "expected_price",
      "size",
      "filled_price",
      "filled_size",
      "exchange_order_id",
      "intent_id",
      "idempotency_key",
      "slippage",
      "error_message",
      "created_at",
      "updated_at",
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  it("id column is PgUUID type", () => {
    expect(orderTable.id.columnType).toBe("PgUUID");
  });

  it("ticket_id column is nullable", () => {
    expect(orderTable.ticket_id.notNull).toBe(false);
  });

  it("price column is nullable (market orders)", () => {
    expect(orderTable.price.notNull).toBe(false);
  });

  it("filled_price column is nullable", () => {
    expect(orderTable.filled_price.notNull).toBe(false);
  });

  it("filled_size column is nullable", () => {
    expect(orderTable.filled_size.notNull).toBe(false);
  });

  it("exchange_order_id column is nullable", () => {
    expect(orderTable.exchange_order_id.notNull).toBe(false);
  });

  it("slippage column is nullable", () => {
    expect(orderTable.slippage.notNull).toBe(false);
  });

  it("error_message column is nullable", () => {
    expect(orderTable.error_message.notNull).toBe(false);
  });

  it("size column is PgNumeric type", () => {
    expect(orderTable.size.columnType).toBe("PgNumeric");
  });

  it("intent_id column is notNull", () => {
    expect(orderTable.intent_id.notNull).toBe(true);
  });

  it("idempotency_key column is notNull", () => {
    expect(orderTable.idempotency_key.notNull).toBe(true);
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof orderTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "ticket_id",
      "exchange",
      "order_type",
      "status",
      "side",
      "price",
      "expected_price",
      "size",
      "filled_price",
      "filled_size",
      "exchange_order_id",
      "intent_id",
      "idempotency_key",
      "slippage",
      "error_message",
      "created_at",
      "updated_at",
    ];
    expect(keys).toHaveLength(18);
  });
});

// ---------------------------------------------------------------------------
// schema-ticket / schema-order — integration tests (real DB required)
// Single describe block to share DB lifecycle across ticket and order tests.
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("schema-ticket / schema-order — integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // ── Shared Helpers ────────────────────────────────────────────────────────

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
    // Invalidate any existing active watch session for this symbol/exchange
    // to avoid unique partial index violation
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

  async function insertTicket(
    signalId: string,
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<string> {
    const pool = getPool();
    const result = await pool`
      INSERT INTO tickets
        (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
      VALUES
        (${symbol}, ${exchange}, ${signalId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      RETURNING id
    `;
    return result[0]!.id as string;
  }

  // ── Ticket: Table existence ─────────────────────────────────────────────

  it("migration creates tickets table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'tickets'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("tickets");
  });

  // ── Ticket: INSERT with defaults ────────────────────────────────────────

  it("INSERT valid ticket succeeds with defaults (trailing_active=false, pyramid_count=0, max_profit=0)", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const pool = getPool();

    const result = await pool`
      INSERT INTO tickets
        (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
      VALUES
        (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      RETURNING id, trailing_active, pyramid_count, max_profit, state
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.trailing_active).toBe(false);
    expect(result[0]!.pyramid_count).toBe(0);
    expect(result[0]!.max_profit).toBe("0");
    expect(result[0]!.state).toBe("INITIAL");
  });

  // ── Ticket: duplicate signal_id ─────────────────────────────────────────

  it("INSERT ticket with duplicate signal_id fails with unique constraint violation", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const pool = getPool();

    await pool`
      INSERT INTO tickets
        (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
      VALUES
        (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
    `;

    try {
      await pool`
        INSERT INTO tickets
          (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
        VALUES
          (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"86000.00"}, ${"85500.00"}, ${"85500.00"}, ${"0.20"}, ${"0.20"}, ${10}, ${"2025-06-01T01:00:00Z"}::timestamptz)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unique|duplicate/i);
    }
  });

  // ── Ticket: CHECK constraint — invalid state ────────────────────────────

  it("INSERT ticket with invalid state fails with check constraint error", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const pool = getPool();

    try {
      await pool`
        INSERT INTO tickets
          (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
        VALUES
          (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"5M"}, ${"LONG"}, ${"INVALID_STATE"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|tickets_state_check/i);
    }
  });

  // ── Ticket: CHECK constraint — invalid direction ────────────────────────

  it("INSERT ticket with invalid direction fails with check constraint error", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const pool = getPool();

    try {
      await pool`
        INSERT INTO tickets
          (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
        VALUES
          (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"5M"}, ${"BOTH"}, ${"INITIAL"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|tickets_direction_check/i);
    }
  });

  // ── Ticket: CHECK constraint — invalid timeframe ────────────────────────

  it("INSERT ticket with invalid timeframe fails with check constraint error", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const pool = getPool();

    try {
      await pool`
        INSERT INTO tickets
          (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
        VALUES
          (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"1H"}, ${"LONG"}, ${"INITIAL"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|tickets_timeframe_check/i);
    }
  });

  // ── Ticket: FK — non-existent signal_id ─────────────────────────────────

  it("INSERT ticket with non-existent signal_id fails with FK violation", async () => {
    await insertParentSymbol();
    const pool = getPool();

    try {
      await pool`
        INSERT INTO tickets
          (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
        VALUES
          (${"BTC/USDT"}, ${"binance"}, ${"00000000-0000-0000-0000-000000000000"}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"85000.00"}, ${"84500.00"}, ${"84500.00"}, ${"0.10"}, ${"0.10"}, ${10}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  // ── Ticket: FK — RESTRICT prevents signal deletion ──────────────────────

  it("DELETE signal with existing ticket is blocked by RESTRICT", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    await insertTicket(sigId);
    const pool = getPool();

    try {
      await pool`DELETE FROM signals WHERE id = ${sigId}`;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates|restrict/i);
    }
  });

  // ── Ticket: self-ref — parent_ticket_id ─────────────────────────────────

  it("INSERT ticket with parent_ticket_id referencing existing ticket succeeds", async () => {
    await insertParentSymbol();
    const wsId1 = await insertWatchSession();
    const sigId1 = await insertSignal(wsId1);
    const parentId = await insertTicket(sigId1);

    // Need a second signal for the child ticket (signal_id is unique).
    // Must create a new watch session (invalidates the first via helper).
    const wsId2 = await insertWatchSession();
    const sigId2 = await insertSignal(wsId2);
    const pool = getPool();

    const result = await pool`
      INSERT INTO tickets
        (symbol, exchange, signal_id, parent_ticket_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
      VALUES
        (${"BTC/USDT"}, ${"binance"}, ${sigId2}, ${parentId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"86000.00"}, ${"85500.00"}, ${"85500.00"}, ${"0.05"}, ${"0.05"}, ${10}, ${"2025-06-01T01:00:00Z"}::timestamptz)
      RETURNING id, parent_ticket_id
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.parent_ticket_id).toBe(parentId);
  });

  // ── Ticket: self-ref — delete parent SET NULL ───────────────────────────

  it("DELETE parent ticket sets child parent_ticket_id to NULL", async () => {
    await insertParentSymbol();
    const wsId1 = await insertWatchSession();
    const sigId1 = await insertSignal(wsId1);
    const parentId = await insertTicket(sigId1);

    const wsId2 = await insertWatchSession();
    const sigId2 = await insertSignal(wsId2);
    const pool = getPool();

    const childResult = await pool`
      INSERT INTO tickets
        (symbol, exchange, signal_id, parent_ticket_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
      VALUES
        (${"BTC/USDT"}, ${"binance"}, ${sigId2}, ${parentId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"86000.00"}, ${"85500.00"}, ${"85500.00"}, ${"0.05"}, ${"0.05"}, ${10}, ${"2025-06-01T01:00:00Z"}::timestamptz)
      RETURNING id
    `;
    const childId = childResult[0]!.id as string;

    // Delete parent ticket
    await pool`DELETE FROM tickets WHERE id = ${parentId}`;

    // Child's parent_ticket_id should now be NULL
    const after = await pool`
      SELECT parent_ticket_id FROM tickets WHERE id = ${childId}
    `;
    expect(after).toHaveLength(1);
    expect(after[0]!.parent_ticket_id).toBeNull();
  });

  // ── Ticket: numeric precision ───────────────────────────────────────────

  it("price/size columns accept numeric with high precision", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const pool = getPool();

    const result = await pool`
      INSERT INTO tickets
        (symbol, exchange, signal_id, timeframe, direction, state, entry_price, sl_price, current_sl_price, size, remaining_size, leverage, opened_at)
      VALUES
        (${"BTC/USDT"}, ${"binance"}, ${sigId}, ${"5M"}, ${"LONG"}, ${"INITIAL"}, ${"85432.12345678"}, ${"84999.98765432"}, ${"84999.98765432"}, ${"0.123456789012"}, ${"0.123456789012"}, ${20}, ${"2025-06-01T00:00:00Z"}::timestamptz)
      RETURNING entry_price, sl_price, current_sl_price, size, remaining_size
    `;
    expect(result[0]!.entry_price).toBe("85432.12345678");
    expect(result[0]!.sl_price).toBe("84999.98765432");
    expect(result[0]!.current_sl_price).toBe("84999.98765432");
    expect(result[0]!.size).toBe("0.123456789012");
    expect(result[0]!.remaining_size).toBe("0.123456789012");
  });

  // ── Ticket: partial index on active tickets ─────────────────────────────

  it("partial index on tickets exists for state != CLOSED", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'tickets'
        AND indexdef ILIKE '%state%'
        AND indexdef ILIKE '%CLOSED%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // ── Ticket: CHECK — close_reason ────────────────────────────────────────

  it("UPDATE ticket with invalid close_reason fails with check constraint error", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const ticketId = await insertTicket(sigId);
    const pool = getPool();

    try {
      await pool`
        UPDATE tickets
        SET close_reason = ${"INVALID_REASON"}, state = ${"CLOSED"}
        WHERE id = ${ticketId}
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|tickets_close_reason_check/i);
    }
  });

  // ── Ticket: CHECK — result ──────────────────────────────────────────────

  it("UPDATE ticket with invalid result fails with check constraint error", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const ticketId = await insertTicket(sigId);
    const pool = getPool();

    try {
      await pool`
        UPDATE tickets
        SET result = ${"DRAW"}, state = ${"CLOSED"}
        WHERE id = ${ticketId}
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|tickets_result_check/i);
    }
  });

  // ── Order: Table existence ──────────────────────────────────────────────

  it("migration creates orders table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'orders'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("orders");
  });

  // ── Order: INSERT ───────────────────────────────────────────────────────

  it("INSERT valid order succeeds", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const ticketId = await insertTicket(sigId);
    const pool = getPool();

    const result = await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
      VALUES
        (${ticketId}, ${"binance"}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-001"})
      RETURNING id, ticket_id
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.ticket_id).toBe(ticketId);
  });

  // ── Order: INSERT with ticket_id=NULL (panic close) ─────────────────────

  it("INSERT order with ticket_id=NULL succeeds (panic close)", async () => {
    const pool = getPool();

    const result = await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
      VALUES
        (${null}, ${"binance"}, ${"PANIC_CLOSE"}, ${"PENDING"}, ${"SELL"}, ${"0.50"}, ${"panic-001"}, ${"panic-idem-001"})
      RETURNING id, ticket_id
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.ticket_id).toBeNull();
  });

  // ── Order: UNIQUE(exchange, idempotency_key) ────────────────────────────

  it("INSERT duplicate (exchange, idempotency_key) fails with unique constraint violation", async () => {
    const pool = getPool();

    await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
      VALUES
        (${null}, ${"binance"}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-dup"})
    `;

    try {
      await pool`
        INSERT INTO orders
          (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
        VALUES
          (${null}, ${"binance"}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"}, ${"0.20"}, ${"intent-002"}, ${"idem-dup"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unique|duplicate/i);
    }
  });

  // ── Order: same idempotency_key on different exchange ───────────────────

  it("INSERT same idempotency_key on different exchange succeeds", async () => {
    const pool = getPool();

    await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
      VALUES
        (${null}, ${"binance"}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-cross"})
    `;

    const result = await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
      VALUES
        (${null}, ${"okx"}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"}, ${"0.10"}, ${"intent-002"}, ${"idem-cross"})
      RETURNING id
    `;
    expect(result).toHaveLength(1);
  });

  // ── Order: CHECK — invalid order_type ───────────────────────────────────

  it("INSERT order with invalid order_type fails with check constraint error", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO orders
          (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
        VALUES
          (${null}, ${"binance"}, ${"INVALID_TYPE"}, ${"PENDING"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-bad-type"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|orders_order_type_check/i);
    }
  });

  // ── Order: CHECK — invalid status ───────────────────────────────────────

  it("INSERT order with invalid status fails with check constraint error", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO orders
          (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
        VALUES
          (${null}, ${"binance"}, ${"ENTRY"}, ${"INVALID_STATUS"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-bad-status"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|orders_status_check/i);
    }
  });

  // ── Order: CHECK — invalid side ─────────────────────────────────────────

  it("INSERT order with invalid side fails with check constraint error", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO orders
          (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
        VALUES
          (${null}, ${"binance"}, ${"ENTRY"}, ${"PENDING"}, ${"HOLD"}, ${"0.10"}, ${"intent-001"}, ${"idem-bad-side"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|orders_side_check/i);
    }
  });

  // ── Order: CHECK — invalid exchange ─────────────────────────────────────

  it("INSERT order with invalid exchange fails with check constraint error", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO orders
          (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
        VALUES
          (${null}, ${"kraken"}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-bad-exch"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|orders_exchange_check/i);
    }
  });

  // ── Order: FK — delete ticket SET NULL ──────────────────────────────────

  it("DELETE ticket sets order.ticket_id to NULL", async () => {
    await insertParentSymbol();
    const wsId = await insertWatchSession();
    const sigId = await insertSignal(wsId);
    const ticketId = await insertTicket(sigId);
    const pool = getPool();

    const orderResult = await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, size, intent_id, idempotency_key)
      VALUES
        (${ticketId}, ${"binance"}, ${"ENTRY"}, ${"FILLED"}, ${"BUY"}, ${"0.10"}, ${"intent-001"}, ${"idem-fk-test"})
      RETURNING id
    `;
    const orderId = orderResult[0]!.id as string;

    // Verify ticket_id is set
    const before = await pool`SELECT ticket_id FROM orders WHERE id = ${orderId}`;
    expect(before[0]!.ticket_id).toBe(ticketId);

    // Delete the ticket
    await pool`DELETE FROM tickets WHERE id = ${ticketId}`;

    // Order should still exist with ticket_id = NULL
    const after = await pool`SELECT id, ticket_id FROM orders WHERE id = ${orderId}`;
    expect(after).toHaveLength(1);
    expect(after[0]!.ticket_id).toBeNull();
  });

  // ── Order: numeric precision ────────────────────────────────────────────

  it("all price/size columns accept numeric with high precision", async () => {
    const pool = getPool();

    const result = await pool`
      INSERT INTO orders
        (ticket_id, exchange, order_type, status, side, price, expected_price, size, filled_price, filled_size, slippage, intent_id, idempotency_key)
      VALUES
        (${null}, ${"binance"}, ${"ENTRY"}, ${"FILLED"}, ${"BUY"}, ${"85432.12345678"}, ${"85432.00000000"}, ${"0.123456789012"}, ${"85432.12345678"}, ${"0.123456789012"}, ${"0.12345678"}, ${"intent-prec"}, ${"idem-prec"})
      RETURNING price, expected_price, size, filled_price, filled_size, slippage
    `;
    expect(result[0]!.price).toBe("85432.12345678");
    expect(result[0]!.expected_price).toBe("85432.00000000");
    expect(result[0]!.size).toBe("0.123456789012");
    expect(result[0]!.filled_price).toBe("85432.12345678");
    expect(result[0]!.filled_size).toBe("0.123456789012");
    expect(result[0]!.slippage).toBe("0.12345678");
  });

  // ── Order: index existence ──────────────────────────────────────────────

  it("index on (ticket_id, created_at) exists", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'orders'
        AND indexdef ILIKE '%ticket_id%'
        AND indexdef ILIKE '%created_at%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("index on (intent_id) exists", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'orders'
        AND indexdef ILIKE '%intent_id%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
