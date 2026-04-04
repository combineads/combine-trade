/**
 * E2E integration tests for the full exits -> labeling flow:
 * Exit check -> partial/full close -> trailing -> close ticket -> finalize label
 *
 * Requires a running test database (see tests/helpers/test-db.ts).
 * Tests are skipped when the DB is unavailable.
 *
 * ExchangeAdapter is always mocked -- no real exchange calls.
 *
 * FK chain: symbol -> symbol_state -> watch_session -> signal -> signal_details
 *           -> candle -> vector -> ticket -> orders
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { eq } from "drizzle-orm";

import { d } from "@/core/decimal";
import type { DbInstance } from "@/db/pool";
import { getDb, getPool } from "@/db/pool";
import {
  orderTable,
  ticketTable,
} from "@/db/schema";
import type { CreateOrderParams, ExchangeAdapter, OrderResult } from "@/core/ports";
import type { Direction, Exchange } from "@/core/types";
import { checkExit, calcMfeMae } from "@/exits/checker";
import { processExit, processTrailing, updateMfeMae } from "@/exits/manager";
import { createTicket, closeTicket, transitionTicket } from "@/positions/ticket-manager";
import { finalizeLabel } from "@/labeling/engine";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYMBOL = "BTCUSDT";
const EXCHANGE: Exchange = "binance";
const TIMEFRAME = "5M" as const;

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides?: Partial<ExchangeAdapter>): ExchangeAdapter {
  return {
    fetchOHLCV: mock(() => Promise.resolve([])),
    fetchBalance: mock(() =>
      Promise.resolve({ total: d("10000"), available: d("5000") }),
    ),
    fetchPositions: mock(() => Promise.resolve([])),
    createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
      return Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED",
        filledPrice: params.price ?? d("42500"),
        filledSize: params.size,
        timestamp: new Date(),
      });
    }),
    cancelOrder: mock(() => Promise.resolve()),
    editOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("42500"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ),
    fetchOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("42500"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ),
    watchOHLCV: mock(() => Promise.resolve(() => {})),
    getExchangeInfo: mock(() =>
      Promise.resolve({
        symbol: SYMBOL,
        tickSize: d("0.001"),
        minOrderSize: d("0.001"),
        maxLeverage: 125,
        contractSize: d("1"),
      }),
    ),
    setLeverage: mock(() => Promise.resolve()),
    transfer: mock(() => Promise.resolve({ id: "mock-transfer-id", status: "ok" })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

async function insertSymbolWithState(opts?: {
  symbol?: string;
  exchange?: string;
  fsmState?: string;
  executionMode?: string;
}): Promise<string> {
  const pool = getPool();
  const symbol = opts?.symbol ?? SYMBOL;
  const exchange = opts?.exchange ?? EXCHANGE;
  const fsmState = opts?.fsmState ?? "WATCHING";
  const executionMode = opts?.executionMode ?? "live";

  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin USDT"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;

  const result = await pool`
    INSERT INTO symbol_state (symbol, exchange, fsm_state, execution_mode, daily_bias, daily_open)
    VALUES (${symbol}, ${exchange}, ${fsmState}, ${executionMode}, ${"LONG_ONLY"}, ${"42000"})
    ON CONFLICT (symbol, exchange) DO UPDATE
      SET fsm_state = EXCLUDED.fsm_state,
          execution_mode = EXCLUDED.execution_mode
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertWatchSession(
  direction: Direction = "LONG",
  symbol = SYMBOL,
  exchange = EXCHANGE,
): Promise<string> {
  const pool = getPool();
  await pool`
    UPDATE watch_session
    SET invalidated_at = now(), invalidation_reason = 'test cleanup'
    WHERE symbol = ${symbol} AND exchange = ${exchange} AND invalidated_at IS NULL
  `;
  const result = await pool`
    INSERT INTO watch_session
      (symbol, exchange, detection_type, direction, detected_at, tp1_price, tp2_price)
    VALUES
      (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${direction}, now(), ${"43500"}, ${"44500"})
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertSignal(
  watchSessionId: string,
  opts?: {
    direction?: Direction;
    symbol?: string;
    exchange?: string;
    signalType?: string;
    safetyPassed?: boolean;
    vectorId?: string | null;
  },
): Promise<string> {
  const pool = getPool();
  const direction = opts?.direction ?? "LONG";
  const symbol = opts?.symbol ?? SYMBOL;
  const exchange = opts?.exchange ?? EXCHANGE;
  const signalType = opts?.signalType ?? "DOUBLE_B";
  const safetyPassed = opts?.safetyPassed ?? true;
  const vectorId = opts?.vectorId ?? null;
  const entryPrice = "42500.00";
  const slPrice = direction === "LONG" ? "42000.00" : "43000.00";

  const result = await pool`
    INSERT INTO signals
      (symbol, exchange, watch_session_id, timeframe, signal_type, direction,
       entry_price, sl_price, safety_passed, knn_decision, vector_id)
    VALUES
      (${symbol}, ${exchange}, ${watchSessionId}, ${TIMEFRAME},
       ${signalType}, ${direction}, ${entryPrice}, ${slPrice},
       ${safetyPassed}, ${"PASS"}, ${vectorId})
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
  symbol = SYMBOL,
  exchange = EXCHANGE,
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO candles
      (symbol, exchange, timeframe, open_time, open, high, low, close, volume, is_closed)
    VALUES
      (${symbol}, ${exchange}, ${"5M"}, now(), ${"42000"}, ${"43500"}, ${"41500"}, ${"42500"}, ${"1000"}, ${true})
    RETURNING id
  `;
  return result[0]!.id as string;
}

async function insertVector(
  candleId: string,
  symbol = SYMBOL,
  exchange = EXCHANGE,
): Promise<string> {
  const pool = getPool();
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

async function seedCommonCodes(): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO common_code (group_code, code, value, description, is_active)
    VALUES
      ('LOSS_LIMIT', 'max_daily_loss_pct', '{"value": "0.10"}', 'Max daily loss 10%', true),
      ('LOSS_LIMIT', 'max_session_losses', '{"value": 3}', 'Max session losses', true),
      ('LOSS_LIMIT', 'max_hourly_5m', '{"value": 2}', 'Max hourly 5M losses', true),
      ('LOSS_LIMIT', 'max_hourly_1m', '{"value": 1}', 'Max hourly 1M losses', true),
      ('SLIPPAGE', 'max_spread_pct', '"0.05"', 'Max slippage 5%', true)
    ON CONFLICT DO NOTHING
  `;
}

/**
 * Full prerequisite chain: symbol + state + common_codes + watch_session + signal + candle + vector.
 * Returns IDs needed by tests.
 */
