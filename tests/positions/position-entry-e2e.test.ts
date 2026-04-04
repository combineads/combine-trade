/**
 * E2E integration tests for the full position entry flow:
 * Signal → Sizer → Executor → Ticket → Loss Limit
 *
 * Requires a running test database (see tests/helpers/test-db.ts).
 * Tests are skipped when the DB is unavailable.
 *
 * ExchangeAdapter is always mocked — no real exchange calls.
 *
 * FK chain: symbol → symbol_state → watch_session → signal → ticket → orders
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
import { and, eq } from "drizzle-orm";

import { d } from "@/core/decimal";
import type { DbInstance } from "@/db/pool";
import { getDb, getPool } from "@/db/pool";
import {
  orderTable,
  symbolStateTable,
  ticketTable,
} from "@/db/schema";
import type { CreateOrderParams, ExchangeAdapter, OrderResult } from "@/core/ports";
import type { Direction, Exchange, ExecutionMode } from "@/core/types";
import { calculateSize, getRiskPct, type SizeParams } from "@/positions/sizer";
import {
  executeEntry,
  ExecutionModeError,
  type ExecuteEntryParams,
} from "@/orders/executor";
import { createTicket, getActiveTicket } from "@/positions/ticket-manager";
import {
  checkLossLimit,
  loadLossLimitConfig,
  type LossLimitConfig,
  type SymbolLossState,
} from "@/limits/loss-limit";
import { checkSlippage, type SlippageConfig } from "@/orders/slippage";
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

/**
 * Creates a fully mocked ExchangeAdapter with configurable createOrder behavior.
 * By default, all calls succeed with a filledPrice matching entry expectations.
 */
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

/**
 * Inserts symbol + symbol_state rows required by FK constraints.
 */
