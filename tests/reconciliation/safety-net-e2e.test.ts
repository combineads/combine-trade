/**
 * E2E integration tests for the reconciliation safety-net flow:
 * Exchange positions vs DB tickets -> comparator -> worker actions
 * -> EventLog records -> Slack notification hooks
 *
 * Requires a running test database (see tests/helpers/test-db.ts).
 * Tests are skipped when the DB is unavailable.
 *
 * - ExchangeAdapter: MOCKED (fetchPositions returns controlled data)
 * - Slack fetch: MOCKED (capture calls, never hit real webhook)
 * - DB: REAL PostgreSQL via test-db helpers
 *
 * FK chain: symbol -> symbol_state -> watch_session -> signal -> ticket
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";

import { d } from "@/core/decimal";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Direction, Exchange } from "@/core/types";
import { getDb, getPool } from "@/db/pool";
import { eventLogTable, symbolStateTable } from "@/db/schema";
import { insertEvent, queryEvents } from "@/db/event-log";
import { runOnce, type ReconciliationDeps } from "@/reconciliation/worker";
import type { TicketSnapshot } from "@/reconciliation/comparator";
import * as slackModule from "@/notifications/slack";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYMBOL_BTC = "BTCUSDT";
const SYMBOL_ETH = "ETHUSDT";
const SYMBOL_SOL = "SOLUSDT";
const SYMBOL_DOGE = "DOGEUSDT";
const EXCHANGE_BINANCE: Exchange = "binance";
const EXCHANGE_OKX: Exchange = "okx";

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
    createOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ),
    cancelOrder: mock(() => Promise.resolve()),
    editOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ),
    fetchOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ),
    watchOHLCV: mock(() => Promise.resolve(() => {})),
    getExchangeInfo: mock(() =>
      Promise.resolve({
        symbol: SYMBOL_BTC,
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
// Position / ticket helpers
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<ExchangePosition> = {}): ExchangePosition {
  return {
    symbol: SYMBOL_BTC,
    exchange: EXCHANGE_BINANCE,
    side: "LONG" as Direction,
    size: d("1.5"),
    entryPrice: d("50000"),
    unrealizedPnl: d("100"),
    leverage: 10,
    liquidationPrice: d("45000"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

/**
 * Inserts symbol + symbol_state rows required by FK constraints.
 * Returns the symbol_state ID.
 */