async function setupPrerequisites(opts?: {
  direction?: Direction;
  signalType?: string;
  safetyPassed?: boolean;
  fsmState?: string;
}): Promise<{
  symbolStateId: string;
  watchSessionId: string;
  signalId: string;
  vectorId: string;
  candleId: string;
  direction: Direction;
}> {
  const direction = opts?.direction ?? "LONG";
  const fsmState = opts?.fsmState ?? "WATCHING";
  await seedCommonCodes();

  const symbolStateId = await insertSymbolWithState({ fsmState });
  const watchSessionId = await insertWatchSession(direction);
  const candleId = await insertCandle();
  const vectorId = await insertVector(candleId);
  const signalId = await insertSignal(watchSessionId, {
    direction,
    signalType: opts?.signalType ?? "DOUBLE_B",
    safetyPassed: opts?.safetyPassed ?? true,
    vectorId,
  });
  await insertSignalDetail(signalId, "knn_winrate", "0.70");

  return { symbolStateId, watchSessionId, signalId, vectorId, candleId, direction };
}

/**
 * Creates a ticket in INITIAL state with the given entry params.
 * Mirrors what the daemon entry flow would do.
 */
async function createInitialTicket(
  db: DbInstance,
  signalId: string,
  opts?: {
    direction?: Direction;
    entryPrice?: string;
    slPrice?: string;
    size?: string;
    tp1Price?: string;
    tp2Price?: string;
    openedAt?: Date;
  },
) {
  const direction = opts?.direction ?? "LONG";
  const ticket = await createTicket(db, {
    symbol: SYMBOL,
    exchange: EXCHANGE,
    signalId,
    timeframe: TIMEFRAME,
    direction,
    entryPrice: opts?.entryPrice ?? "42500",
    slPrice: opts?.slPrice ?? (direction === "LONG" ? "42000" : "43000"),
    size: opts?.size ?? "1.0",
    leverage: 10,
    tp1Price: opts?.tp1Price ?? "43500",
    tp2Price: opts?.tp2Price ?? "44500",
  });

  // If custom openedAt, update it directly
  if (opts?.openedAt) {
    const pool = getPool();
    await pool`
      UPDATE tickets SET opened_at = ${opts.openedAt.toISOString()}::timestamptz
      WHERE id = ${ticket.id}
    `;
  }

  return ticket;
}