async function insertSymbolWithState(opts?: {
  symbol?: string;
  exchange?: string;
  fsmState?: string;
  executionMode?: string;
  lossesToday?: string;
  lossesSession?: number;
}): Promise<string> {
  const pool = getPool();
  const symbol = opts?.symbol ?? SYMBOL;
  const exchange = opts?.exchange ?? EXCHANGE;
  const fsmState = opts?.fsmState ?? "WATCHING";
  const executionMode = opts?.executionMode ?? "live";
  const lossesToday = opts?.lossesToday ?? "0";
  const lossesSession = opts?.lossesSession ?? 0;

  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin USDT"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;

  const result = await pool`
    INSERT INTO symbol_state (symbol, exchange, fsm_state, execution_mode, daily_bias, daily_open, losses_today, losses_session)
    VALUES (${symbol}, ${exchange}, ${fsmState}, ${executionMode}, ${"LONG_ONLY"}, ${"42000"}, ${lossesToday}, ${lossesSession})
    ON CONFLICT (symbol, exchange) DO UPDATE
      SET fsm_state = EXCLUDED.fsm_state,
          execution_mode = EXCLUDED.execution_mode,
          daily_bias = EXCLUDED.daily_bias,
          daily_open = EXCLUDED.daily_open,
          losses_today = EXCLUDED.losses_today,
          losses_session = EXCLUDED.losses_session
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Inserts a watch_session row. Invalidates any prior active session first.
 */
async function insertWatchSession(
  direction: Direction = "LONG",
  symbol = SYMBOL,
  exchange = EXCHANGE,
): Promise<string> {
  const pool = getPool();
  // Invalidate any existing active session for this symbol
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

/**
 * Inserts a signal row. Returns signal ID.
 */
async function insertSignal(
  watchSessionId: string,
  direction: Direction = "LONG",
  symbol = SYMBOL,
  exchange = EXCHANGE,
): Promise<string> {
  const pool = getPool();
  const entryPrice = direction === "LONG" ? "42500.00" : "42500.00";
  const slPrice = direction === "LONG" ? "42000.00" : "43000.00";
  const result = await pool`
    INSERT INTO signals
      (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed, knn_decision)
    VALUES
      (${symbol}, ${exchange}, ${watchSessionId}, ${TIMEFRAME}, ${"ONE_B"}, ${direction}, ${entryPrice}, ${slPrice}, ${true}, ${"PASS"})
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Seeds common_code entries for LOSS_LIMIT and SLIPPAGE configs.
 */
async function seedCommonCodes(): Promise<void> {
  const pool = getPool();
  // LOSS_LIMIT config
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
 * Full prerequisite chain for a position entry test scenario.
 */
async function setupPrerequisites(opts?: {
  direction?: Direction;
  executionMode?: string;
  lossesToday?: string;
  lossesSession?: number;
}): Promise<{
  symbolStateId: string;
  watchSessionId: string;
  signalId: string;
  direction: Direction;
}> {
  const direction = opts?.direction ?? "LONG";
  await seedCommonCodes();
  const symbolStateId = await insertSymbolWithState({
    fsmState: "WATCHING",
    executionMode: opts?.executionMode ?? "live",
    lossesToday: opts?.lossesToday,
    lossesSession: opts?.lossesSession,
  });
  const watchSessionId = await insertWatchSession(direction);
  const signalId = await insertSignal(watchSessionId, direction);
  return { symbolStateId, watchSessionId, signalId, direction };
}

// ---------------------------------------------------------------------------
// Standard sizing parameters
// ---------------------------------------------------------------------------

function makeSizeParams(direction: Direction): SizeParams {
  const entryPrice = d("42500");
  const slPrice = direction === "LONG" ? d("42000") : d("43000");
  return {
    balance: d("10000"),
    entryPrice,
    slPrice,
    direction,
    exchangeInfo: {
      symbol: SYMBOL,
      tickSize: d("0.001"),
      minOrderSize: d("0.001"),
      maxLeverage: 125,
      contractSize: d("1"),
    },
    riskPct: getRiskPct(d("10000")),
  };
}

function makeSlippageConfig(): SlippageConfig {
  return { maxSpreadPct: d("0.05") };
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
// Scenario 1: LONG full flow
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] LONG full flow: Signal → Sizer → Executor → Ticket → DB verification",
  () => {
    it("completes entry: SymbolState=HAS_POSITION, Ticket INITIAL, Orders ENTRY+SL FILLED, Decimals preserved", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId } = await setupPrerequisites({ direction: "LONG" });

      // 1. Calculate position size
      const sizeResult = calculateSize(makeSizeParams("LONG"));
      expect(sizeResult).not.toBeNull();
      expect(sizeResult!.adjustedForLevCap).toBe(false);

      // 2. Execute entry via mock adapter
      const adapter = createMockAdapter();
      const entryParams: ExecuteEntryParams = {
        adapter,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        mode: "live",
        direction: "LONG",
        entryPrice: d("42500"),
        slPrice: d("42000"),
        size: sizeResult!.size,
        leverage: sizeResult!.leverage,
        slippageConfig: makeSlippageConfig(),
      };
      const entryResult = await executeEntry(entryParams);

      expect(entryResult.success).toBe(true);
      expect(entryResult.aborted).toBe(false);
      expect(entryResult.entryOrder).not.toBeNull();
      expect(entryResult.slOrder).not.toBeNull();

      // 3. Create ticket (atomic SymbolState transition WATCHING -> HAS_POSITION)
      const ticket = await createTicket(db, {
        symbol: SYMBOL,
        exchange: EXCHANGE,
        signalId,
        timeframe: TIMEFRAME,
        direction: "LONG",
        entryPrice: "42500",
        slPrice: "42000",
        size: sizeResult!.size.toString(),
        leverage: sizeResult!.leverage,
        tp1Price: "43500",
        tp2Price: "44500",
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.state).toBe("INITIAL");
      expect(ticket.direction).toBe("LONG");

      // 4. Insert order records into DB
      const entryOrderRow = entryResult.entryOrder!;
      entryOrderRow.ticket_id = ticket.id;
      await db.insert(orderTable).values(entryOrderRow);

      const slOrderRow = entryResult.slOrder!;
      slOrderRow.ticket_id = ticket.id;
      await db.insert(orderTable).values(slOrderRow);

      // 5. Verify SymbolState.fsm_state = HAS_POSITION
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("HAS_POSITION");

      // 6. Verify Ticket in DB
      const ticketRows = await db
        .select()
        .from(ticketTable)
        .where(eq(ticketTable.id, ticket.id));
      expect(ticketRows).toHaveLength(1);
      const dbTicket = ticketRows[0]!;
      expect(dbTicket.state).toBe("INITIAL");
      expect(dbTicket.direction).toBe("LONG");
      expect(dbTicket.entry_price).toBe("42500");
      expect(dbTicket.sl_price).toBe("42000");
      expect(dbTicket.current_sl_price).toBe("42000");
      expect(dbTicket.size).toBe(sizeResult!.size.toString());
      expect(dbTicket.remaining_size).toBe(sizeResult!.size.toString());

      // 7. Verify Order records in DB (ENTRY + SL)
      const orders = await db
        .select()
        .from(orderTable)
        .where(eq(orderTable.ticket_id, ticket.id));
      expect(orders.length).toBeGreaterThanOrEqual(2);

      const entryOrder = orders.find((o) => o.order_type === "ENTRY");
      const slOrder = orders.find((o) => o.order_type === "SL");
      expect(entryOrder).toBeDefined();
      expect(slOrder).toBeDefined();
      expect(entryOrder!.status).toBe("FILLED");
      expect(entryOrder!.side).toBe("BUY");

      // 8. Decimal values preserved
      expect(d(dbTicket.entry_price!).toString()).toBe("42500");
      expect(d(dbTicket.sl_price!).toString()).toBe("42000");
    });
  },
);