async function insertSymbolWithState(opts: {
  symbol: string;
  exchange: string;
  fsmState?: string;
}): Promise<string> {
  const pool = getPool();
  const { symbol, exchange, fsmState = "HAS_POSITION" } = opts;

  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${symbol}, ${"BASE"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;

  const result = await pool`
    INSERT INTO symbol_state (symbol, exchange, fsm_state, execution_mode)
    VALUES (${symbol}, ${exchange}, ${fsmState}, ${"live"})
    ON CONFLICT (symbol, exchange) DO UPDATE
      SET fsm_state = EXCLUDED.fsm_state
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Inserts a watch_session row. Returns the watch_session ID.
 */
async function insertWatchSession(
  symbol: string,
  exchange: string,
  direction: Direction = "LONG",
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
      (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${direction}, now())
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Inserts a signal row. Returns the signal ID.
 */
async function insertSignal(
  symbol: string,
  exchange: string,
  watchSessionId: string,
  direction: Direction = "LONG",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO signals
      (symbol, exchange, watch_session_id, timeframe, signal_type, direction,
       entry_price, sl_price, safety_passed, knn_decision)
    VALUES
      (${symbol}, ${exchange}, ${watchSessionId}, ${"5M"}, ${"ONE_B"},
       ${direction}, ${"50000"}, ${"49000"}, ${true}, ${"PASS"})
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Inserts a ticket row (active, state=INITIAL). Returns the ticket ID.
 */
async function insertTicket(
  symbol: string,
  exchange: string,
  signalId: string,
  direction: Direction = "LONG",
  state = "INITIAL",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO tickets
      (symbol, exchange, signal_id, timeframe, direction, state,
       entry_price, sl_price, current_sl_price, size, remaining_size,
       leverage, opened_at)
    VALUES
      (${symbol}, ${exchange}, ${signalId}, ${"5M"}, ${direction}, ${state},
       ${"50000"}, ${"49000"}, ${"49000"}, ${"1.5"}, ${"1.5"},
       ${10}, now())
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Inserts a PENDING order for a symbol (used for PENDING safety test).
 */
async function insertPendingOrder(
  symbol: string,
  exchange: string,
  ticketId: string,
): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO orders
      (ticket_id, exchange, order_type, status, side, size,
       intent_id, idempotency_key)
    VALUES
      (${ticketId}, ${exchange}, ${"ENTRY"}, ${"PENDING"}, ${"BUY"},
       ${"1.5"}, ${crypto.randomUUID()}, ${crypto.randomUUID()})
  `;
}

/**
 * Seeds a full chain: symbol -> symbol_state -> watch_session -> signal -> ticket.
 * Returns the ticket ID.
 */
async function seedFullChain(
  symbol: string,
  exchange: string,
  direction: Direction = "LONG",
  fsmState = "HAS_POSITION",
  ticketState = "INITIAL",
): Promise<string> {
  await insertSymbolWithState({ symbol, exchange, fsmState });
  const wsId = await insertWatchSession(symbol, exchange, direction);
  const sigId = await insertSignal(symbol, exchange, wsId, direction);
  return insertTicket(symbol, exchange, sigId, direction, ticketState);
}

// ---------------------------------------------------------------------------
// Build ReconciliationDeps wired to real DB
// ---------------------------------------------------------------------------

/**
 * Creates ReconciliationDeps that use REAL DB for event log and symbol state,
 * but mock emergencyClose. The getActiveTickets and getPendingSymbols
 * implementations query the real DB.
 */
function createRealDbDeps(overrides?: Partial<ReconciliationDeps>): ReconciliationDeps {
  const db = getDb();
  const pool = getPool();

  return {
    getActiveTickets: async (): Promise<TicketSnapshot[]> => {
      const rows = await pool`
        SELECT id, symbol, exchange, direction, state, created_at
        FROM tickets
        WHERE state != 'CLOSED'
      `;
      return rows.map((r) => ({
        id: r.id as string,
        symbol: r.symbol as string,
        exchange: r.exchange as Exchange,
        direction: r.direction as Direction,
        state: r.state as string,
        created_at: new Date(r.created_at as string),
      }));
    },

    getPendingSymbols: async (): Promise<Set<string>> => {
      const rows = await pool`
        SELECT DISTINCT
          t.symbol || ':' || t.exchange AS key
        FROM orders o
        JOIN tickets t ON o.ticket_id = t.id
        WHERE o.status = 'PENDING'
      `;
      return new Set(rows.map((r) => r.key as string));
    },

    emergencyClose: mock(() => Promise.resolve()),

    setSymbolStateIdle: async (symbol: string, exchange: Exchange): Promise<void> => {
      await pool`
        UPDATE symbol_state
        SET fsm_state = 'IDLE', updated_at = now()
        WHERE symbol = ${symbol} AND exchange = ${exchange}
      `;
    },

    insertEvent: async (
      eventType: string,
      data: Record<string, unknown>,
      meta?: { symbol?: string; exchange?: string },
    ): Promise<void> => {
      await insertEvent(db, {
        event_type: eventType,
        symbol: meta?.symbol ?? null,
        exchange: meta?.exchange ?? null,
        data,
      });
    },

    ...overrides,
  };
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
// Scenario 1: All matched
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 1: All matched -> EventLog RECONCILIATION(MATCHED)",
  () => {
    it("exchange 1 position + DB 1 ticket -> matched, EventLog MATCHED event recorded", async () => {
      const db = getDb();

      // Seed: symbol + symbol_state + ticket
      await seedFullChain(SYMBOL_BTC, EXCHANGE_BINANCE, "LONG");

      // Mock adapter returns 1 matching position
      const positions: ExchangePosition[] = [
        makePosition({ symbol: SYMBOL_BTC, exchange: EXCHANGE_BINANCE, side: "LONG" }),
      ];
      const adapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve(positions)),
      });

      const deps = createRealDbDeps();
      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, adapter],
      ]);

      const result = await runOnce(adapters, deps);

      // Verify counts
      expect(result.matched).toBe(1);
      expect(result.unmatched).toBe(0);
      expect(result.orphaned).toBe(0);
      expect(result.errors).toHaveLength(0);

      // emergencyClose should NOT be called
      expect(deps.emergencyClose).not.toHaveBeenCalled();

      // Verify EventLog has a RECONCILIATION event with action=MATCHED
      const events = await queryEvents(db, { event_type: "RECONCILIATION" });
      expect(events.length).toBeGreaterThanOrEqual(1);
      const matchedEvent = events.find(
        (e) => (e.data as Record<string, unknown>)?.action === "MATCHED",
      );
      expect(matchedEvent).toBeDefined();
      expect((matchedEvent!.data as Record<string, unknown>).count).toBe(1);
    });
  },
);