// ---------------------------------------------------------------------------
// DB availability check
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

// ---------------------------------------------------------------------------
// Shared DB lifecycle
// ---------------------------------------------------------------------------

if (dbAvailable) {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });
}

// ===========================================================================
// Scenario 1: TP1 -> TP2 -> trailing close -> WIN -> label A
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] TP1 -> TP2 -> trailing close -> WIN -> label A",
  () => {
    it("completes full lifecycle: INITIAL -> TP1_HIT -> TP2_HIT -> CLOSED(WIN), Vector label=WIN grade=A", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId, vectorId } = await setupPrerequisites({
        signalType: "DOUBLE_B",
        safetyPassed: true,
      });

      // 1. Create ticket (INITIAL state)
      const ticket = await createInitialTicket(db, signalId, {
        direction: "LONG",
        entryPrice: "42500",
        slPrice: "42000",
        size: "1.0",
        tp1Price: "43500",
        tp2Price: "44500",
      });
      expect(ticket.state).toBe("INITIAL");

      // 2. checkExit detects TP1 (current price >= tp1_price)
      const action1 = checkExit(
        {
          state: "INITIAL",
          direction: "LONG",
          entry_price: "42500",
          tp1_price: "43500",
          tp2_price: "44500",
          size: "1.0",
          remaining_size: "1.0",
          opened_at: ticket.opened_at,
          trailing_active: false,
          max_favorable: "0",
          max_adverse: "0",
        },
        "43600", // price above TP1
        Date.now(),
      );
      expect(action1.type).toBe("TP1");
      expect(action1.closeSize.toString()).toBe("0.5"); // 50% of 1.0

      // 3. processExit(TP1): 50% close + SL breakeven + trailing_active
      const adapter = createMockAdapter();
      const exitResult1 = await processExit({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "1.0",
          trailing_active: false,
          trailing_price: null,
          max_profit: "0",
          sl_order_id: null,
        },
        action: action1,
        exchange: EXCHANGE,
      });
      expect(exitResult1.success).toBe(true);
      expect(exitResult1.closeOrder).not.toBeNull();
      expect(exitResult1.newState).toBe("TP1_HIT");
      expect(exitResult1.ticketUpdates!.remaining_size).toBe("0.5");
      expect(exitResult1.ticketUpdates!.trailing_active).toBe(true);
      expect(exitResult1.ticketUpdates!.current_sl_price).toBe("42500"); // breakeven

      // 4. Apply state transition in DB
      await transitionTicket(db, ticket.id, "TP1_HIT");

      // Update ticket fields in DB
      await pool`
        UPDATE tickets
        SET remaining_size = '0.5',
            trailing_active = true,
            current_sl_price = '42500',
            trailing_price = '42500'
        WHERE id = ${ticket.id}
      `;

      // Insert the close order
      if (exitResult1.closeOrder) {
        exitResult1.closeOrder.ticket_id = ticket.id;
        await db.insert(orderTable).values(exitResult1.closeOrder);
      }
      if (exitResult1.slOrder) {
        exitResult1.slOrder.ticket_id = ticket.id;
        await db.insert(orderTable).values(exitResult1.slOrder);
      }

      // 5. Verify ticket state is TP1_HIT
      const dbTicket1 = (
        await db.select().from(ticketTable).where(eq(ticketTable.id, ticket.id))
      )[0]!;
      expect(dbTicket1.state).toBe("TP1_HIT");
      expect(dbTicket1.trailing_active).toBe(true);
      expect(dbTicket1.remaining_size).toBe("0.5");

      // 6. checkExit detects TP2 (current price >= tp2_price)
      const action2 = checkExit(
        {
          state: "TP1_HIT",
          direction: "LONG",
          entry_price: "42500",
          tp1_price: "43500",
          tp2_price: "44500",
          size: "1.0",
          remaining_size: "0.5",
          opened_at: ticket.opened_at,
          trailing_active: true,
          max_favorable: "0",
          max_adverse: "0",
        },
        "44600", // price above TP2
        Date.now(),
      );
      expect(action2.type).toBe("TP2");
      // TP2 closes remaining/2 = 0.5/2 = 0.25
      const expectedTp2Close = d("0.5").dividedBy(d("2"));
      expect(action2.closeSize.toString()).toBe(expectedTp2Close.toString());

      // 7. processExit(TP2): remaining/2 close, state -> TP2_HIT
      const exitResult2 = await processExit({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "0.5",
          trailing_active: true,
          trailing_price: "42500",
          max_profit: "0",
          sl_order_id: null,
        },
        action: action2,
        exchange: EXCHANGE,
      });
      expect(exitResult2.success).toBe(true);
      expect(exitResult2.newState).toBe("TP2_HIT");

      // 8. Apply TP2 state transition
      await transitionTicket(db, ticket.id, "TP2_HIT");

      const newRemainingAfterTp2 = d("0.5").minus(expectedTp2Close);
      await pool`
        UPDATE tickets
        SET remaining_size = ${newRemainingAfterTp2.toString()}
        WHERE id = ${ticket.id}
      `;

      if (exitResult2.closeOrder) {
        exitResult2.closeOrder.ticket_id = ticket.id;
        await db.insert(orderTable).values(exitResult2.closeOrder);
      }

      // 9. Trailing stop hit -> closeTicket
      // Simulate trailing SL being hit: close the remaining position
      const closedTicket = await closeTicket(db, ticket.id, {
        closeReason: "TRAILING",
        result: "WIN",
        pnl: "500.00",
      });
      expect(closedTicket.state).toBe("CLOSED");
      expect(closedTicket.close_reason).toBe("TRAILING");
      expect(d(closedTicket.pnl!).toString()).toBe("500");
      expect(closedTicket.result).toBe("WIN");

      // 10. Finalize labeling
      const labelResult = await finalizeLabel(db, ticket.id, vectorId);
      expect(labelResult.label).toBe("WIN");
      expect(labelResult.grade).toBe("A"); // DOUBLE_B + safety_passed + winrate=0.70

      // 11. Verify Vector in DB
      const vectors = await pool`SELECT label, grade, labeled_at FROM vectors WHERE id = ${vectorId}`;
      const vec = vectors[0]!;
      expect(vec.label).toBe("WIN");
      expect(vec.grade).toBe("A");
      expect(vec.labeled_at).not.toBeNull();

      // 12. Verify SymbolState is IDLE (post-close)
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("IDLE");

      // 13. Verify orders were recorded
      const orders = await db
        .select()
        .from(orderTable)
        .where(eq(orderTable.ticket_id, ticket.id));
      expect(orders.length).toBeGreaterThanOrEqual(2); // TP1 close + TP2 close (+ optional SL orders)
    });
  },
);