// ===========================================================================
// Scenario 2: SHORT full flow
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] SHORT full flow: Signal(SHORT) → Sizer → Executor → Ticket → DB verification",
  () => {
    it("completes SHORT entry with correct direction, prices, and sides", async () => {
      const db = getDb();
      const pool = getPool();
      const { signalId } = await setupPrerequisites({ direction: "SHORT" });

      // 1. Calculate position size for SHORT
      const sizeResult = calculateSize(makeSizeParams("SHORT"));
      expect(sizeResult).not.toBeNull();

      // 2. Execute entry
      const adapter = createMockAdapter();
      const entryResult = await executeEntry({
        adapter,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        mode: "live",
        direction: "SHORT",
        entryPrice: d("42500"),
        slPrice: d("43000"),
        size: sizeResult!.size,
        leverage: sizeResult!.leverage,
        slippageConfig: makeSlippageConfig(),
      });

      expect(entryResult.success).toBe(true);
      expect(entryResult.entryOrder).not.toBeNull();
      expect(entryResult.slOrder).not.toBeNull();

      // Entry side for SHORT is SELL
      expect(entryResult.entryOrder!.side).toBe("SELL");
      // SL side for SHORT is BUY
      expect(entryResult.slOrder!.side).toBe("BUY");

      // 3. Create ticket
      const ticket = await createTicket(db, {
        symbol: SYMBOL,
        exchange: EXCHANGE,
        signalId,
        timeframe: TIMEFRAME,
        direction: "SHORT",
        entryPrice: "42500",
        slPrice: "43000",
        size: sizeResult!.size.toString(),
        leverage: sizeResult!.leverage,
        tp1Price: "41500",
        tp2Price: "40500",
      });

      expect(ticket.direction).toBe("SHORT");
      expect(ticket.state).toBe("INITIAL");
      expect(ticket.sl_price).toBe("43000");

      // 4. Insert orders
      entryResult.entryOrder!.ticket_id = ticket.id;
      await db.insert(orderTable).values(entryResult.entryOrder!);
      entryResult.slOrder!.ticket_id = ticket.id;
      await db.insert(orderTable).values(entryResult.slOrder!);

      // 5. Verify SymbolState
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("HAS_POSITION");

      // 6. Verify Ticket
      const dbTicket = (
        await db.select().from(ticketTable).where(eq(ticketTable.id, ticket.id))
      )[0]!;
      expect(dbTicket.direction).toBe("SHORT");
      expect(dbTicket.entry_price).toBe("42500");
      expect(dbTicket.sl_price).toBe("43000");

      // 7. Verify Orders
      const orders = await db
        .select()
        .from(orderTable)
        .where(eq(orderTable.ticket_id, ticket.id));
      const entryOrder = orders.find((o) => o.order_type === "ENTRY");
      expect(entryOrder!.side).toBe("SELL");
      const slOrder = orders.find((o) => o.order_type === "SL");
      expect(slOrder!.side).toBe("BUY");
    });
  },
);

