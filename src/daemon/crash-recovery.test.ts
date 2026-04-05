/**
 * T-19-008: crash-recovery.ts — FSM state restore 테스트
 *
 * Test Scenarios:
 * - crashRecovery() with matched position → setFsmState("HAS_POSITION") called for that symbol
 * - crashRecovery() with multiple matched positions → setFsmState called for each
 * - crashRecovery() with setFsmState failing → error added to errors, no crash
 * - crashRecovery() with SL re-registration → setFsmState also called regardless
 */

import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Exchange } from "@/core/types";
import type { TicketSnapshot } from "@/reconciliation/comparator";
import type { CrashRecoveryDeps } from "./crash-recovery";
import { recoverFromCrash } from "./crash-recovery";

// ---------------------------------------------------------------------------
// Factory helpers (matching exact types from core/ports and core/types)
// ---------------------------------------------------------------------------

function makeAdapter(): ExchangeAdapter {
  return {
    fetchOHLCV: async () => [],
    fetchBalance: async () => ({ total: new Decimal("10000"), available: new Decimal("10000") }),
    fetchPositions: async () => [],
    createOrder: async () => ({
      orderId: "o1",
      exchangeOrderId: "eo1",
      status: "FILLED" as const,
      filledPrice: new Decimal("100"),
      filledSize: new Decimal("0.1"),
      timestamp: new Date(),
    }),
    cancelOrder: async () => {},
    editOrder: async () => ({
      orderId: "o1",
      exchangeOrderId: "eo1",
      status: "FILLED" as const,
      filledPrice: new Decimal("100"),
      filledSize: new Decimal("0.1"),
      timestamp: new Date(),
    }),
    fetchOrder: async () => ({
      orderId: "o1",
      exchangeOrderId: "eo1",
      status: "FILLED" as const,
      filledPrice: new Decimal("100"),
      filledSize: new Decimal("0.1"),
      timestamp: new Date(),
    }),
    watchOHLCV: async () => () => {},
    getExchangeInfo: async () => ({
      symbol: "BTC/USDT",
      tickSize: new Decimal("0.01"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 20,
      contractSize: new Decimal("1"),
    }),
    setLeverage: async () => {},
    transfer: async () => ({ id: "t1", status: "ok" }),
  };
}

function makePosition(overrides?: Partial<ExchangePosition>): ExchangePosition {
  return {
    symbol: "BTC/USDT",
    exchange: "binance" as Exchange,
    side: "LONG",
    size: new Decimal("0.1"),
    entryPrice: new Decimal("100"),
    unrealizedPnl: new Decimal("0"),
    leverage: 10,
    liquidationPrice: null,
    ...overrides,
  };
}

function makeTicket(overrides?: Partial<TicketSnapshot>): TicketSnapshot {
  return {
    id: "ticket-1",
    symbol: "BTC/USDT",
    exchange: "binance" as Exchange,
    direction: "LONG",
    state: "INITIAL",
    created_at: new Date("2020-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeBaseDeps(overrides?: Partial<CrashRecoveryDeps>): CrashRecoveryDeps {
  return {
    adapters: new Map([["binance" as Exchange, makeAdapter()]]),
    getActiveTickets: async () => [],
    getPendingSymbols: async () => new Set<string>(),
    comparePositions: () => ({ matched: [], unmatched: [], orphaned: [], excluded: [] }),
    emergencyClose: async () => {},
    setSymbolStateIdle: async () => {},
    checkSlOnExchange: async () => true, // SL exists — no re-registration needed
    reRegisterSl: async () => {},
    restoreLossCounters: async () => {},
    insertEvent: async () => {},
    getActiveWatchSessions: async () => [],
    getSymbolDailyBias: async () => null,
    invalidateWatchSession: async () => {},
    sendSlackAlert: async () => {},
    setFsmState: async () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T-19-008: recoverFromCrash — FSM state restore", () => {
  it("matched position → setFsmState called with HAS_POSITION for that symbol", async () => {
    const fsmStateCalls: Array<{ symbol: string; exchange: string; state: string }> = [];
    const position = makePosition();
    const ticket = makeTicket();

    const deps = makeBaseDeps({
      comparePositions: () => ({
        matched: [{ position, ticket }],
        unmatched: [],
        orphaned: [],
        excluded: [],
      }),
      setFsmState: async (symbol, exchange, state) => {
        fsmStateCalls.push({ symbol, exchange, state });
      },
    });

    const result = await recoverFromCrash(deps);

    expect(result.matched).toBe(1);
    expect(result.errors).toHaveLength(0);

    // setFsmState must have been called with HAS_POSITION
    expect(fsmStateCalls.length).toBe(1);
    expect(fsmStateCalls[0]?.symbol).toBe("BTC/USDT");
    expect(fsmStateCalls[0]?.exchange).toBe("binance");
    expect(fsmStateCalls[0]?.state).toBe("HAS_POSITION");
  });

  it("multiple matched positions → setFsmState called for each", async () => {
    const fsmStateCalls: Array<{ symbol: string }> = [];

    const pos1 = makePosition({ symbol: "BTC/USDT" });
    const pos2 = makePosition({ symbol: "ETH/USDT" });
    const ticket1 = makeTicket({ symbol: "BTC/USDT" });
    const ticket2 = makeTicket({ symbol: "ETH/USDT", id: "ticket-2" });

    const deps = makeBaseDeps({
      comparePositions: () => ({
        matched: [
          { position: pos1, ticket: ticket1 },
          { position: pos2, ticket: ticket2 },
        ],
        unmatched: [],
        orphaned: [],
        excluded: [],
      }),
      setFsmState: async (symbol) => {
        fsmStateCalls.push({ symbol });
      },
    });

    await recoverFromCrash(deps);

    expect(fsmStateCalls.length).toBe(2);
    const symbols = fsmStateCalls.map((c) => c.symbol);
    expect(symbols).toContain("BTC/USDT");
    expect(symbols).toContain("ETH/USDT");
  });

  it("setFsmState fails → error added to result.errors, recovery continues without crash", async () => {
    const position = makePosition();
    const ticket = makeTicket();

    const deps = makeBaseDeps({
      comparePositions: () => ({
        matched: [{ position, ticket }],
        unmatched: [],
        orphaned: [],
        excluded: [],
      }),
      setFsmState: async () => {
        throw new Error("DB connection lost");
      },
    });

    const result = await recoverFromCrash(deps);

    // Error must be captured — not thrown
    expect(result.errors.length).toBeGreaterThan(0);
    const fsmError = result.errors.find(
      (e) => e.includes("HAS_POSITION") || e.includes("setFsmState"),
    );
    expect(fsmError).toBeDefined();

    // Recovery must not have crashed (result is returned normally)
    expect(result.matched).toBe(1);
  });

  it("setFsmState called regardless of whether SL was re-registered", async () => {
    const fsmStateCalls: Array<{ symbol: string; state: string }> = [];
    let slReRegistered = false;
    const position = makePosition();
    const ticket = makeTicket();

    const deps = makeBaseDeps({
      comparePositions: () => ({
        matched: [{ position, ticket }],
        unmatched: [],
        orphaned: [],
        excluded: [],
      }),
      checkSlOnExchange: async () => false, // SL missing → triggers re-registration
      reRegisterSl: async () => {
        slReRegistered = true;
      },
      setFsmState: async (symbol, _exchange, state) => {
        fsmStateCalls.push({ symbol, state });
      },
    });

    const result = await recoverFromCrash(deps);

    expect(slReRegistered).toBe(true);
    expect(result.slReRegistered).toBe(1);

    // setFsmState must also be called regardless of SL re-registration
    expect(fsmStateCalls.length).toBe(1);
    expect(fsmStateCalls[0]?.state).toBe("HAS_POSITION");
  });
});