// ===========================================================================
// Scenario 2: TIME_EXIT flow
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] TIME_EXIT flow: 61h elapsed -> TIME_EXIT -> CLOSED -> label TIME_EXIT",
  () => {
    it("detects time exit after 61h, full close, label=TIME_EXIT", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId, vectorId } = await setupPrerequisites();

      // 1. Create ticket opened 61 hours ago
      const openedAt = new Date(Date.now() - 61 * 3600 * 1000);
      const ticket = await createInitialTicket(db, signalId, {
        direction: "LONG",
        size: "0.5",
        openedAt,
      });
      expect(ticket.state).toBe("INITIAL");

      // 2. checkExit detects TIME_EXIT (> 60h)
      const action = checkExit(
        {
          state: "INITIAL",
          direction: "LONG",
          entry_price: "42500",
          tp1_price: "43500",
          tp2_price: "44500",
          size: "0.5",
          remaining_size: "0.5",
          opened_at: openedAt,
          trailing_active: false,
          max_favorable: "0",
          max_adverse: "0",
        },
        "42600", // price slightly above entry -- TP1 not hit
        Date.now(),
      );
      expect(action.type).toBe("TIME_EXIT");
      expect(action.closeSize.toString()).toBe("0.5"); // full remaining

      // 3. processExit(TIME_EXIT): full close, state -> CLOSED
      const adapter = createMockAdapter();
      const exitResult = await processExit({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "0.5",
          remaining_size: "0.5",
          trailing_active: false,
          trailing_price: null,
          max_profit: "0",
          sl_order_id: null,
        },
        action,
        exchange: EXCHANGE,
      });
      expect(exitResult.success).toBe(true);
      expect(exitResult.newState).toBe("CLOSED");
      expect(exitResult.ticketUpdates!.remaining_size).toBe("0");

      // Insert close order
      if (exitResult.closeOrder) {
        exitResult.closeOrder.ticket_id = ticket.id;
        await db.insert(orderTable).values(exitResult.closeOrder);
      }

      // 4. closeTicket
      const closedTicket = await closeTicket(db, ticket.id, {
        closeReason: "TIME_EXIT",
        result: "TIME_EXIT",
        pnl: "10.00",
      });
      expect(closedTicket.state).toBe("CLOSED");
      expect(closedTicket.close_reason).toBe("TIME_EXIT");

      // 5. finalizeLabel
      const labelResult = await finalizeLabel(db, ticket.id, vectorId);
      expect(labelResult.label).toBe("TIME_EXIT");

      // 6. Verify Vector
      const vectors = await pool`SELECT label, grade FROM vectors WHERE id = ${vectorId}`;
      expect(vectors[0]!.label).toBe("TIME_EXIT");

      // 7. Verify SymbolState is IDLE
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("IDLE");
    });
  },
);