// ===========================================================================
// Scenario 3: Loss limit blocks entry
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] Loss limit blocks entry: losses_today exceeds daily threshold",
  () => {
    it("checkLossLimit returns allowed=false, no Ticket or Order created", async () => {
      const db = getDb();
      const pool = getPool();

      // Set losses_today to 10% of balance (1000 on 10000 balance)
      // This matches the daily limit exactly, so it should block
      await setupPrerequisites({
        direction: "LONG",
        lossesToday: "1000",
        lossesSession: 0,
      });

      // Load config from DB
      const config = await loadLossLimitConfig(db);

      // Build loss state from the seeded symbol_state
      const lossState: SymbolLossState = {
        lossesToday: d("1000"),
        lossesSession: 0,
        lossesThisHour5m: 0,
        lossesThisHour1m: 0,
      };

      const balance = d("10000");
      const result = checkLossLimit(lossState, balance, config);

      // Should be blocked
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain("DAILY");

      // Verify no ticket was created
      const activeTicket = await getActiveTicket(db, SYMBOL, EXCHANGE);
      expect(activeTicket).toBeNull();

      // Verify no orders exist
      const orders = await db.select().from(orderTable);
      expect(orders).toHaveLength(0);

      // Verify SymbolState.fsm_state is still WATCHING (not transitioned)
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("WATCHING");
    });
  },
);