// ===========================================================================
// Scenario 2: Unmatched -> panic close
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 2: Unmatched -> panic close, EventLog PANIC_CLOSE",
  () => {
    it("exchange position with no DB ticket -> emergencyClose called, EventLog PANIC_CLOSE", async () => {
      const db = getDb();

      // Seed symbol + symbol_state but NO ticket for ETH
      await insertSymbolWithState({
        symbol: SYMBOL_ETH,
        exchange: EXCHANGE_BINANCE,
        fsmState: "IDLE",
      });

      // Exchange reports a position for ETH that has no matching ticket
      const positions: ExchangePosition[] = [
        makePosition({ symbol: SYMBOL_ETH, exchange: EXCHANGE_BINANCE, side: "LONG" }),
      ];
      const adapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve(positions)),
      });

      const deps = createRealDbDeps();
      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, adapter],
      ]);

      const result = await runOnce(adapters, deps);

      // Verify unmatched
      expect(result.unmatched).toBe(1);
      expect(result.matched).toBe(0);

      // emergencyClose should be called once
      expect(deps.emergencyClose).toHaveBeenCalledTimes(1);
      const ecCall = (deps.emergencyClose as ReturnType<typeof mock>).mock.calls[0];
      expect(ecCall[0].symbol).toBe(SYMBOL_ETH);
      expect(ecCall[0].exchange).toBe(EXCHANGE_BINANCE);

      // Verify EventLog has PANIC_CLOSE event
      const events = await queryEvents(db, { event_type: "RECONCILIATION" });
      const panicEvent = events.find(
        (e) => (e.data as Record<string, unknown>)?.action === "PANIC_CLOSE",
      );
      expect(panicEvent).toBeDefined();
      expect(panicEvent!.symbol).toBe(SYMBOL_ETH);
      expect(panicEvent!.exchange).toBe(EXCHANGE_BINANCE);
      expect((panicEvent!.data as Record<string, unknown>).symbol).toBe(SYMBOL_ETH);
    });
  },
);