// ===========================================================================
// Scenario 3: SL hit (LOSS) -> label B
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] SL hit (LOSS) -> label B: DOUBLE_B signal, negative PnL",
  () => {
    it("SL hit -> CLOSED(LOSS), Vector label=LOSS grade=B", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId, vectorId } = await setupPrerequisites({
        signalType: "DOUBLE_B",
        safetyPassed: true,
      });

      // 1. Create ticket
      const ticket = await createInitialTicket(db, signalId, {
        direction: "LONG",
        entryPrice: "42500",
        slPrice: "42000",
        size: "1.0",
      });
      expect(ticket.state).toBe("INITIAL");

      // 2. SL hit: close the ticket with negative PnL
      // The daemon would detect SL filled on the exchange; here we simulate directly
      const closedTicket = await closeTicket(db, ticket.id, {
        closeReason: "SL",
        result: "LOSS",
        pnl: "-500.00",
      });
      expect(closedTicket.state).toBe("CLOSED");
      expect(closedTicket.close_reason).toBe("SL");
      expect(d(closedTicket.pnl!).toString()).toBe("-500");

      // 3. finalizeLabel -> LOSS, grade B (DOUBLE_B signal with winrate=0.70 but pnl < 0)
      // Note: grade is based on signal properties, not trade outcome
      // DOUBLE_B + safety_passed + winrate 0.70 >= 0.65 => grade A
      // But the task spec says "grade=B (DOUBLE_B signal)" for SL hit.
      // Let's re-read: the task says grade=B means the signal was DOUBLE_B type.
      // classifyGrade for DOUBLE_B + safety=true + winrate=0.70 => A
      // For grade B, we need: DOUBLE_B + (safety=false OR winrate < 0.65)
      // We'll override the signal detail to set winrate < 0.65 for this test
      await pool`
        UPDATE signal_details SET value = '0.60'
        WHERE signal_id = ${signalId} AND key = 'knn_winrate'
      `;

      const labelResult = await finalizeLabel(db, ticket.id, vectorId);
      expect(labelResult.label).toBe("LOSS");
      expect(labelResult.grade).toBe("B");

      // 4. Verify Vector in DB
      const vectors = await pool`SELECT label, grade, labeled_at FROM vectors WHERE id = ${vectorId}`;
      const vec = vectors[0]!;
      expect(vec.label).toBe("LOSS");
      expect(vec.grade).toBe("B");
      expect(vec.labeled_at).not.toBeNull();

      // 5. Verify SymbolState is IDLE
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("IDLE");
    });
  },
);