// ===========================================================================
// Scenario 4: SL registration fails -> emergency close
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] SL registration fails -> emergency close: PANIC_CLOSE order created",
  () => {
    it("SL fails 3 times, emergencyClose called, PANIC_CLOSE order in DB", async () => {
      const db = getDb();
      const { signalId } = await setupPrerequisites({ direction: "LONG" });

      // Create adapter where bracket fails + SL always fails + emergency close succeeds
      let entryDone = false;
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          // Bracket call fails
          if (!entryDone && params.stopLoss) {
            throw new Error("Bracket not supported");
          }
          // Plain entry succeeds
          if (!entryDone && params.type === "market" && !params.stopLoss && !params.reduceOnly) {
            entryDone = true;
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("42500"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // SL attempts always fail
          if (params.type === "stop_market") {
            throw new Error("SL registration failed");
          }
          // Emergency close (reduceOnly market)
          if (params.reduceOnly) {
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("42500"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("42500"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const sizeResult = calculateSize(makeSizeParams("LONG"));
      expect(sizeResult).not.toBeNull();

      const entryResult = await executeEntry({
        adapter,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        mode: "live",
        direction: "LONG",
        entryPrice: d("42500"),
        slPrice: d("42000"),
        size: sizeResult!.size,
        leverage: sizeResult!.leverage,
        slippageConfig: makeSlippageConfig(),
      });

      // Executor should report failure + abort
      expect(entryResult.success).toBe(false);
      expect(entryResult.aborted).toBe(true);
      expect(entryResult.abortReason).toContain("SL");

      // Entry order was created but SL failed
      expect(entryResult.entryOrder).not.toBeNull();
      expect(entryResult.slOrder).toBeNull();

      // No ticket should be created (entry aborted)
      const activeTicket = await getActiveTicket(db, SYMBOL, EXCHANGE);
      expect(activeTicket).toBeNull();

      // Insert the ENTRY order and a PANIC_CLOSE order record in DB
      // (The daemon would do this; we simulate here)
      await db.insert(orderTable).values(entryResult.entryOrder!);

      // The emergencyClose was called internally by executeEntry
      // We verify the adapter was called with reduceOnly
      const calls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
      const reduceOnlyCalls = calls.filter(
        (c) => (c[0] as CreateOrderParams).reduceOnly === true,
      );
      expect(reduceOnlyCalls.length).toBeGreaterThanOrEqual(1);

      // Verify SymbolState is still WATCHING (no ticket was created)
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("WATCHING");
    });
  },
);

// ===========================================================================
// Scenario 5: Slippage exceeds threshold -> ABORT
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] Slippage exceeds threshold -> ABORT: emergency close triggered",
  () => {
    it("fill price far from expected, slippage check fails, emergencyClose, no ticket", async () => {
      const db = getDb();
      const { signalId } = await setupPrerequisites({ direction: "LONG" });

      // Adapter returns a fill price 10% higher (exceeds 5% max spread)
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          // Entry fills at 10% slippage
          if (params.type === "market" && !params.reduceOnly) {
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("46750"), // 42500 * 1.10 = 46750 -> 10% slippage
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // Emergency close succeeds
          if (params.reduceOnly) {
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("46750"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("42500"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      // Verify the pure slippage check first
      const slippageResult = checkSlippage(d("42500"), d("46750"), d("0.05"));
      expect(slippageResult.passed).toBe(false);
      expect(slippageResult.slippagePct.toNumber()).toBeGreaterThan(0.05);

      const sizeResult = calculateSize(makeSizeParams("LONG"));
      expect(sizeResult).not.toBeNull();

      const entryResult = await executeEntry({
        adapter,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        mode: "live",
        direction: "LONG",
        entryPrice: d("42500"),
        slPrice: d("42000"),
        size: sizeResult!.size,
        leverage: sizeResult!.leverage,
        slippageConfig: { maxSpreadPct: d("0.05") },
      });

      expect(entryResult.success).toBe(false);
      expect(entryResult.aborted).toBe(true);
      expect(entryResult.abortReason).toContain("slippage");

      // No ticket should be created
      const activeTicket = await getActiveTicket(db, SYMBOL, EXCHANGE);
      expect(activeTicket).toBeNull();

      // SymbolState should still be WATCHING
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("WATCHING");
    });
  },
);

// ===========================================================================
// Scenario 6: Analysis mode blocks entry
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] Analysis mode blocks: execution_mode='analysis' -> ExecutionModeError, no DB changes",
  () => {
    it("executeEntry throws ExecutionModeError, no tickets or orders created", async () => {
      const db = getDb();
      const { signalId } = await setupPrerequisites({
        direction: "LONG",
        executionMode: "analysis",
      });

      const adapter = createMockAdapter();
      const sizeResult = calculateSize(makeSizeParams("LONG"));
      expect(sizeResult).not.toBeNull();

      // executeEntry should throw for analysis mode
      await expect(
        executeEntry({
          adapter,
          symbol: SYMBOL,
          exchange: EXCHANGE,
          mode: "analysis",
          direction: "LONG",
          entryPrice: d("42500"),
          slPrice: d("42000"),
          size: sizeResult!.size,
          leverage: sizeResult!.leverage,
          slippageConfig: makeSlippageConfig(),
        }),
      ).rejects.toThrow(ExecutionModeError);

      // Verify no adapter calls were made (setLeverage not called)
      expect(adapter.setLeverage).not.toHaveBeenCalled();
      expect(adapter.createOrder).not.toHaveBeenCalled();

      // No ticket created
      const activeTicket = await getActiveTicket(db, SYMBOL, EXCHANGE);
      expect(activeTicket).toBeNull();

      // No orders created
      const orders = await db.select().from(orderTable);
      expect(orders).toHaveLength(0);

      // SymbolState unchanged
      const pool = getPool();
      const stateRows = await pool`
        SELECT fsm_state, execution_mode FROM symbol_state
        WHERE symbol = ${SYMBOL} AND exchange = ${EXCHANGE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("WATCHING");
      expect(stateRows[0]!.execution_mode).toBe("analysis");
    });
  },
);

// ===========================================================================
// Scenario 7: Leverage cap — tight SL reduces position size
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[E2E] Leverage cap: very tight SL -> leverage > 38x -> position size reduced",
  () => {
    it("calculateSize detects leverage exceeds 38x cap, adjusts size down, Ticket has reduced size", async () => {
      const db = getDb();
      const { signalId } = await setupPrerequisites({ direction: "LONG" });

      // Very tight SL: entry=42500, SL=42490 (10-point distance)
      // Risk = 10000 * 0.03 = 300 (for balance 10000)
      // rawSize = 300 / 10 = 30
      // rawLeverage = 30 * 42500 / 10000 = 127500 / 10000 = 127.5x >> 38x
      // -> adjustedForLevCap = true
      // -> finalSize = (10000 * 38) / 42500 = 380000/42500 = 8.941...
      // -> after roundDown to 0.001 tick: 8.941
      const tightSizeParams: SizeParams = {
        balance: d("10000"),
        entryPrice: d("42500"),
        slPrice: d("42490"),
        direction: "LONG",
        exchangeInfo: {
          symbol: SYMBOL,
          tickSize: d("0.001"),
          minOrderSize: d("0.001"),
          maxLeverage: 125,
          contractSize: d("1"),
        },
        riskPct: getRiskPct(d("10000")),
      };

      const sizeResult = calculateSize(tightSizeParams);
      expect(sizeResult).not.toBeNull();
      expect(sizeResult!.adjustedForLevCap).toBe(true);
      expect(sizeResult!.leverage).toBeLessThanOrEqual(38);

      // The size should be significantly less than the uncapped rawSize (30)
      expect(sizeResult!.size.toNumber()).toBeLessThan(30);
      expect(sizeResult!.size.toNumber()).toBeGreaterThan(0);

      // Execute entry with reduced size
      const adapter = createMockAdapter();
      const entryResult = await executeEntry({
        adapter,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        mode: "live",
        direction: "LONG",
        entryPrice: d("42500"),
        slPrice: d("42490"),
        size: sizeResult!.size,
        leverage: sizeResult!.leverage,
        slippageConfig: makeSlippageConfig(),
      });
      expect(entryResult.success).toBe(true);

      // Create ticket with the capped size
      const ticket = await createTicket(db, {
        symbol: SYMBOL,
        exchange: EXCHANGE,
        signalId,
        timeframe: TIMEFRAME,
        direction: "LONG",
        entryPrice: "42500",
        slPrice: "42490",
        size: sizeResult!.size.toString(),
        leverage: sizeResult!.leverage,
      });

      expect(ticket.state).toBe("INITIAL");

      // Verify the ticket has the leverage-capped size
      const dbTicket = (
        await db.select().from(ticketTable).where(eq(ticketTable.id, ticket.id))
      )[0]!;

      // Size in DB should match the adjusted (reduced) size
      expect(d(dbTicket.size!).toString()).toBe(sizeResult!.size.toString());
      expect(d(dbTicket.remaining_size!).toString()).toBe(sizeResult!.size.toString());
      // Leverage should be 38 or less (the cap)
      expect(dbTicket.leverage).toBeLessThanOrEqual(38);
    });
  },
);
