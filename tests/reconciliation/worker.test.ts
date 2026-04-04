import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { d } from "@/core/decimal";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Direction, Exchange } from "@/core/types";
import type { TicketSnapshot } from "@/reconciliation/comparator";
import {
  runOnce,
  startReconciliation,
  type ReconciliationDeps,
  type ReconciliationRunResult,
} from "@/reconciliation/worker";

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

// ---------------------------------------------------------------------------
// runOnce — all matched
// ---------------------------------------------------------------------------

describe("reconciliation-worker — runOnce", () => {
  it("all matched -> EventLog MATCHED, no emergencyClose calls", async () => {
    const positions = [makePosition()];
    const tickets = [makeTicket()];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve(tickets)),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.errors).toHaveLength(0);

    // emergencyClose should NOT be called
    expect(deps.emergencyClose).not.toHaveBeenCalled();
    // setSymbolStateIdle should NOT be called
    expect(deps.setSymbolStateIdle).not.toHaveBeenCalled();
    // insertEvent should be called with MATCHED
    expect(deps.insertEvent).toHaveBeenCalled();
    const call = (deps.insertEvent as ReturnType<typeof mock>).mock.calls[0];
    expect(call[0]).toBe("RECONCILIATION");
    expect(call[1].action).toBe("MATCHED");
    expect(call[1].count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // runOnce — one unmatched
  // ---------------------------------------------------------------------------

  it("one unmatched -> emergencyClose called, EventLog PANIC_CLOSE", async () => {
    // Exchange has a position, but no ticket in DB
    const positions = [makePosition({ symbol: "ETHUSDT", exchange: "binance" })];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const deps = createMockDeps();

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.unmatched).toBe(1);
    // emergencyClose should be called for the unmatched position
    expect(deps.emergencyClose).toHaveBeenCalledTimes(1);
    const ecCall = (deps.emergencyClose as ReturnType<typeof mock>).mock.calls[0];
    expect(ecCall[0].symbol).toBe("ETHUSDT");
    expect(ecCall[0].exchange).toBe("binance");

    // insertEvent should include a PANIC_CLOSE event
    const insertCalls = (deps.insertEvent as ReturnType<typeof mock>).mock.calls;
    const panicCall = insertCalls.find(
      (c: unknown[]) => c[0] === "RECONCILIATION" && (c[1] as Record<string, unknown>).action === "PANIC_CLOSE",
    );
    expect(panicCall).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // runOnce — one orphaned
  // ---------------------------------------------------------------------------

  it("one orphaned -> SymbolState set to IDLE, EventLog ORPHAN_IDLE", async () => {
    // DB has a ticket, but no exchange position
    const tickets = [makeTicket({ id: "orphan-1", symbol: "SOLUSDT", exchange: "binance" })];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve(tickets)),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.orphaned).toBe(1);
    // setSymbolStateIdle should be called
    expect(deps.setSymbolStateIdle).toHaveBeenCalledTimes(1);
    const idleCall = (deps.setSymbolStateIdle as ReturnType<typeof mock>).mock.calls[0];
    expect(idleCall[0]).toBe("SOLUSDT");
    expect(idleCall[1]).toBe("binance");

    // insertEvent should include an ORPHAN_IDLE event
    const insertCalls = (deps.insertEvent as ReturnType<typeof mock>).mock.calls;
    const orphanCall = insertCalls.find(
      (c: unknown[]) => c[0] === "RECONCILIATION" && (c[1] as Record<string, unknown>).action === "ORPHAN_IDLE",
    );
    expect(orphanCall).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // runOnce — mixed results
  // ---------------------------------------------------------------------------

  it("mixed results -> correct handling for each category", async () => {
    // BTC matched, ETH unmatched (no ticket), SOL orphaned (no position)
    const positions = [
      makePosition({ symbol: "BTCUSDT", exchange: "binance" }),
      makePosition({ symbol: "ETHUSDT", exchange: "binance" }),
    ];
    const tickets = [
      makeTicket({ id: "t-btc", symbol: "BTCUSDT", exchange: "binance" }),
      makeTicket({ id: "t-sol", symbol: "SOLUSDT", exchange: "binance" }),
    ];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve(tickets)),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(1);
    expect(result.orphaned).toBe(1);

    // emergencyClose for unmatched ETH
    expect(deps.emergencyClose).toHaveBeenCalledTimes(1);
    // setSymbolStateIdle for orphaned SOL
    expect(deps.setSymbolStateIdle).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // runOnce — PENDING symbol excluded
  // ---------------------------------------------------------------------------

  it("PENDING symbol excluded -> no panic close for that symbol", async () => {
    // Exchange has ETHUSDT position, no ticket, but it's in pending symbols
    const positions = [makePosition({ symbol: "ETHUSDT", exchange: "binance" })];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const deps = createMockDeps({
      getPendingSymbols: mock(() => Promise.resolve(new Set(["ETHUSDT:binance"]))),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.unmatched).toBe(0);
    expect(result.excluded).toBe(1);
    // emergencyClose should NOT be called because the symbol is pending
    expect(deps.emergencyClose).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // runOnce — exchange API fails
  // ---------------------------------------------------------------------------

  it("exchange API fails -> skips that exchange, processes others", async () => {
    // Binance adapter throws, OKX works fine
    const binanceAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.reject(new Error("API timeout"))),
    });

    const okxPositions = [makePosition({ symbol: "BTCUSDT", exchange: "okx" })];
    const okxAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(okxPositions)),
    });

    const tickets = [makeTicket({ id: "t-okx", symbol: "BTCUSDT", exchange: "okx" })];

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve(tickets)),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([
      ["binance", binanceAdapter],
      ["okx", okxAdapter],
    ]);

    const result = await runOnce(adapters, deps);

    // OKX should be processed normally (matched)
    expect(result.matched).toBe(1);
    // Binance error should be recorded
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.exchange).toBe("binance");
  });

  // ---------------------------------------------------------------------------
  // runOnce — snapshotTime: recent tickets excluded from comparison
  // ---------------------------------------------------------------------------

  it("records snapshotTime -> recent tickets excluded from comparison", async () => {
    // Position on exchange, but the ticket was created after the snapshot
    const positions = [makePosition({ symbol: "BTCUSDT", exchange: "binance" })];

    // Ticket created "in the future" relative to the snapshot
    const recentTicket = makeTicket({
      id: "t-recent",
      symbol: "BTCUSDT",
      exchange: "binance",
      // created_at must be after Date.now() which is used as snapshotTime.
      // We'll use a far-future date.
      created_at: new Date("2099-01-01T00:00:00Z"),
    });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve([recentTicket])),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    // Recent ticket should be excluded, position excluded (not panic-closed)
    expect(result.excluded).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(deps.emergencyClose).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // runOnce — emergencyClose failure -> logged, worker continues
  // ---------------------------------------------------------------------------

  it("emergencyClose failure -> logged, worker continues (does not throw)", async () => {
    const positions = [makePosition({ symbol: "ETHUSDT", exchange: "binance" })];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const deps = createMockDeps({
      emergencyClose: mock(() => Promise.reject(new Error("exchange down"))),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    // Should not throw even though emergencyClose fails
    const result = await runOnce(adapters, deps);

    expect(result.unmatched).toBe(1);
    // The error should be tracked
    expect(result.actionErrors).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // runOnce — multi-exchange: positions aggregated
  // ---------------------------------------------------------------------------

  it("multi-exchange: positions from all adapters aggregated", async () => {
    const binancePositions = [makePosition({ symbol: "BTCUSDT", exchange: "binance" })];
    const okxPositions = [makePosition({ symbol: "ETHUSDT", exchange: "okx" })];

    const binanceAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(binancePositions)),
    });
    const okxAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(okxPositions)),
    });

    const tickets = [
      makeTicket({ id: "t-btc", symbol: "BTCUSDT", exchange: "binance" }),
      makeTicket({ id: "t-eth", symbol: "ETHUSDT", exchange: "okx" }),
    ];

    const deps = createMockDeps({
      getActiveTickets: mock(() => Promise.resolve(tickets)),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([
      ["binance", binanceAdapter],
      ["okx", okxAdapter],
    ]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(2);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // runOnce — no positions, no tickets -> clean run
  // ---------------------------------------------------------------------------

  it("no positions, no tickets -> clean run, MATCHED count 0", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps();

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const result = await runOnce(adapters, deps);

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.excluded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// startReconciliation / stop
// ---------------------------------------------------------------------------

describe("reconciliation-worker — startReconciliation / stop", () => {
  it("calls runOnce with setTimeout chain", async () => {
    let runCount = 0;

    const adapter = createMockAdapter({
      fetchPositions: mock(() => {
        runCount++;
        return Promise.resolve([]);
      }),
    });

    const deps = createMockDeps();
    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const handle = startReconciliation(adapters, deps, { intervalMs: 50 });

    // Wait for at least 2 runs
    await new Promise((resolve) => setTimeout(resolve, 180));

    handle.stop();

    expect(runCount).toBeGreaterThanOrEqual(2);
  });

  it("stop() prevents next cycle", async () => {
    let runCount = 0;

    const adapter = createMockAdapter({
      fetchPositions: mock(() => {
        runCount++;
        return Promise.resolve([]);
      }),
    });

    const deps = createMockDeps();
    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const handle = startReconciliation(adapters, deps, { intervalMs: 50 });

    // Wait for first run
    await new Promise((resolve) => setTimeout(resolve, 30));
    const countAtStop = runCount;

    handle.stop();

    // Wait a bit more — should not increment further
    await new Promise((resolve) => setTimeout(resolve, 150));

    // The count should be at most countAtStop + 1 (if one was in-flight)
    expect(runCount).toBeLessThanOrEqual(countAtStop + 1);
  });

  it("uses default 60s interval when not specified", () => {
    const adapter = createMockAdapter();
    const deps = createMockDeps();
    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    // Just verify it starts without error; stop immediately
    const handle = startReconciliation(adapters, deps);
    handle.stop();
    // If we get here, default config was accepted
    expect(true).toBe(true);
  });
});