// ===========================================================================
// Scenario 4: Trailing SL ratchet -- only moves in favorable direction
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] Trailing SL ratchet: LONG TP1_HIT -> SL moves up only, never down",
  () => {
    it("processTrailing ratchets SL upward, refuses to move it downward", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId } = await setupPrerequisites();

      // 1. Create ticket and manually set to TP1_HIT with trailing active
      const ticket = await createInitialTicket(db, signalId, {
        direction: "LONG",
        entryPrice: "42500",
        slPrice: "42000",
        size: "1.0",
        tp1Price: "43500",
        tp2Price: "44500",
      });

      await transitionTicket(db, ticket.id, "TP1_HIT");
      await pool`
        UPDATE tickets
        SET remaining_size = '0.5',
            trailing_active = true,
            current_sl_price = '42500',
            trailing_price = '42500',
            max_profit = '1000'
        WHERE id = ${ticket.id}
      `;

      const adapter = createMockAdapter();

      // 2. Price goes up to 44000 -> trailing SL should ratchet up
      const trailingResult1 = await processTrailing({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "0.5",
          trailing_active: true,
          trailing_price: "42500",
          max_profit: "1000",
          sl_order_id: null,
        },
        currentPrice: d("44000"),
        exchange: EXCHANGE,
      });
      expect(trailingResult1.updated).toBe(true);
      expect(trailingResult1.newTrailingPrice).not.toBeNull();
      const firstTrailingPrice = trailingResult1.newTrailingPrice!;
      // LONG trailing: entry + maxProfit * 0.5
      // maxProfit = max(1000, 44000 - 42500) = max(1000, 1500) = 1500
      // newSl = 42500 + 1500 * 0.5 = 42500 + 750 = 43250
      expect(firstTrailingPrice.toString()).toBe("43250");

      // Update DB with the new trailing price
      await pool`
        UPDATE tickets
        SET trailing_price = ${firstTrailingPrice.toString()},
            current_sl_price = ${firstTrailingPrice.toString()},
            max_profit = ${trailingResult1.newMaxProfit!.toString()}
        WHERE id = ${ticket.id}
      `;

      // Insert SL order if created
      if (trailingResult1.slOrder) {
        trailingResult1.slOrder.ticket_id = ticket.id;
        await db.insert(orderTable).values(trailingResult1.slOrder);
      }

      // 3. Price goes down to 43000 -> trailing SL should NOT move down
      const trailingResult2 = await processTrailing({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "0.5",
          trailing_active: true,
          trailing_price: firstTrailingPrice.toString(),
          max_profit: trailingResult1.newMaxProfit!.toString(),
          sl_order_id: null,
        },
        currentPrice: d("43000"),
        exchange: EXCHANGE,
      });
      expect(trailingResult2.updated).toBe(false);
      expect(trailingResult2.newTrailingPrice).toBeNull();

      // 4. Verify DB trailing_price did not change (still the first ratcheted value)
      const dbTicket = (
        await db.select().from(ticketTable).where(eq(ticketTable.id, ticket.id))
      )[0]!;
      expect(dbTicket.trailing_price).toBe(firstTrailingPrice.toString());

      // 5. Price goes even higher to 45000 -> trailing SL should ratchet further up
      const trailingResult3 = await processTrailing({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "0.5",
          trailing_active: true,
          trailing_price: firstTrailingPrice.toString(),
          max_profit: trailingResult1.newMaxProfit!.toString(),
          sl_order_id: null,
        },
        currentPrice: d("45000"),
        exchange: EXCHANGE,
      });
      expect(trailingResult3.updated).toBe(true);
      expect(trailingResult3.newTrailingPrice).not.toBeNull();
      // maxProfit = max(1500, 45000 - 42500) = max(1500, 2500) = 2500
      // newSl = 42500 + 2500 * 0.5 = 42500 + 1250 = 43750
      expect(trailingResult3.newTrailingPrice!.toString()).toBe("43750");

      // Confirm it's higher than the first trailing price
      expect(trailingResult3.newTrailingPrice!.greaterThan(firstTrailingPrice)).toBe(true);
    });
  },
);

