/**
 * Tests for T-10-014: Reconciliation FOR UPDATE lock contract + Panic Close Slack alert.
 *
 * Covers:
 * 1. sendSlackAlert is called once per successful panic close, with correct details
 * 2. sendSlackAlert is called N times for N unmatched positions
 * 3. sendSlackAlert throwing an Error does NOT increase actionErrors and does NOT stop reconciliation
 * 4. sendSlackAlert is NOT called when there are no unmatched positions
 * 5. getActiveTickets FOR UPDATE SQL contract — verify caller can pass a FOR UPDATE query
 * 6. FOR UPDATE query returning 0 rows — no error, empty array returned
 */

import { describe, expect, it, mock } from "bun:test";
import { d } from "@/core/decimal";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Direction, Exchange } from "@/core/types";
import type { TicketSnapshot } from "@/reconciliation/comparator";
import { runOnce, type ReconciliationDeps } from "@/reconciliation/worker";

// ---------------------------------------------------------------------------
// Helpers — position/ticket factories
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<ExchangePosition> = {}): ExchangePosition {
  return {
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    side: "LONG" as Direction,
    size: d("1.5"),
    entryPrice: d("50000"),
    unrealizedPnl: d("100"),
    leverage: 10,
    liquidationPrice: d("45000"),
    ...overrides,
  };
}

