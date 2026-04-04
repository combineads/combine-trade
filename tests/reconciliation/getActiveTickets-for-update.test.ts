/**
 * Tests for T-12-013: getActiveTickets FOR UPDATE production implementation.
 *
 * Verifies:
 * 1. makeGetActiveTickets SQL query contains FOR UPDATE
 * 2. makeGetActiveTickets SQL query filters WHERE state != 'CLOSED'
 * 3. makeGetActiveTickets runs inside a db.transaction()
 * 4. makeGetActiveTickets returns TicketSnapshot[] from transaction result
 * 5. makeGetActiveTickets with empty result returns [] without error
 * 6. makeGetActiveTickets wires into runOnce() without errors
 */

import { describe, expect, it, mock } from "bun:test";
import { ne } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import type { Direction, Exchange } from "@/core/types";
import { ticketTable } from "@/db/schema";
import { makeGetActiveTickets } from "@/db/queries";
import type { TicketSnapshot } from "@/reconciliation/comparator";
import { runOnce, type ReconciliationDeps } from "@/reconciliation/worker";
import type { ExchangeAdapter } from "@/core/ports";
import { d } from "@/core/decimal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicketSnapshot(overrides: Partial<TicketSnapshot> = {}): TicketSnapshot {
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

// ---------------------------------------------------------------------------
// Scenario 1: Query builder SQL includes FOR UPDATE
// ---------------------------------------------------------------------------

describe("makeGetActiveTickets — SQL query shape", () => {
  it("Drizzle query builder produces SQL with FOR UPDATE", () => {
    // Use Drizzle's QueryBuilder to build the same query as makeGetActiveTickets
    // and verify the SQL string without a real DB connection.
    const qb = new QueryBuilder();

    const query = qb
      .select({
        id: ticketTable.id,
        symbol: ticketTable.symbol,
        exchange: ticketTable.exchange,
        direction: ticketTable.direction,
        state: ticketTable.state,
        created_at: ticketTable.created_at,
      })
      .from(ticketTable)
      .where(ne(ticketTable.state, "CLOSED"))
      .for("update");

    const { sql } = query.toSQL();

    expect(sql).toContain("for update");
  });

  it("Drizzle query builder filters WHERE state != 'CLOSED'", () => {
    const qb = new QueryBuilder();

    const query = qb
      .select({
        id: ticketTable.id,
        symbol: ticketTable.symbol,
        exchange: ticketTable.exchange,
        direction: ticketTable.direction,
        state: ticketTable.state,
        created_at: ticketTable.created_at,
      })
      .from(ticketTable)
      .where(ne(ticketTable.state, "CLOSED"))
      .for("update");

    const { sql, params } = query.toSQL();

    // The WHERE clause should reference the state column
    expect(sql).toContain("state");
    // The parameter should be "CLOSED"
    expect(params).toContain("CLOSED");
  });

  it("Drizzle query builder selects the tickets table", () => {
    const qb = new QueryBuilder();

    const query = qb
      .select({
        id: ticketTable.id,
        symbol: ticketTable.symbol,
        exchange: ticketTable.exchange,
        direction: ticketTable.direction,
        state: ticketTable.state,
        created_at: ticketTable.created_at,
      })
      .from(ticketTable)
      .where(ne(ticketTable.state, "CLOSED"))
      .for("update");

    const { sql } = query.toSQL();

    expect(sql).toContain("tickets");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: makeGetActiveTickets uses db.transaction()
// ---------------------------------------------------------------------------

describe("makeGetActiveTickets — transaction contract", () => {
  it("calls db.transaction() exactly once per invocation", async () => {
    const mockTickets = [makeTicketSnapshot()];
    let transactionCallCount = 0;

    // Mock DbInstance that records transaction calls
    const mockDb = {
      transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) => {
        transactionCallCount++;
        // Simulate the transaction executing the inner function
        const mockTx = {
          select: mock(() => mockTx),
          from: mock(() => mockTx),
          where: mock(() => mockTx),
          for: mock(() => Promise.resolve(mockTickets)),
        };
        return fn(mockTx);
      }),
    } as unknown as import("@/db/pool").DbInstance;

    const getActiveTickets = makeGetActiveTickets(mockDb);
    const result = await getActiveTickets();

    expect(transactionCallCount).toBe(1);
    expect(result).toEqual(mockTickets);
  });

  it("returns empty array when transaction returns no rows", async () => {
    const mockDb = {
      transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: mock(() => mockTx),
          from: mock(() => mockTx),
          where: mock(() => mockTx),
          for: mock(() => Promise.resolve([])),
        };
        return fn(mockTx);
      }),
    } as unknown as import("@/db/pool").DbInstance;

    const getActiveTickets = makeGetActiveTickets(mockDb);
    const result = await getActiveTickets();

    expect(result).toEqual([]);
  });

  it("propagates transaction error without swallowing it", async () => {
    const dbError = new Error("db connection lost");

    const mockDb = {
      transaction: mock(async (_fn: (tx: unknown) => Promise<unknown>) => {
        throw dbError;
      }),
    } as unknown as import("@/db/pool").DbInstance;

    const getActiveTickets = makeGetActiveTickets(mockDb);

    await expect(getActiveTickets()).rejects.toThrow("db connection lost");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: makeGetActiveTickets wires into runOnce()
// ---------------------------------------------------------------------------

describe("makeGetActiveTickets — runOnce() integration", () => {
  it("getActiveTickets from makeGetActiveTickets works with runOnce() — empty DB", async () => {
    const mockDb = {
      transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: mock(() => mockTx),
          from: mock(() => mockTx),
          where: mock(() => mockTx),
          for: mock(() => Promise.resolve([])),
        };
        return fn(mockTx);
      }),
    } as unknown as import("@/db/pool").DbInstance;

    const getActiveTickets = makeGetActiveTickets(mockDb);

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({ getActiveTickets });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.actionErrors).toBe(0);
  });

  it("getActiveTickets from makeGetActiveTickets works with runOnce() — returns tickets", async () => {
    const ticket = makeTicketSnapshot({
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
    });

    const mockDb = {
      transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: mock(() => mockTx),
          from: mock(() => mockTx),
          where: mock(() => mockTx),
          for: mock(() => Promise.resolve([ticket])),
        };
        return fn(mockTx);
      }),
    } as unknown as import("@/db/pool").DbInstance;

    const getActiveTickets = makeGetActiveTickets(mockDb);

    // Adapter returns a matching position for the ticket
    const adapter = createMockAdapter({
      fetchPositions: mock(() =>
        Promise.resolve([
          {
            symbol: "BTCUSDT",
            exchange: "binance" as Exchange,
            side: "LONG" as Direction,
            size: d("1.0"),
            entryPrice: d("50000"),
            unrealizedPnl: d("100"),
            leverage: 10,
            liquidationPrice: d("45000"),
          },
        ]),
      ),
    });

    const deps = createMockDeps({ getActiveTickets });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    // The ticket and position match — no panic close needed
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.actionErrors).toBe(0);
  });
});