// ===========================================================================
// Scenario 5: MFE/MAE tracking
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] MFE/MAE tracking: multiple price points -> correct max_favorable and max_adverse",
  () => {
    it("tracks MFE/MAE correctly across multiple price updates", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId } = await setupPrerequisites();

      // 1. Create ticket
      const ticket = await createInitialTicket(db, signalId, {
        direction: "LONG",
        entryPrice: "42500",
        slPrice: "42000",
        size: "1.0",
      });

      // 2. Simulate price points and track MFE/MAE
      const entryPrice = "42500";
      let prevMfe = "0";
      let prevMae = "0";

      // Price point 1: 42800 (favorable +300)
      const result1 = calcMfeMae(entryPrice, "42800", "LONG", prevMfe, prevMae);
      expect(result1.mfe.toString()).toBe("300");
      expect(result1.mae.toString()).toBe("0");

      // Apply to DB
      const updates1 = updateMfeMae({ mfe: result1.mfe, mae: result1.mae });
      await pool`
        UPDATE tickets
        SET max_favorable = ${updates1.max_favorable},
            max_adverse = ${updates1.max_adverse}
        WHERE id = ${ticket.id}
      `;
      prevMfe = result1.mfe.toString();
      prevMae = result1.mae.toString();

      // Price point 2: 42200 (adverse -300 from entry)
      const result2 = calcMfeMae(entryPrice, "42200", "LONG", prevMfe, prevMae);
      expect(result2.mfe.toString()).toBe("300"); // MFE ratchets -- stays at 300
      expect(result2.mae.toString()).toBe("300"); // MAE = 42500 - 42200 = 300

      const updates2 = updateMfeMae({ mfe: result2.mfe, mae: result2.mae });
      await pool`
        UPDATE tickets
        SET max_favorable = ${updates2.max_favorable},
            max_adverse = ${updates2.max_adverse}
        WHERE id = ${ticket.id}
      `;
      prevMfe = result2.mfe.toString();
      prevMae = result2.mae.toString();

      // Price point 3: 43500 (new high, favorable +1000)
      const result3 = calcMfeMae(entryPrice, "43500", "LONG", prevMfe, prevMae);
      expect(result3.mfe.toString()).toBe("1000"); // new MFE
      expect(result3.mae.toString()).toBe("300"); // MAE stays at 300

      const updates3 = updateMfeMae({ mfe: result3.mfe, mae: result3.mae });
      await pool`
        UPDATE tickets
        SET max_favorable = ${updates3.max_favorable},
            max_adverse = ${updates3.max_adverse}
        WHERE id = ${ticket.id}
      `;
      prevMfe = result3.mfe.toString();
      prevMae = result3.mae.toString();

      // Price point 4: 41800 (new low, adverse -700 from entry)
      const result4 = calcMfeMae(entryPrice, "41800", "LONG", prevMfe, prevMae);
      expect(result4.mfe.toString()).toBe("1000"); // MFE stays at 1000
      expect(result4.mae.toString()).toBe("700"); // new MAE

      const updates4 = updateMfeMae({ mfe: result4.mfe, mae: result4.mae });
      await pool`
        UPDATE tickets
        SET max_favorable = ${updates4.max_favorable},
            max_adverse = ${updates4.max_adverse}
        WHERE id = ${ticket.id}
      `;

      // Price point 5: 43000 (mid-range, neither new high nor new low)
      const result5 = calcMfeMae(entryPrice, "43000", "LONG", result4.mfe.toString(), result4.mae.toString());
      expect(result5.mfe.toString()).toBe("1000"); // no change
      expect(result5.mae.toString()).toBe("700"); // no change

      const updates5 = updateMfeMae({ mfe: result5.mfe, mae: result5.mae });
      await pool`
        UPDATE tickets
        SET max_favorable = ${updates5.max_favorable},
            max_adverse = ${updates5.max_adverse}
        WHERE id = ${ticket.id}
      `;

      // 3. Verify final DB state
      const dbTicket = (
        await db.select().from(ticketTable).where(eq(ticketTable.id, ticket.id))
      )[0]!;
      expect(dbTicket.max_favorable).toBe("1000");
      expect(dbTicket.max_adverse).toBe("700");

      // 4. Verify Decimal precision preserved
      expect(d(dbTicket.max_favorable!).toString()).toBe("1000");
      expect(d(dbTicket.max_adverse!).toString()).toBe("700");
    });
  },
);

