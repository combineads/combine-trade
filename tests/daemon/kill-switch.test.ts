/**
 * Tests for scripts/kill-switch.ts
 *
 * All external side-effects are injected via KillSwitchDeps so no DB or
 * real exchange adapters are needed.
 */

import { describe, expect, it, mock } from "bun:test";

import { d } from "@/core/decimal";
import type { ExchangeAdapter, ExchangePosition } from "@/core/ports";
import type { Direction, Exchange } from "@/core/types";
import type { EmergencyCloseParams } from "@/orders/executor";
import {
  killSwitch,
  type KillSwitchDeps,
  type OpenOrder,
} from "../../scripts/kill-switch";

// ---------------------------------------------------------------------------
// Helpers — factory functions
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

function createMockAdapter(
  overrides: Partial<ExchangeAdapter> = {},
): ExchangeAdapter {
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
    transfer: mock(() => Promise.resolve({ id: "mock-transfer-id", status: "ok" })),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<KillSwitchDeps> = {}): KillSwitchDeps {
  return {
    adapters: new Map(),
    emergencyClose: mock(() => Promise.resolve()),
    getOpenOrders: mock(() => Promise.resolve([] as OpenOrder[])),
    cancelOrder: mock(() => Promise.resolve()),
    updateAllExecutionMode: mock(() => Promise.resolve(0)),
    insertKillSwitchEvent: mock(() => Promise.resolve()),
    sendAlert: mock(() => Promise.resolve()),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("killSwitch", () => {
  // ---- 2 exchanges × 1 position → 2 emergencyClose calls ----

  it("2 exchanges × 1 position → emergencyClose called twice", async () => {
    const binanceAdapter = createMockAdapter({
      fetchPositions: mock(() =>
        Promise.resolve([makePosition({ exchange: "binance", symbol: "BTCUSDT" })]),
      ),
    });
    const okxAdapter = createMockAdapter({
      fetchPositions: mock(() =>
        Promise.resolve([makePosition({ exchange: "okx", symbol: "ETHUSDT" })]),
      ),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([
      ["binance", binanceAdapter],
      ["okx", okxAdapter],
    ]);

    const emergencyCloseMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters,
      emergencyClose: emergencyCloseMock,
    });

    const result = await killSwitch(deps);

    expect(emergencyCloseMock).toHaveBeenCalledTimes(2);
    expect(result.positionsClosed).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.exchangesFailed).toHaveLength(0);
  });

  // ---- No positions → just cancel orders + mode switch ----

  it("no positions → skips emergencyClose, proceeds to cancel orders and mode update", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const emergencyCloseMock = mock(() => Promise.resolve());
    const cancelOrderMock = mock(() => Promise.resolve());
    const updateModeMock = mock(() => Promise.resolve(3));
    const openOrders: OpenOrder[] = [
      { exchangeOrderId: "order-1", symbol: "BTCUSDT", exchange: "binance" },
      { exchangeOrderId: "order-2", symbol: "ETHUSDT", exchange: "binance" },
    ];

    const deps = createMockDeps({
      adapters,
      emergencyClose: emergencyCloseMock,
      getOpenOrders: mock(() => Promise.resolve(openOrders)),
      cancelOrder: cancelOrderMock,
      updateAllExecutionMode: updateModeMock,
    });

    const result = await killSwitch(deps);

    expect(emergencyCloseMock).not.toHaveBeenCalled();
    expect(result.positionsClosed).toBe(0);
    expect(cancelOrderMock).toHaveBeenCalledTimes(2);
    expect(result.ordersCancelled).toBe(2);
    expect(updateModeMock).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(0);
  });

  // ---- Exchange A fails → continue to Exchange B ----

  it("exchange A fetchPositions fails → continues to exchange B", async () => {
    const failingAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.reject(new Error("connection timeout"))),
    });
    const workingAdapter = createMockAdapter({
      fetchPositions: mock(() =>
        Promise.resolve([makePosition({ exchange: "okx", symbol: "BTCUSDT" })]),
      ),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([
      ["binance", failingAdapter],
      ["okx", workingAdapter],
    ]);

    const emergencyCloseMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      adapters,
      emergencyClose: emergencyCloseMock,
    });

    const result = await killSwitch(deps);

    // Exchange A failed — only 1 position closed from Exchange B
    expect(result.positionsClosed).toBe(1);
    expect(result.exchangesFailed).toContain("binance");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("binance");
    expect(result.errors[0]).toContain("fetchPositions failed");

    // Exchange B was still processed
    expect(emergencyCloseMock).toHaveBeenCalledTimes(1);
  });

  // ---- emergencyClose fails for one position → log and continue ----

  it("emergencyClose fails for one position → logs error, continues to next position", async () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT" }),
      makePosition({ symbol: "ETHUSDT" }),
    ];

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve(positions)),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    let callCount = 0;
    const emergencyCloseMock = mock((_params: EmergencyCloseParams) => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("order rejected"));
      }
      return Promise.resolve();
    });

    const deps = createMockDeps({
      adapters,
      emergencyClose: emergencyCloseMock,
    });

    const result = await killSwitch(deps);

    // Both positions attempted; first failed, second succeeded
    expect(emergencyCloseMock).toHaveBeenCalledTimes(2);
    expect(result.positionsClosed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("emergencyClose failed");
  });

  // ---- SymbolState execution_mode updated to 'analysis' ----

  it("updateAllExecutionMode is always called", async () => {
    const updateModeMock = mock(() => Promise.resolve(5));

    const deps = createMockDeps({
      updateAllExecutionMode: updateModeMock,
    });

    await killSwitch(deps);

    expect(updateModeMock).toHaveBeenCalledTimes(1);
  });

  // ---- Slack alert sent ----

  it("sendAlert is called with KILL SWITCH ACTIVATED message", async () => {
    const sendAlertMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      sendAlert: sendAlertMock,
    });

    await killSwitch(deps);

    expect(sendAlertMock).toHaveBeenCalledTimes(1);
    const callArg = (sendAlertMock as ReturnType<typeof mock>).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArg?.event).toContain("KILL SWITCH ACTIVATED");
  });

  // ---- EventLog KILL_SWITCH recorded ----

  it("insertKillSwitchEvent is called with KILL_SWITCH data", async () => {
    const insertMock = mock(() => Promise.resolve());

    const deps = createMockDeps({
      insertKillSwitchEvent: insertMock,
    });

    await killSwitch(deps);

    expect(insertMock).toHaveBeenCalledTimes(1);
    const callArg = (insertMock as ReturnType<typeof mock>).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArg).toBeDefined();
    expect(typeof callArg?.positionsClosed).toBe("number");
    expect(typeof callArg?.ordersCancelled).toBe("number");
  });

  // ---- Full success → no errors, exit code 0 condition ----

  it("full success → result.errors empty, exchangesFailed empty", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() =>
        Promise.resolve([makePosition({ exchange: "binance", symbol: "BTCUSDT" })]),
      ),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const deps = createMockDeps({ adapters });

    const result = await killSwitch(deps);

    expect(result.errors).toHaveLength(0);
    expect(result.exchangesFailed).toHaveLength(0);
    expect(result.positionsClosed).toBe(1);
  });

  // ---- Partial failure → result.errors non-empty ----

  it("partial failure → result.errors non-empty", async () => {
    const failingAdapter = createMockAdapter({
      fetchPositions: mock(() => Promise.reject(new Error("rate limit"))),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", failingAdapter]]);

    const deps = createMockDeps({ adapters });

    const result = await killSwitch(deps);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.exchangesFailed).toContain("binance");
  });

  // ---- cancelOrder failure → logged but does not abort ----

  it("cancelOrder failure → error logged, other orders still cancelled", async () => {
    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([])),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const openOrders: OpenOrder[] = [
      { exchangeOrderId: "order-1", symbol: "BTCUSDT", exchange: "binance" },
      { exchangeOrderId: "order-2", symbol: "ETHUSDT", exchange: "binance" },
    ];

    let cancelCount = 0;
    const cancelOrderMock = mock((_adapter: ExchangeAdapter, _orderId: string, _symbol: string) => {
      cancelCount++;
      if (cancelCount === 1) {
        return Promise.reject(new Error("cancel rejected"));
      }
      return Promise.resolve();
    });

    const deps = createMockDeps({
      adapters,
      getOpenOrders: mock(() => Promise.resolve(openOrders)),
      cancelOrder: cancelOrderMock,
    });

    const result = await killSwitch(deps);

    expect(cancelOrderMock).toHaveBeenCalledTimes(2);
    expect(result.ordersCancelled).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("cancelOrder");
  });

  // ---- emergencyClose receives correct params ----

  it("emergencyClose is called with correct symbol, exchange, size, direction, and intentId", async () => {
    const position = makePosition({
      exchange: "binance",
      symbol: "BTCUSDT",
      side: "SHORT" as Direction,
      size: d("2.5"),
    });

    const adapter = createMockAdapter({
      fetchPositions: mock(() => Promise.resolve([position])),
    });

    const adapters = new Map<Exchange, ExchangeAdapter>([["binance", adapter]]);

    const capturedParams: EmergencyCloseParams[] = [];
    const emergencyCloseMock = mock((params: EmergencyCloseParams) => {
      capturedParams.push(params);
      return Promise.resolve();
    });

    const deps = createMockDeps({
      adapters,
      emergencyClose: emergencyCloseMock,
    });

    await killSwitch(deps);

    expect(capturedParams).toHaveLength(1);
    const p = capturedParams[0]!;
    expect(p.symbol).toBe("BTCUSDT");
    expect(p.exchange).toBe("binance");
    expect(p.direction).toBe("SHORT");
    expect(p.size.toString()).toBe("2.5");
    expect(typeof p.intentId).toBe("string");
    expect(p.intentId.length).toBeGreaterThan(0);
  });

  // ---- sendAlert is fire-and-forget — never throws ----

  it("sendAlert throwing does not bubble up to caller", async () => {
    const deps = createMockDeps({
      sendAlert: mock(() => Promise.reject(new Error("slack down"))),
    });

    // Should not throw
    const result = await killSwitch(deps);
    expect(result).toBeDefined();
  });

  // ---- getOpenOrders failure → graceful degradation ----

  it("getOpenOrders failure → error recorded, sequence continues", async () => {
    const deps = createMockDeps({
      getOpenOrders: mock(() => Promise.reject(new Error("db connection lost"))),
    });

    const result = await killSwitch(deps);

    expect(result.errors.some((e) => e.includes("getOpenOrders failed"))).toBe(true);
    // updateAllExecutionMode and insertKillSwitchEvent still called
    expect(deps.updateAllExecutionMode).toHaveBeenCalledTimes(1);
    expect(deps.insertKillSwitchEvent).toHaveBeenCalledTimes(1);
  });
});
