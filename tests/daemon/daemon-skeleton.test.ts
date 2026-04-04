/**
 * Tests for daemon skeleton — startDaemon() startup sequence and lifecycle.
 *
 * Strategy: inject mocks for all external dependencies via DaemonDeps so no
 * real DB / WebSocket connections are made.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DaemonDeps, DaemonHandle } from "../../src/daemon";
import { startDaemon } from "../../src/daemon";
import type { CandleCloseCallback } from "../../src/candles/types";
import type { ReconciliationDeps, ReconciliationHandle } from "../../src/reconciliation/worker";
import type { ExchangeAdapter } from "../../src/core/ports";
import type { Exchange } from "../../src/core/types";

// ---------------------------------------------------------------------------
// Call-order tracking helper
// ---------------------------------------------------------------------------

function makeCallTracker() {
  const calls: string[] = [];
  return {
    calls,
    record(name: string) {
      return () => {
        calls.push(name);
      };
    },
    recordAsync(name: string) {
      return async () => {
        calls.push(name);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock adapter factory (minimal — only needs to satisfy ExchangeAdapter shape)
// ---------------------------------------------------------------------------

function createMockAdapter(): ExchangeAdapter {
  return {
    fetchOHLCV: mock(async () => []),
    fetchBalance: mock(async () => ({ total: { toFixed: () => "0" } as never, available: { toFixed: () => "0" } as never })),
    fetchPositions: mock(async () => []),
    createOrder: mock(async () => ({ orderId: "", exchangeOrderId: "", status: "FILLED" as const, filledPrice: null, filledSize: null, timestamp: new Date() })),
    cancelOrder: mock(async () => {}),
    editOrder: mock(async () => ({ orderId: "", exchangeOrderId: "", status: "FILLED" as const, filledPrice: null, filledSize: null, timestamp: new Date() })),
    fetchOrder: mock(async () => ({ orderId: "", exchangeOrderId: "", status: "FILLED" as const, filledPrice: null, filledSize: null, timestamp: new Date() })),
    watchOHLCV: mock(async () => () => {}),
    getExchangeInfo: mock(async () => ({ symbol: "", tickSize: {} as never, minOrderSize: {} as never, maxLeverage: 125, contractSize: {} as never })),
    setLeverage: mock(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// Mock reconciliation deps factory
// ---------------------------------------------------------------------------

function createMockReconciliationDeps(): ReconciliationDeps {
  return {
    getActiveTickets: mock(async () => []),
    getPendingSymbols: mock(async () => new Set<string>()),
    emergencyClose: mock(async () => {}),
    setSymbolStateIdle: mock(async () => {}),
    insertEvent: mock(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// Mock CandleManager factory
// ---------------------------------------------------------------------------

function createMockCandleManager() {
  let closeCallback: CandleCloseCallback | null = null;
  return {
    start: mock(async () => {}),
    stop: mock(async () => {}),
    onCandleClose: mock((cb: CandleCloseCallback) => {
      closeCallback = cb;
      return () => {};
    }),
    getStatus: mock(() => ({
      syncCompleted: true,
      collecting: true,
      activeSubscriptions: 0,
      lastReceivedAt: null,
      lastGapRecovery: null,
    })),
    _getCloseCallback: () => closeCallback,
  };
}

// ---------------------------------------------------------------------------
// Build DaemonDeps from mocks
// ---------------------------------------------------------------------------

function buildDeps(overrides?: Partial<DaemonDeps>): {
  deps: DaemonDeps;
  candleManager: ReturnType<typeof createMockCandleManager>;
  reconciliationDeps: ReconciliationDeps;
  reconciliationHandle: ReconciliationHandle;
  initDb: ReturnType<typeof mock>;
  loadAllConfig: ReturnType<typeof mock>;
  startReconciliation: ReturnType<typeof mock>;
} {
  const candleManager = createMockCandleManager();
  const reconciliationDeps = createMockReconciliationDeps();
  const reconciliationHandle: ReconciliationHandle = { stop: mock(() => {}) };
  const startReconciliationFn = mock(() => reconciliationHandle);
  const initDb = mock(async () => {});
  const loadAllConfig = mock(async () => {});

  const adapters = new Map<Exchange, ExchangeAdapter>([
    ["binance", createMockAdapter()],
  ]);

  const deps: DaemonDeps = {
    candleManager,
    adapters,
    reconciliationDeps,
    candleManagerConfig: {
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      adapter: createMockAdapter(),
    },
    initDb,
    loadAllConfig,
    startReconciliation: startReconciliationFn,
    ...overrides,
  };

  return {
    deps,
    candleManager,
    reconciliationDeps,
    reconciliationHandle,
    initDb,
    loadAllConfig,
    startReconciliation: startReconciliationFn,
  };
}

// ---------------------------------------------------------------------------
// Cleanup: ensure SIGTERM/SIGINT listeners added during tests are removed
// ---------------------------------------------------------------------------

// Collect handles to stop after each test to prevent listener leaks
const handlesToStop: DaemonHandle[] = [];

afterEach(async () => {
  for (const h of handlesToStop) {
    await h.stop().catch(() => {});
  }
  handlesToStop.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startDaemon", () => {
  describe("startup sequence", () => {
    it("calls initDb before loadAllConfig", async () => {
      const order: string[] = [];
      const tracker = makeCallTracker();
      const { deps } = buildDeps({
        initDb: mock(async () => { order.push("initDb"); }),
        loadAllConfig: mock(async () => { order.push("loadAllConfig"); }),
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(order.indexOf("initDb")).toBeLessThan(order.indexOf("loadAllConfig"));
    });

    it("calls loadAllConfig before CandleManager.start", async () => {
      const order: string[] = [];
      const candleManager = createMockCandleManager();
      (candleManager.start as ReturnType<typeof mock>) = mock(async () => { order.push("candleManager.start"); });

      const { deps } = buildDeps({
        candleManager,
        loadAllConfig: mock(async () => { order.push("loadAllConfig"); }),
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(order.indexOf("loadAllConfig")).toBeLessThan(order.indexOf("candleManager.start"));
    });

    it("calls CandleManager.start before startReconciliation", async () => {
      const order: string[] = [];
      const candleManager = createMockCandleManager();
      (candleManager.start as ReturnType<typeof mock>) = mock(async () => { order.push("candleManager.start"); });

      const reconciliationHandle: ReconciliationHandle = { stop: mock(() => {}) };
      const startReconciliationFn = mock(() => {
        order.push("startReconciliation");
        return reconciliationHandle;
      });

      const { deps } = buildDeps({
        candleManager,
        startReconciliation: startReconciliationFn,
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(order.indexOf("candleManager.start")).toBeLessThan(order.indexOf("startReconciliation"));
    });

    it("calls onCandleClose to register a callback", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect((candleManager.onCandleClose as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    it("calls startReconciliation with adapters and reconciliationDeps", async () => {
      const { deps, reconciliationDeps, startReconciliation } = buildDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(startReconciliation.mock.calls.length).toBe(1);
      const [passedAdapters, passedDeps] = startReconciliation.mock.calls[0] as [ReadonlyMap<Exchange, ExchangeAdapter>, ReconciliationDeps];
      expect(passedAdapters).toBe(deps.adapters);
      expect(passedDeps).toBe(reconciliationDeps);
    });

    it("returns a DaemonHandle with a stop() method", async () => {
      const { deps } = buildDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(typeof handle.stop).toBe("function");
    });
  });

  describe("stop()", () => {
    it("calls CandleManager.stop()", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);
      await handle.stop();

      expect((candleManager.stop as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    it("calls reconciliation.stop()", async () => {
      const { deps, reconciliationHandle } = buildDeps();

      const handle = await startDaemon(deps);
      await handle.stop();

      expect((reconciliationHandle.stop as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    it("calls CandleManager.stop before reconciliation.stop", async () => {
      const order: string[] = [];
      const candleManager = createMockCandleManager();
      (candleManager.stop as ReturnType<typeof mock>) = mock(async () => { order.push("candleManager.stop"); });

      const reconciliationHandle: ReconciliationHandle = {
        stop: mock(() => { order.push("reconciliation.stop"); }),
      };
      const startReconciliationFn = mock(() => reconciliationHandle);

      const { deps } = buildDeps({ candleManager, startReconciliation: startReconciliationFn });

      const handle = await startDaemon(deps);
      await handle.stop();

      expect(order.indexOf("candleManager.stop")).toBeLessThan(order.indexOf("reconciliation.stop"));
    });

    it("is idempotent — calling stop() twice does not call CandleManager.stop() twice", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);
      await handle.stop();
      await handle.stop();

      expect((candleManager.stop as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });
  });

  describe("SIGTERM handling", () => {
    it("process.emit SIGTERM triggers stop() — CandleManager.stop is called", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);

      // Simulate SIGTERM
      process.emit("SIGTERM");

      // stop() is async — wait for microtasks to flush
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect((candleManager.stop as ReturnType<typeof mock>).mock.calls.length).toBe(1);

      // Remove handle from cleanup list — already stopped
      const idx = handlesToStop.indexOf(handle);
      if (idx !== -1) handlesToStop.splice(idx, 1);
    });

    it("duplicate SIGTERM — CandleManager.stop is called only once", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);

      process.emit("SIGTERM");
      process.emit("SIGTERM");

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect((candleManager.stop as ReturnType<typeof mock>).mock.calls.length).toBe(1);

      const idx = handlesToStop.indexOf(handle);
      if (idx !== -1) handlesToStop.splice(idx, 1);
    });

    it("process.emit SIGINT triggers stop() — CandleManager.stop is called", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);

      process.emit("SIGINT");

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect((candleManager.stop as ReturnType<typeof mock>).mock.calls.length).toBe(1);

      const idx = handlesToStop.indexOf(handle);
      if (idx !== -1) handlesToStop.splice(idx, 1);
    });
  });

  describe("candle close callback", () => {
    it("registered callback receives candle and timeframe on invocation", async () => {
      const { deps, candleManager } = buildDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const registeredCb = candleManager._getCloseCallback();
      expect(registeredCb).not.toBeNull();

      // Invoke the callback with a mock candle — just verify it does not throw
      if (registeredCb) {
        const mockCandle = {
          id: "test-id",
          symbol: "BTCUSDT",
          exchange: "binance" as const,
          timeframe: "1M" as const,
          open_time: new Date(),
          open: {} as never,
          high: {} as never,
          low: {} as never,
          close: {} as never,
          volume: {} as never,
          is_closed: true,
          created_at: new Date(),
        };
        expect(() => registeredCb(mockCandle, "1M")).not.toThrow();
      }
    });
  });
});