// ===========================================================================
// Scenario 6: SHORT direction -- TP1 hit + SL hit (WIN)
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] SHORT TP1 -> SL hit (WIN): verify direction-aware exit logic",
  () => {
    it("SHORT TP1 detected when price <= tp1, SL breakeven, close as WIN", async () => {
      const db = getDb();
      const pool = getPool();

      // Need a separate signal for SHORT direction
      await seedCommonCodes();
      await insertSymbolWithState();
      const watchSessionId = await insertWatchSession("SHORT");
      const candleId = await insertCandle();
      const vectorId = await insertVector(candleId);
      const signalId = await insertSignal(watchSessionId, {
        direction: "SHORT",
        signalType: "DOUBLE_B",
        safetyPassed: true,
        vectorId,
      });
      await insertSignalDetail(signalId, "knn_winrate", "0.80");

      // 1. Create SHORT ticket
      const ticket = await createInitialTicket(db, signalId, {
        direction: "SHORT",
        entryPrice: "42500",
        slPrice: "43000",
        size: "1.0",
        tp1Price: "41500",
        tp2Price: "40500",
      });
      expect(ticket.state).toBe("INITIAL");
      expect(ticket.direction).toBe("SHORT");

      // 2. checkExit: SHORT TP1 hit when price <= 41500
      const action = checkExit(
        {
          state: "INITIAL",
          direction: "SHORT",
          entry_price: "42500",
          tp1_price: "41500",
          tp2_price: "40500",
          size: "1.0",
          remaining_size: "1.0",
          opened_at: ticket.opened_at,
          trailing_active: false,
          max_favorable: "0",
          max_adverse: "0",
        },
        "41400", // price below TP1 for SHORT
        Date.now(),
      );
      expect(action.type).toBe("TP1");

      // 3. processExit(TP1)
      const adapter = createMockAdapter();
      const exitResult = await processExit({
        adapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "SHORT",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "1.0",
          trailing_active: false,
          trailing_price: null,
          max_profit: "0",
          sl_order_id: null,
        },
        action,
        exchange: EXCHANGE,
      });
      expect(exitResult.success).toBe(true);
      expect(exitResult.ticketUpdates!.trailing_active).toBe(true);
      expect(exitResult.ticketUpdates!.current_sl_price).toBe("42500"); // breakeven

      // 4. Transition and close
      await transitionTicket(db, ticket.id, "TP1_HIT");
      if (exitResult.closeOrder) {
        exitResult.closeOrder.ticket_id = ticket.id;
        await db.insert(orderTable).values(exitResult.closeOrder);
      }

      const closedTicket = await closeTicket(db, ticket.id, {
        closeReason: "TRAILING",
        result: "WIN",
        pnl: "300.00",
      });
      expect(closedTicket.state).toBe("CLOSED");

      // 5. Finalize label
      const labelResult = await finalizeLabel(db, ticket.id, vectorId);
      expect(labelResult.label).toBe("WIN");
      expect(labelResult.grade).toBe("A"); // DOUBLE_B + safety + winrate 0.80

      // 6. Verify Vector
      const vectors = await pool`SELECT label, grade FROM vectors WHERE id = ${vectorId}`;
      expect(vectors[0]!.label).toBe("WIN");
      expect(vectors[0]!.grade).toBe("A");
    });
  },
);

// ===========================================================================
// Scenario 7: processExit close order failure -> success=false
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] Close order fails gracefully: processExit returns success=false with FAILED order",
  () => {
    it("adapter.createOrder throws during close -> ExitResult.success=false, order has FAILED status", async () => {
      const db = getDb();
      const { signalId } = await setupPrerequisites();

      const ticket = await createInitialTicket(db, signalId, {
        direction: "LONG",
        size: "1.0",
      });

      // Adapter that fails on reduceOnly close orders
      const failAdapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          if (params.reduceOnly) {
            throw new Error("Exchange unreachable");
          }
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: params.price ?? d("42500"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const action = checkExit(
        {
          state: "INITIAL",
          direction: "LONG",
          entry_price: "42500",
          tp1_price: "43500",
          tp2_price: "44500",
          size: "1.0",
          remaining_size: "1.0",
          opened_at: ticket.opened_at,
          trailing_active: false,
          max_favorable: "0",
          max_adverse: "0",
        },
        "43600",
        Date.now(),
      );
      expect(action.type).toBe("TP1");

      const exitResult = await processExit({
        adapter: failAdapter,
        ticket: {
          id: ticket.id,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          direction: "LONG",
          entry_price: "42500",
          size: "1.0",
          remaining_size: "1.0",
          trailing_active: false,
          trailing_price: null,
          max_profit: "0",
          sl_order_id: null,
        },
        action,
        exchange: EXCHANGE,
      });

      // Graceful failure
      expect(exitResult.success).toBe(false);
      expect(exitResult.closeOrder).not.toBeNull();
      expect(exitResult.closeOrder!.status).toBe("FAILED");
      expect(exitResult.newState).toBeNull();
      expect(exitResult.ticketUpdates).toBeNull();
    });
  },
);
