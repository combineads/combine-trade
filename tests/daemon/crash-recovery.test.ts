/**
 * Tests for src/daemon/crash-recovery.ts — recoverFromCrash()
 *
 * Strategy: inject mocks for all external deps via CrashRecoveryDeps so no
 * real DB / exchange connections are needed. Every path in the business logic
 * is covered including error paths.
 */

import { describe, expect, it, mock } from "bun:test";

import { d } from "@/core/decimal";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { DailyBias, DetectionType, Direction, Exchange, WatchSession } from "@/core/types";
import type { EmergencyCloseParams } from "@/orders/executor";
import type { TicketSnapshot } from "@/reconciliation/comparator";
import { comparePositions } from "@/reconciliation/comparator";
import {
  recoverFromCrash,
  type CrashRecoveryDeps,
  type CrashRecoveryResult,
} from "@/daemon/crash-recovery";

// ---------------------------------------------------------------------------
// Factory helpers
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
    // Old enough to participate in reconciliation (far past)
    created_at: new Date("2020-01-01T00:00:00Z"),
    ...overrides,
  };
}

function createMockAdapter(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
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
        filledSize: d("1.5"),
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
        filledSize: d("1.5"),
        timestamp: new Date(),
      }),
    ),
    fetchOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("50000"),
        filledSize: d("1.5"),
        timestamp: new Date(),
      }),
    ),
    watchOHLCV: mock(() => Promise.resolve(() => {})),
    getExchangeInfo: mock(() =>
      Promise.resolve({
        symbol: "BTCUSDT",
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

function makeWatchSession(overrides: Partial<WatchSession> = {}): WatchSession {
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    detection_type: "SQUEEZE_BREAKOUT" as DetectionType,
    direction: "LONG" as Direction,
    tp1_price: null,
    tp2_price: null,
    detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    invalidated_at: null,
    invalidation_reason: null,
    context_data: null,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<CrashRecoveryDeps> = {}): CrashRecoveryDeps {
  return {
    adapters: new Map<Exchange, ExchangeAdapter>(),
    getActiveTickets: mock(() => Promise.resolve([] as TicketSnapshot[])),
    getPendingSymbols: mock(() => Promise.resolve(new Set<string>())),
    comparePositions,
    emergencyClose: mock(() => Promise.resolve()),
    setSymbolStateIdle: mock(() => Promise.resolve()),
    checkSlOnExchange: mock(() => Promise.resolve(true)),
    reRegisterSl: mock(() => Promise.resolve()),
    restoreLossCounters: mock(() => Promise.resolve()),
    getActiveWatchSessions: mock(() => Promise.resolve([] as WatchSession[])),
    getSymbolDailyBias: mock(() => Promise.resolve(null as DailyBias | null)),
    invalidateWatchSession: mock(() => Promise.resolve()),
    insertEvent: mock(() => Promise.resolve()),
    sendSlackAlert: mock(() => Promise.resolve()),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// All matched + SL exists → no actions, clean result
// ---------------------------------------------------------------------------

describe("recoverFromCrash — all matched, SL exists", () => {
  it("returns clean result with no errors when all positions are matched and SL present", async () => {
    const position = makePosition();
    const ticket = makeTicket();

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
      checkSlOnExchange: mock(() => Promise.resolve(true)),
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.slReRegistered).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // No corrective actions taken
    expect(deps.reRegisterSl).not.toHaveBeenCalled();
    expect(deps.emergencyClose).not.toHaveBeenCalled();
    expect(deps.setSymbolStateIdle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Matched + missing SL → SL re-registered
// ---------------------------------------------------------------------------

describe("recoverFromCrash — matched, SL missing", () => {
  it("re-registers SL when matched position has no SL on exchange", async () => {
    const position = makePosition();
    const ticket = makeTicket();

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const reRegisterSlMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
      checkSlOnExchange: mock(() => Promise.resolve(false)),
      reRegisterSl: reRegisterSlMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(1);
    expect(result.slReRegistered).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(reRegisterSlMock).toHaveBeenCalledTimes(1);

    // Verify correct params passed to reRegisterSl
    const call = (reRegisterSlMock as ReturnType<typeof mock>).mock.calls[0] as [
      ExchangeAdapter,
      string,
      Exchange,
      TicketSnapshot,
    ];
    expect(call[1]).toBe("BTCUSDT");
    expect(call[2]).toBe("binance");
    expect(call[3].id).toBe("ticket-1");
  });

  it("multiple matched positions each missing SL → all re-registered", async () => {
    const btcPosition = makePosition({ symbol: "BTCUSDT" });
    const ethPosition = makePosition({ symbol: "ETHUSDT" });
    const btcTicket = makeTicket({ id: "t-btc", symbol: "BTCUSDT" });
    const ethTicket = makeTicket({ id: "t-eth", symbol: "ETHUSDT" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([btcPosition, ethPosition])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([btcTicket, ethTicket])),
      checkSlOnExchange: mock(() => Promise.resolve(false)),
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(2);
    expect(result.slReRegistered).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(deps.reRegisterSl).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Unmatched → emergencyClose called
// ---------------------------------------------------------------------------

describe("recoverFromCrash — unmatched positions", () => {
  it("calls emergencyClose for each unmatched position", async () => {
    const position = makePosition({ symbol: "ETHUSDT" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const emergencyCloseMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      // No tickets → position is unmatched
      getActiveTickets: mock(() => Promise.resolve([])),
      emergencyClose: emergencyCloseMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.unmatched).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(emergencyCloseMock).toHaveBeenCalledTimes(1);

    const callArg = (emergencyCloseMock as ReturnType<typeof mock>).mock
      .calls[0]![0] as EmergencyCloseParams;
    expect(callArg.symbol).toBe("ETHUSDT");
    expect(callArg.exchange).toBe("binance");
    expect(callArg.direction).toBe("LONG");
    expect(callArg.size.toString()).toBe("1.5");
    expect(typeof callArg.intentId).toBe("string");
  });

  it("multiple unmatched positions → emergencyClose called for each", async () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT" }),
      makePosition({ symbol: "ETHUSDT" }),
    ];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const emergencyCloseMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([])),
      emergencyClose: emergencyCloseMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.unmatched).toBe(2);
    expect(emergencyCloseMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Orphaned → setSymbolStateIdle called
// ---------------------------------------------------------------------------

describe("recoverFromCrash — orphaned tickets", () => {
  it("calls setSymbolStateIdle for each orphaned ticket", async () => {
    const ticket = makeTicket({ id: "orphan-1", symbol: "SOLUSDT", exchange: "binance" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const setIdleMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
      setSymbolStateIdle: setIdleMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.orphaned).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(setIdleMock).toHaveBeenCalledTimes(1);

    const call = (setIdleMock as ReturnType<typeof mock>).mock.calls[0] as [string, Exchange];
    expect(call[0]).toBe("SOLUSDT");
    expect(call[1]).toBe("binance");
  });
});

// ---------------------------------------------------------------------------
// Exchange API failure → skip, continue, error logged
// ---------------------------------------------------------------------------

describe("recoverFromCrash — exchange API failure", () => {
  it("tolerates exchange API failure, continues with other exchanges", async () => {
    const binanceAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.reject(new Error("API timeout"))),
    });

    const okxPosition = makePosition({ symbol: "ETHUSDT", exchange: "okx" });
    const okxTicket = makeTicket({ id: "t-okx", symbol: "ETHUSDT", exchange: "okx" });

    const okxAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([okxPosition])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([
        ["binance", binanceAdapter],
        ["okx", okxAdapter],
      ]),
      getActiveTickets: mock(() => Promise.resolve([okxTicket])),
    });

    const result = await recoverFromCrash(deps);

    // OKX position matched OK
    expect(result.matched).toBe(1);
    // Binance error recorded
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("binance");
    expect(result.errors[0]).toContain("fetchPositions failed");
    // Does not throw
  });

  it("all exchanges failing → unmatched DB tickets treated as orphans", async () => {
    const failingAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.reject(new Error("rate limit"))),
    });

    const ticket = makeTicket();

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", failingAdapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
    });

    const result = await recoverFromCrash(deps);

    expect(result.errors.length).toBeGreaterThan(0);
    // With no exchange positions, the ticket is orphaned
    expect(result.orphaned).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SL re-registration failure → error logged, continue
// ---------------------------------------------------------------------------

describe("recoverFromCrash — SL re-registration failure", () => {
  it("logs error and continues when reRegisterSl throws", async () => {
    const position = makePosition();
    const ticket = makeTicket();

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
      checkSlOnExchange: mock(() => Promise.resolve(false)),
      reRegisterSl: mock(() => Promise.reject(new Error("exchange rejected SL order"))),
    });

    // Should not throw
    const result = await recoverFromCrash(deps);

    expect(result.slReRegistered).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("SL re-registration failed"))).toBe(true);
  });

  it("checkSlOnExchange failure → error logged, continue (no crash)", async () => {
    const position = makePosition();
    const ticket = makeTicket();

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
      checkSlOnExchange: mock(() => Promise.reject(new Error("network error"))),
    });

    const result = await recoverFromCrash(deps);

    expect(result.errors.some((e) => e.includes("checkSlOnExchange failed"))).toBe(true);
    // reRegisterSl not called because checkSl already failed
    expect(deps.reRegisterSl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// emergencyClose failure → error logged, continue
// ---------------------------------------------------------------------------

describe("recoverFromCrash — emergencyClose failure", () => {
  it("logs error and continues when emergencyClose throws", async () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT" }),
      makePosition({ symbol: "ETHUSDT" }),
    ];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    let callCount = 0;
    const emergencyCloseMock = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("exchange down"));
      }
      return Promise.resolve();
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([])),
      emergencyClose: emergencyCloseMock,
    });

    const result = await recoverFromCrash(deps);

    // Both attempted; first failed
    expect(emergencyCloseMock).toHaveBeenCalledTimes(2);
    expect(result.errors.some((e) => e.includes("emergencyClose failed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setSymbolStateIdle failure → error logged, continue
// ---------------------------------------------------------------------------

describe("recoverFromCrash — setSymbolStateIdle failure", () => {
  it("logs error and continues when setSymbolStateIdle throws", async () => {
    const ticket = makeTicket({ id: "orphan-1", symbol: "SOLUSDT" });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([ticket])),
      setSymbolStateIdle: mock(() => Promise.reject(new Error("db error"))),
    });

    const result = await recoverFromCrash(deps);

    expect(result.errors.some((e) => e.includes("setSymbolStateIdle failed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty state → clean result
// ---------------------------------------------------------------------------

describe("recoverFromCrash — empty state", () => {
  it("returns clean result when no positions and no tickets", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve([])),
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
    expect(result.orphaned).toBe(0);
    expect(result.slReRegistered).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("no adapters → empty result, no errors", async () => {
    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>(),
      getActiveTickets: mock(() => Promise.resolve([])),
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EventLog + Slack recorded
// ---------------------------------------------------------------------------

describe("recoverFromCrash — EventLog and Slack", () => {
  it("insertEvent is called with CRASH_RECOVERY type", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const insertEventMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      insertEvent: insertEventMock,
    });

    await recoverFromCrash(deps);

    expect(insertEventMock).toHaveBeenCalledTimes(1);

    const call = (insertEventMock as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(call[0]).toBe("CRASH_RECOVERY");
    expect(typeof call[1].matched).toBe("number");
    expect(typeof call[1].unmatched).toBe("number");
    expect(typeof call[1].orphaned).toBe("number");
    expect(typeof call[1].slReRegistered).toBe("number");
    expect(typeof call[1].durationMs).toBe("number");
  });

  it("sendSlackAlert is called with result summary", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const sendSlackMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      sendSlackAlert: sendSlackMock,
    });

    await recoverFromCrash(deps);

    expect(sendSlackMock).toHaveBeenCalledTimes(1);

    const callArg = (sendSlackMock as ReturnType<typeof mock>).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(typeof callArg.matched).toBe("number");
    expect(typeof callArg.unmatched).toBe("number");
  });

  it("insertEvent failure does not propagate or affect result", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      insertEvent: mock(() => Promise.reject(new Error("db down"))),
    });

    // Should not throw
    const result = await recoverFromCrash(deps);

    // insertEvent failure is NOT added to errors (non-critical logging failure)
    expect(result).toBeDefined();
  });

  it("sendSlackAlert failure is fire-and-forget — never propagates", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      sendSlackAlert: mock(() => Promise.reject(new Error("slack down"))),
    });

    // Should not throw
    const result = await recoverFromCrash(deps);

    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// restoreLossCounters
// ---------------------------------------------------------------------------

describe("recoverFromCrash — restoreLossCounters", () => {
  it("restoreLossCounters is called once", async () => {
    const restoreMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      restoreLossCounters: restoreMock,
    });

    await recoverFromCrash(deps);

    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it("restoreLossCounters failure → error recorded, recovery continues", async () => {
    const deps = createMockDeps({
      restoreLossCounters: mock(() => Promise.reject(new Error("counter restore failed"))),
    });

    const result = await recoverFromCrash(deps);

    expect(result.errors.some((e) => e.includes("restoreLossCounters failed"))).toBe(true);
    // insertEvent and sendSlackAlert should still be called
    expect(deps.insertEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendSlackAlert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed scenario — all categories in one run
// ---------------------------------------------------------------------------

describe("recoverFromCrash — mixed scenario", () => {
  it("handles matched + unmatched + orphaned in same run", async () => {
    // BTC: matched, SL present
    // ETH: unmatched (no ticket)
    // SOL: orphaned (no position)
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

    const emergencyCloseMock = mock(() => Promise.resolve());
    const setIdleMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
      getActiveTickets: mock(() => Promise.resolve(tickets)),
      checkSlOnExchange: mock(() => Promise.resolve(true)), // SL present for BTC
      emergencyClose: emergencyCloseMock,
      setSymbolStateIdle: setIdleMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(1);
    expect(result.orphaned).toBe(1);
    expect(result.slReRegistered).toBe(0);
    expect(result.errors).toHaveLength(0);

    // emergencyClose for ETHUSDT
    expect(emergencyCloseMock).toHaveBeenCalledTimes(1);
    const ecCall = (emergencyCloseMock as ReturnType<typeof mock>).mock
      .calls[0]![0] as EmergencyCloseParams;
    expect(ecCall.symbol).toBe("ETHUSDT");

    // setSymbolStateIdle for SOLUSDT
    expect(setIdleMock).toHaveBeenCalledTimes(1);
    const idleCall = (setIdleMock as ReturnType<typeof mock>).mock.calls[0] as [string, Exchange];
    expect(idleCall[0]).toBe("SOLUSDT");
  });

  it("multi-exchange: binance+okx matched, each missing SL → both re-registered", async () => {
    const btcPosition = makePosition({ symbol: "BTCUSDT", exchange: "binance" });
    const ethPosition = makePosition({ symbol: "ETHUSDT", exchange: "okx" });
    const btcTicket = makeTicket({ id: "t-btc", symbol: "BTCUSDT", exchange: "binance" });
    const ethTicket = makeTicket({ id: "t-eth", symbol: "ETHUSDT", exchange: "okx", direction: "LONG" });

    const binanceAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([btcPosition])),
    });
    const okxAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([ethPosition])),
    });

    const reRegisterSlMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([
        ["binance", binanceAdapter],
        ["okx", okxAdapter],
      ]),
      getActiveTickets: mock(() => Promise.resolve([btcTicket, ethTicket])),
      checkSlOnExchange: mock(() => Promise.resolve(false)), // Both missing SL
      reRegisterSl: reRegisterSlMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(2);
    expect(result.slReRegistered).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(reRegisterSlMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Result shape validation
// ---------------------------------------------------------------------------

describe("recoverFromCrash — result shape", () => {
  it("result includes durationMs as non-negative number", async () => {
    const deps = createMockDeps();

    const result = await recoverFromCrash(deps);

    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("result.errors is an array of strings", async () => {
    const deps = createMockDeps({
      adapters: new Map<Exchange, ExchangeAdapter>([
        ["binance", createMockAdapter({
          fetchPositions: mock(() => Promise.reject(new Error("boom"))),
        })],
      ]),
    });

    const result = await recoverFromCrash(deps);

    expect(Array.isArray(result.errors)).toBe(true);
    for (const err of result.errors) {
      expect(typeof err).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// WatchSession recovery — bias match + age validation
// ---------------------------------------------------------------------------

describe("recoverFromCrash — WatchSession recovery", () => {
  it("2 valid sessions (LONG+LONG_ONLY, SHORT+SHORT_ONLY) → restored=2, invalidated=0", async () => {
    const longSession = makeWatchSession({
      id: "ws-long",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
      detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    });
    const shortSession = makeWatchSession({
      id: "ws-short",
      symbol: "ETHUSDT",
      exchange: "binance",
      direction: "SHORT",
      detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    });

    const getSymbolDailyBiasMock = mock((symbol: string) => {
      if (symbol === "BTCUSDT") return Promise.resolve("LONG_ONLY" as DailyBias);
      if (symbol === "ETHUSDT") return Promise.resolve("SHORT_ONLY" as DailyBias);
      return Promise.resolve(null);
    });

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([longSession, shortSession])),
      getSymbolDailyBias: getSymbolDailyBiasMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.watchSessionsRestored).toBe(2);
    expect(result.watchSessionsInvalidated).toBe(0);
    expect(deps.invalidateWatchSession).not.toHaveBeenCalled();
  });

  it("1 valid (LONG+LONG_ONLY, 2h ago) + 1 invalid (LONG+SHORT_ONLY) → restored=1, invalidated=1", async () => {
    const validSession = makeWatchSession({
      id: "ws-valid",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
      detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const invalidSession = makeWatchSession({
      id: "ws-invalid",
      symbol: "ETHUSDT",
      exchange: "binance",
      direction: "LONG",
      detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const getSymbolDailyBiasMock = mock((symbol: string) => {
      if (symbol === "BTCUSDT") return Promise.resolve("LONG_ONLY" as DailyBias);
      if (symbol === "ETHUSDT") return Promise.resolve("SHORT_ONLY" as DailyBias); // mismatch
      return Promise.resolve(null);
    });

    const invalidateMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([validSession, invalidSession])),
      getSymbolDailyBias: getSymbolDailyBiasMock,
      invalidateWatchSession: invalidateMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.watchSessionsRestored).toBe(1);
    expect(result.watchSessionsInvalidated).toBe(1);
    expect(invalidateMock).toHaveBeenCalledTimes(1);

    const call = (invalidateMock as ReturnType<typeof mock>).mock.calls[0] as [string, string];
    expect(call[0]).toBe("ws-invalid");
    expect(call[1]).toBe("crash_recovery_stale");
  });

  it("no active sessions → restored=0, invalidated=0", async () => {
    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([])),
    });

    const result = await recoverFromCrash(deps);

    expect(result.watchSessionsRestored).toBe(0);
    expect(result.watchSessionsInvalidated).toBe(0);
    expect(deps.invalidateWatchSession).not.toHaveBeenCalled();
  });

  it("session older than 24h → invalidated regardless of bias match", async () => {
    const staleSession = makeWatchSession({
      id: "ws-stale",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
      detected_at: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
    });

    const invalidateMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([staleSession])),
      getSymbolDailyBias: mock(() => Promise.resolve("LONG_ONLY" as DailyBias)), // bias matches, but stale
      invalidateWatchSession: invalidateMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.watchSessionsRestored).toBe(0);
    expect(result.watchSessionsInvalidated).toBe(1);
    expect(invalidateMock).toHaveBeenCalledWith("ws-stale", "crash_recovery_stale");
  });

  it("session with null daily_bias → invalidated (conservative)", async () => {
    const session = makeWatchSession({
      id: "ws-null-bias",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
    });

    const invalidateMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([session])),
      getSymbolDailyBias: mock(() => Promise.resolve(null)),
      invalidateWatchSession: invalidateMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.watchSessionsRestored).toBe(0);
    expect(result.watchSessionsInvalidated).toBe(1);
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("session with NEUTRAL daily_bias → invalidated (conservative)", async () => {
    const session = makeWatchSession({
      id: "ws-neutral",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
    });

    const invalidateMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([session])),
      getSymbolDailyBias: mock(() => Promise.resolve("NEUTRAL" as DailyBias)),
      invalidateWatchSession: invalidateMock,
    });

    const result = await recoverFromCrash(deps);

    expect(result.watchSessionsRestored).toBe(0);
    expect(result.watchSessionsInvalidated).toBe(1);
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("EventLog: WATCH_SESSION_RESTORED and WATCH_SESSION_INVALIDATED_CRASH events emitted", async () => {
    const validSession = makeWatchSession({
      id: "ws-valid",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
    });
    const invalidSession = makeWatchSession({
      id: "ws-invalid",
      symbol: "ETHUSDT",
      exchange: "binance",
      direction: "LONG",
    });

    const getSymbolDailyBiasMock = mock((symbol: string) => {
      if (symbol === "BTCUSDT") return Promise.resolve("LONG_ONLY" as DailyBias);
      return Promise.resolve("SHORT_ONLY" as DailyBias);
    });

    const insertEventMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([validSession, invalidSession])),
      getSymbolDailyBias: getSymbolDailyBiasMock,
      insertEvent: insertEventMock,
    });

    await recoverFromCrash(deps);

    const calls = (insertEventMock as ReturnType<typeof mock>).mock.calls as [string, Record<string, unknown>][];
    const eventTypes = calls.map((c) => c[0]);

    expect(eventTypes).toContain("WATCH_SESSION_RESTORED");
    expect(eventTypes).toContain("WATCH_SESSION_INVALIDATED_CRASH");
    // Also includes the final CRASH_RECOVERY event
    expect(eventTypes).toContain("CRASH_RECOVERY");
  });

  it("getActiveWatchSessions failure → error recorded, recovery continues", async () => {
    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.reject(new Error("db timeout"))),
    });

    const result = await recoverFromCrash(deps);

    expect(result.errors.some((e) => e.includes("getActiveWatchSessions failed"))).toBe(true);
    expect(result.watchSessionsRestored).toBe(0);
    expect(result.watchSessionsInvalidated).toBe(0);
  });

  it("invalidateWatchSession failure → error recorded, processing continues to next session", async () => {
    const session1 = makeWatchSession({ id: "ws-1", symbol: "BTCUSDT", direction: "LONG" });
    const session2 = makeWatchSession({ id: "ws-2", symbol: "ETHUSDT", direction: "LONG" });

    const invalidateMock = mock((id: string) => {
      if (id === "ws-1") return Promise.reject(new Error("db error"));
      return Promise.resolve();
    });

    const deps = createMockDeps({
      getActiveWatchSessions: mock(() => Promise.resolve([session1, session2])),
      getSymbolDailyBias: mock(() => Promise.resolve("SHORT_ONLY" as DailyBias)), // both mismatch → invalidate
      invalidateWatchSession: invalidateMock,
    });

    const result = await recoverFromCrash(deps);

    // Both sessions processed as invalid
    expect(result.watchSessionsInvalidated).toBe(2);
    // First one failed, so error recorded
    expect(result.errors.some((e) => e.includes("invalidateWatchSession failed"))).toBe(true);
    // Second one succeeded
    expect(invalidateMock).toHaveBeenCalledTimes(2);
  });

  it("result includes watchSessionsRestored and watchSessionsInvalidated counters", async () => {
    const deps = createMockDeps();

    const result = await recoverFromCrash(deps);

    expect(typeof result.watchSessionsRestored).toBe("number");
    expect(typeof result.watchSessionsInvalidated).toBe("number");
  });
});