// ===========================================================================
// Scenario 3: Orphaned -> IDLE
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 3: Orphaned -> SymbolState IDLE, EventLog ORPHAN_IDLE",
  () => {
    it("DB ticket with no exchange position -> SymbolState set to IDLE, EventLog ORPHAN_IDLE", async () => {
      const db = getDb();
      const pool = getPool();

      // Seed full chain: ticket exists but exchange will report no position
      await seedFullChain(SYMBOL_SOL, EXCHANGE_BINANCE, "LONG");

      // Exchange reports NO positions
      const adapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve([])),
      });

      const deps = createRealDbDeps();
      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, adapter],
      ]);

      const result = await runOnce(adapters, deps);

      // Verify orphaned
      expect(result.orphaned).toBe(1);
      expect(result.matched).toBe(0);
      expect(result.unmatched).toBe(0);

      // emergencyClose should NOT be called for orphans
      expect(deps.emergencyClose).not.toHaveBeenCalled();

      // Verify SymbolState.fsm_state updated to IDLE
      const stateRows = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL_SOL} AND exchange = ${EXCHANGE_BINANCE}
      `;
      expect(stateRows[0]!.fsm_state).toBe("IDLE");

      // Verify EventLog has ORPHAN_IDLE event
      const events = await queryEvents(db, { event_type: "RECONCILIATION" });
      const orphanEvent = events.find(
        (e) => (e.data as Record<string, unknown>)?.action === "ORPHAN_IDLE",
      );
      expect(orphanEvent).toBeDefined();
      expect(orphanEvent!.symbol).toBe(SYMBOL_SOL);
      expect(orphanEvent!.exchange).toBe(EXCHANGE_BINANCE);
    });
  },
);

// ===========================================================================
// Scenario 4: PENDING safety — unmatched symbol excluded
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 4: PENDING safety — excludes from panic close",
  () => {
    it("PENDING order exists for symbol -> unmatched excluded, no panic close", async () => {
      const db = getDb();

      // Seed full chain with a ticket + PENDING order for BTC
      const ticketId = await seedFullChain(SYMBOL_BTC, EXCHANGE_BINANCE, "LONG");
      await insertPendingOrder(SYMBOL_BTC, EXCHANGE_BINANCE, ticketId);

      // Also seed another symbol (ETH) with position but NO ticket and NO pending
      await insertSymbolWithState({
        symbol: SYMBOL_ETH,
        exchange: EXCHANGE_BINANCE,
        fsmState: "IDLE",
      });

      // Exchange reports positions for both BTC (matched) and a phantom DOGE
      // that has a pending order
      // First, seed DOGE with a pending order
      const dogeTicketId = await seedFullChain(SYMBOL_DOGE, EXCHANGE_BINANCE, "LONG");
      await insertPendingOrder(SYMBOL_DOGE, EXCHANGE_BINANCE, dogeTicketId);

      // Exchange reports DOGE position (with pending order -> excluded)
      // and ETH position (no ticket, no pending -> unmatched)
      const positions: ExchangePosition[] = [
        makePosition({ symbol: SYMBOL_BTC, exchange: EXCHANGE_BINANCE, side: "LONG" }),
        makePosition({ symbol: SYMBOL_DOGE, exchange: EXCHANGE_BINANCE, side: "SHORT" }),
        makePosition({ symbol: SYMBOL_ETH, exchange: EXCHANGE_BINANCE, side: "LONG" }),
      ];
      const adapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve(positions)),
      });

      const deps = createRealDbDeps();
      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, adapter],
      ]);

      const result = await runOnce(adapters, deps);

      // BTC: matched (position + ticket)
      // DOGE (SHORT side): no matching ticket direction but has pending order -> excluded
      // ETH: unmatched (position, no ticket, no pending)
      expect(result.matched).toBe(1);
      expect(result.excluded).toBeGreaterThanOrEqual(1);
      expect(result.unmatched).toBeGreaterThanOrEqual(1);

      // emergencyClose should be called for ETH, but NOT for DOGE
      const ecCalls = (deps.emergencyClose as ReturnType<typeof mock>).mock.calls;
      const ecSymbols = ecCalls.map((c: unknown[]) => (c[0] as { symbol: string }).symbol);
      expect(ecSymbols).not.toContain(SYMBOL_DOGE);
    });
  },
);

// ===========================================================================
// Scenario 5: Exchange API failure -> skip that exchange
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 5: Exchange API failure -> skip, others processed",
  () => {
    it("fetchPositions throws for one exchange, other exchange processes normally", async () => {
      const db = getDb();

      // Seed BTC on OKX (will be matched)
      await seedFullChain(SYMBOL_BTC, EXCHANGE_OKX, "LONG");

      // Binance adapter throws
      const binanceAdapter = createMockAdapter({
        fetchPositions: mock(() => Promise.reject(new Error("API rate limit exceeded"))),
      });

      // OKX adapter returns matching position
      const okxPositions: ExchangePosition[] = [
        makePosition({ symbol: SYMBOL_BTC, exchange: EXCHANGE_OKX, side: "LONG" }),
      ];
      const okxAdapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve(okxPositions)),
      });

      const deps = createRealDbDeps();
      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, binanceAdapter],
        [EXCHANGE_OKX, okxAdapter],
      ]);

      const result = await runOnce(adapters, deps);

      // OKX should be processed (matched)
      expect(result.matched).toBe(1);

      // Binance error recorded
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.exchange).toBe(EXCHANGE_BINANCE);
      expect(result.errors[0]!.error).toContain("rate limit");

      // emergencyClose should NOT be called (OKX matched, Binance skipped)
      expect(deps.emergencyClose).not.toHaveBeenCalled();
    });
  },
);

// ===========================================================================
// Scenario 6: Slack integration — mismatch triggers sendSlackAlert
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 6: Slack integration on mismatch",
  () => {
    it("on unmatched position, sendSlackAlert would be called (mock verification)", async () => {
      const db = getDb();

      // Spy on sendSlackAlert
      const slackSpy = spyOn(slackModule, "sendSlackAlert").mockResolvedValue(undefined);

      // Seed symbol but NO ticket for ETH -> will be unmatched
      await insertSymbolWithState({
        symbol: SYMBOL_ETH,
        exchange: EXCHANGE_BINANCE,
        fsmState: "IDLE",
      });

      const positions: ExchangePosition[] = [
        makePosition({ symbol: SYMBOL_ETH, exchange: EXCHANGE_BINANCE, side: "LONG" }),
      ];
      const adapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve(positions)),
      });

      // Wire up deps that call sendSlackAlert on emergencyClose
      const deps = createRealDbDeps({
        emergencyClose: mock(async (params) => {
          // Simulate what the real daemon would do: call sendSlackAlert on mismatch
          await slackModule.sendSlackAlert(
            slackModule.SlackEventType.RECONCILIATION_MISMATCH,
            {
              symbol: params.symbol,
              exchange: params.exchange,
              action: "PANIC_CLOSE",
            },
          );
        }),
      });

      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, adapter],
      ]);

      const result = await runOnce(adapters, deps);

      expect(result.unmatched).toBe(1);

      // Verify sendSlackAlert was called with RECONCILIATION_MISMATCH
      expect(slackSpy).toHaveBeenCalledTimes(1);
      const callArgs = slackSpy.mock.calls[0];
      expect(callArgs[0]).toBe("RECONCILIATION_MISMATCH");
      expect(callArgs[1]).toMatchObject({
        symbol: SYMBOL_ETH,
        exchange: EXCHANGE_BINANCE,
        action: "PANIC_CLOSE",
      });

      // Restore spy
      slackSpy.mockRestore();
    });
  },
);

// ===========================================================================
// Scenario 7: Complex multi-exchange multi-symbol
// ===========================================================================

describe.skipIf(!dbAvailable)(
  "[safety-net-e2e] Scenario 7: Complex — 2 exchanges x 2 symbols, mixed results",
  () => {
    it("1 matched + 1 unmatched + 1 orphaned -> each handled correctly", async () => {
      const db = getDb();
      const pool = getPool();

      // Setup:
      // Binance BTC: position + ticket -> MATCHED
      // Binance ETH: position, no ticket -> UNMATCHED (panic close)
      // OKX SOL: ticket, no position -> ORPHANED (IDLE)

      // 1) Binance BTC: matched
      await seedFullChain(SYMBOL_BTC, EXCHANGE_BINANCE, "LONG");

      // 2) Binance ETH: unmatched (just symbol_state, no ticket)
      await insertSymbolWithState({
        symbol: SYMBOL_ETH,
        exchange: EXCHANGE_BINANCE,
        fsmState: "IDLE",
      });

      // 3) OKX SOL: orphaned (ticket but no exchange position)
      await seedFullChain(SYMBOL_SOL, EXCHANGE_OKX, "LONG");

      // Binance adapter: BTC + ETH positions
      const binancePositions: ExchangePosition[] = [
        makePosition({ symbol: SYMBOL_BTC, exchange: EXCHANGE_BINANCE, side: "LONG" }),
        makePosition({ symbol: SYMBOL_ETH, exchange: EXCHANGE_BINANCE, side: "LONG" }),
      ];
      const binanceAdapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve(binancePositions)),
      });

      // OKX adapter: NO positions (SOL will be orphaned)
      const okxAdapter = createMockAdapter({
        fetchPositions: mock(() => Promise.resolve([])),
      });

      const deps = createRealDbDeps();
      const adapters = new Map<Exchange, ExchangeAdapter>([
        [EXCHANGE_BINANCE, binanceAdapter],
        [EXCHANGE_OKX, okxAdapter],
      ]);

      const result = await runOnce(adapters, deps);

      // Verify counts
      expect(result.matched).toBe(1); // BTC on Binance
      expect(result.unmatched).toBe(1); // ETH on Binance
      expect(result.orphaned).toBe(1); // SOL on OKX
      expect(result.errors).toHaveLength(0);

      // emergencyClose called once for ETH unmatched
      expect(deps.emergencyClose).toHaveBeenCalledTimes(1);
      const ecCall = (deps.emergencyClose as ReturnType<typeof mock>).mock.calls[0];
      expect(ecCall[0].symbol).toBe(SYMBOL_ETH);
      expect(ecCall[0].exchange).toBe(EXCHANGE_BINANCE);

      // OKX SOL symbol_state should be IDLE now
      const solState = await pool`
        SELECT fsm_state FROM symbol_state
        WHERE symbol = ${SYMBOL_SOL} AND exchange = ${EXCHANGE_OKX}
      `;
      expect(solState[0]!.fsm_state).toBe("IDLE");

      // Verify EventLog records
      const events = await queryEvents(db, { event_type: "RECONCILIATION" });

      // Should have at least 3 events: MATCHED, PANIC_CLOSE, ORPHAN_IDLE
      const actions = events.map(
        (e) => (e.data as Record<string, unknown>)?.action,
      );
      expect(actions).toContain("MATCHED");
      expect(actions).toContain("PANIC_CLOSE");
      expect(actions).toContain("ORPHAN_IDLE");

      // Verify PANIC_CLOSE event details
      const panicEvent = events.find(
        (e) => (e.data as Record<string, unknown>)?.action === "PANIC_CLOSE",
      );
      expect(panicEvent!.symbol).toBe(SYMBOL_ETH);
      expect(panicEvent!.exchange).toBe(EXCHANGE_BINANCE);

      // Verify ORPHAN_IDLE event details
      const orphanEvent = events.find(
        (e) => (e.data as Record<string, unknown>)?.action === "ORPHAN_IDLE",
      );
      expect(orphanEvent!.symbol).toBe(SYMBOL_SOL);
      expect(orphanEvent!.exchange).toBe(EXCHANGE_OKX);
    });
  },
);