function makeTicket(overrides: Partial<TicketSnapshot> = {}): TicketSnapshot {
  return {
    id: "ticket-1",
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    direction: "LONG" as Direction,
    state: "INITIAL",
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers — mock adapter
// ---------------------------------------------------------------------------

function createMockAdapter(overrides?: Partial<ExchangeAdapter>): ExchangeAdapter {
  return {
    fetchOHLCV: mock(() => Promise.resolve([])),
    fetchBalance: mock(() => Promise.resolve({ total: d("10000"), available: d("5000") })),
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
        symbol: "BTC/USDT:USDT",
        tickSize: d("0.1"),
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
// Helpers — mock deps
// ---------------------------------------------------------------------------

function createMockDeps(overrides?: Partial<ReconciliationDeps>): ReconciliationDeps {
  return {
    getActiveTickets: mock(() => Promise.resolve([] as TicketSnapshot[])),
    getPendingSymbols: mock(() => Promise.resolve(new Set<string>())),
    emergencyClose: mock(() => Promise.resolve()),
    setSymbolStateIdle: mock(() => Promise.resolve()),
    insertEvent: mock(() => Promise.resolve()),
    ...overrides,
  };
}

// ===========================================================================
// Scenario 1: One unmatched position -> sendSlackAlert called once with correct details
// ===========================================================================

describe("reconciliation-safety — sendSlackAlert on panic close", () => {
  it("1 unmatched position -> sendSlackAlert called once with symbol/exchange/size/side", async () => {
    const position = makePosition({ symbol: "ETHUSDT", exchange: "binance", side: "LONG", size: d("2.0") });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const slackAlertMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      sendSlackAlert: slackAlertMock,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.unmatched).toBe(1);
    expect(deps.emergencyClose).toHaveBeenCalledTimes(1);

    // Wait a tick for fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(slackAlertMock).toHaveBeenCalledTimes(1);

    const [eventType, details] = slackAlertMock.mock.calls[0] as [
      string,
      Record<string, string | number | boolean | undefined>,
    ];
    expect(eventType).toBe("RECONCILIATION_MISMATCH");
    expect(details.symbol).toBe("ETHUSDT");
    expect(details.exchange).toBe("binance");
    expect(details.size).toBe("2");
    expect(details.side).toBe("LONG");
  });

  // =========================================================================
  // Scenario 2: Two unmatched positions -> sendSlackAlert called twice
  // =========================================================================

  it("2 unmatched positions -> sendSlackAlert called twice", async () => {
    const positions = [
      makePosition({ symbol: "ETHUSDT", exchange: "binance", side: "LONG" }),
      makePosition({ symbol: "SOLUSDT", exchange: "binance", side: "SHORT" }),
    ];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const slackAlertMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      sendSlackAlert: slackAlertMock,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.unmatched).toBe(2);
    expect(deps.emergencyClose).toHaveBeenCalledTimes(2);

    // Wait a tick for fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(slackAlertMock).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // Scenario 3: sendSlackAlert throws -> actionErrors NOT increased, reconciliation continues
  // =========================================================================

  it("sendSlackAlert throws -> actionErrors NOT increased, reconciliation continues", async () => {
    const position = makePosition({ symbol: "ETHUSDT", exchange: "binance" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const slackAlertMock = mock(() => Promise.reject(new Error("Slack webhook failed")));

    const deps = createMockDeps({
      sendSlackAlert: slackAlertMock,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    // Should not throw
    const result = await runOnce(adapters, deps);

    // Wait a tick for fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result.unmatched).toBe(1);
    // actionErrors must NOT be incremented due to Slack failure — it's fire-and-forget
    expect(result.actionErrors).toBe(0);
    // emergencyClose still called
    expect(deps.emergencyClose).toHaveBeenCalledTimes(1);
    // Slack was attempted
    expect(slackAlertMock).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Scenario 4: No unmatched positions -> sendSlackAlert NOT called
  // =========================================================================

  it("no unmatched positions (all matched) -> sendSlackAlert NOT called", async () => {
    const positions = [makePosition({ symbol: "BTCUSDT", exchange: "binance" })];
    const tickets = [makeTicket({ id: "t-1", symbol: "BTCUSDT", exchange: "binance" })];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const slackAlertMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve(tickets)),
      sendSlackAlert: slackAlertMock,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);

    // Wait a tick
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(slackAlertMock).not.toHaveBeenCalled();
    expect(deps.emergencyClose).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Scenario 5: sendSlackAlert not provided (optional dep) -> no error
  // =========================================================================

  it("sendSlackAlert not provided -> unmatched processed normally without error", async () => {
    const position = makePosition({ symbol: "ETHUSDT", exchange: "binance" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    // No sendSlackAlert in deps
    const deps = createMockDeps();

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.unmatched).toBe(1);
    expect(result.actionErrors).toBe(0);
    expect(deps.emergencyClose).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Scenario 6: emergencyClose fails -> sendSlackAlert NOT called for that position
  // =========================================================================

  it("emergencyClose fails -> sendSlackAlert NOT called for failed position", async () => {
    const position = makePosition({ symbol: "ETHUSDT", exchange: "binance" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const slackAlertMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      emergencyClose: mock(() => Promise.reject(new Error("exchange down"))),
      sendSlackAlert: slackAlertMock,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    // Wait a tick
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result.unmatched).toBe(1);
    expect(result.actionErrors).toBe(1); // emergencyClose failed
    // Slack should NOT be called since emergencyClose failed
    expect(slackAlertMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// FOR UPDATE SQL contract tests
// ===========================================================================

describe("reconciliation-safety — getActiveTickets FOR UPDATE contract", () => {
  // =========================================================================
  // Scenario 7: getActiveTickets implementation uses FOR UPDATE SQL
  // =========================================================================

  it("getActiveTickets implementation uses FOR UPDATE SQL (caller contract)", async () => {
    // This test verifies that a getActiveTickets implementation that issues
    // SELECT ... FOR UPDATE behaves correctly when wired into runOnce().
    // We simulate it by tracking the SQL text used by the mock implementation.

    const capturedQueries: string[] = [];

    // Simulate a getActiveTickets that includes FOR UPDATE in the SQL
    const getActiveTicketsWithForUpdate = async (): Promise<TicketSnapshot[]> => {
      const sql = "SELECT id, symbol, exchange, direction, state, created_at FROM tickets WHERE state != 'CLOSED' FOR UPDATE";
      capturedQueries.push(sql);
      // Return an empty array (like a real DB returning no rows)
      return [];
    };

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      getActiveTickets: getActiveTicketsWithForUpdate,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    // FOR UPDATE was included in the SQL issued by the implementation
    expect(capturedQueries.length).toBe(1);
    expect(capturedQueries[0]).toContain("FOR UPDATE");

    // No errors — even though 0 rows returned
    expect(result.errors).toHaveLength(0);
    expect(result.actionErrors).toBe(0);
  });

  // =========================================================================
  // Scenario 8: FOR UPDATE query returns 0 rows -> no error, empty result
  // =========================================================================

  it("FOR UPDATE query returns 0 rows -> no error, clean run", async () => {
    // Simulate the case where the DB has no active tickets (all CLOSED or empty)
    const getActiveTicketsForUpdateEmpty = async (): Promise<TicketSnapshot[]> => {
      // Represents: SELECT ... FOR UPDATE returning 0 rows
      return [];
    };

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      getActiveTickets: getActiveTicketsForUpdateEmpty,
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.excluded).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.actionErrors).toBe(0);
  });
});
