import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import Decimal from "decimal.js";
import { CandleCollector } from "../../src/candles/collector";
import { GapRecovery } from "../../src/candles/gap-recovery";
import { CandleManager, type CandleManagerConfig } from "../../src/candles/index";
import type { CleanupResult } from "../../src/candles/cleanup";
import type { SyncOptions } from "../../src/candles/sync";
import type { ExchangeAdapter, OHLCVCallback, Unsubscribe } from "../../src/core/ports";
import type { Candle, Timeframe } from "../../src/core/types";
import type { CandleCloseCallback } from "../../src/candles/types";

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

type StoredCallback = {
  symbol: string;
  timeframe: string;
  callback: OHLCVCallback;
};

function createMockAdapter(): {
  adapter: ExchangeAdapter;
  callbacks: StoredCallback[];
  unsubscribeFns: Array<ReturnType<typeof mock>>;
} {
  const callbacks: StoredCallback[] = [];
  const unsubscribeFns: Array<ReturnType<typeof mock>> = [];

  const adapter = {
    watchOHLCV: mock(async (symbol: string, timeframe: string, callback: OHLCVCallback) => {
      callbacks.push({ symbol, timeframe, callback });
      const unsub = mock(() => {});
      unsubscribeFns.push(unsub);
      return unsub as unknown as Unsubscribe;
    }),
    fetchOHLCV: mock(async () => []),
    fetchBalance: mock(async () => ({
      total: new Decimal("0"),
      available: new Decimal("0"),
    })),
    fetchPositions: mock(async () => []),
    createOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    cancelOrder: mock(async () => {}),
    editOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    fetchOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    getExchangeInfo: mock(async () => ({
      symbol: "",
      tickSize: new Decimal("0.01"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 125,
      contractSize: new Decimal("1"),
    })),
    setLeverage: mock(async () => {}),
  } as unknown as ExchangeAdapter;

  return { adapter, callbacks, unsubscribeFns };
}

// ---------------------------------------------------------------------------
// Mock helpers for CandleCollector
// ---------------------------------------------------------------------------

function createMockCollector() {
  const reconnectCallbacks: Array<() => void> = [];
  const closeCallbacks: CandleCloseCallback[] = [];

  const collector = {
    start: mock(async () => {}),
    stop: mock(async () => {}),
    getStatus: mock(() => ({
      activeSubscriptions: 4,
      lastReceivedAt: new Date("2024-06-01T12:00:00Z"),
    })),
    onReconnect: mock((cb: () => void) => {
      reconnectCallbacks.push(cb);
      return () => {
        const idx = reconnectCallbacks.indexOf(cb);
        if (idx !== -1) reconnectCallbacks.splice(idx, 1);
      };
    }),
    onCandleClose: mock((cb: CandleCloseCallback) => {
      closeCallbacks.push(cb);
      return () => {
        const idx = closeCallbacks.indexOf(cb);
        if (idx !== -1) closeCallbacks.splice(idx, 1);
      };
    }),
  } as unknown as CandleCollector;

  return { collector, reconnectCallbacks, closeCallbacks };
}

function createMockGapRecovery() {
  const gapRecovery = {
    recover: mock(async () => ({
      symbol: "BTCUSDT",
      exchange: "binance",
      timeframe: "5M",
      gapsFound: 0,
      candlesRecovered: 0,
      errors: 0,
    })),
    recoverAll: mock(async () => []),
  } as unknown as GapRecovery;

  return { gapRecovery };
}

// ---------------------------------------------------------------------------
// Default test config
// ---------------------------------------------------------------------------

function makeConfig(adapter: ExchangeAdapter): CandleManagerConfig {
  return {
    symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
    timeframes: ["5M", "1H"] as Timeframe[],
    adapter,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("CandleManager unit tests", () => {
  let manager: CandleManager;

  afterEach(async () => {
    if (manager) {
      await manager.stop();
    }
  });

  it("start() calls syncCandles, then collector.start, then registers gap recovery", async () => {
    const { adapter } = createMockAdapter();
    const { collector, reconnectCallbacks } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async (_opts: SyncOptions) => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });
    const config = makeConfig(adapter);

    await manager.start(config);

    // 1. syncCandles called with correct arguments
    expect(syncFn).toHaveBeenCalledTimes(1);
    const syncCall = syncFn.mock.calls[0]![0] as SyncOptions;
    expect(syncCall.symbols).toEqual([{ symbol: "BTCUSDT", exchange: "binance" }]);
    expect(syncCall.timeframes).toEqual(["5M", "1H"]);
    expect(syncCall.adapter).toBe(adapter);

    // 2. collector.start called
    expect(collector.start).toHaveBeenCalledTimes(1);
    const collectorStart = (collector.start as ReturnType<typeof mock>).mock.calls[0]!;
    expect(collectorStart[0]).toEqual(["BTCUSDT"]);
    expect(collectorStart[1]).toEqual(["5M", "1H"]);
    expect(collectorStart[2]).toBe(adapter);

    // 3. gap recovery callback registered
    expect(collector.onReconnect).toHaveBeenCalledTimes(1);
    expect(reconnectCallbacks).toHaveLength(1);
  });

  it("start() with sync failure still calls collector.start", async () => {
    const { adapter } = createMockAdapter();
    const { collector } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async () => {
      throw new Error("sync failed");
    });
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });
    const config = makeConfig(adapter);

    // Should not throw
    await manager.start(config);

    // syncFn was called but failed
    expect(syncFn).toHaveBeenCalledTimes(1);

    // collector.start is still called despite sync failure
    expect(collector.start).toHaveBeenCalledTimes(1);

    // Status reflects sync failure
    const status = manager.getStatus();
    expect(status.syncCompleted).toBe(false);
    expect(status.collecting).toBe(true);
  });

  it("stop() calls collector.stop and updates status", async () => {
    const { adapter } = createMockAdapter();
    const { collector } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async () => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });
    await manager.start(makeConfig(adapter));

    expect(manager.getStatus().collecting).toBe(true);

    await manager.stop();

    expect(collector.stop).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().collecting).toBe(false);
  });

  it("getStatus() returns aggregated status from sub-modules", async () => {
    const { adapter } = createMockAdapter();
    const { collector } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async () => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });

    // Before start
    const beforeStatus = manager.getStatus();
    expect(beforeStatus.syncCompleted).toBe(false);
    expect(beforeStatus.collecting).toBe(false);
    expect(beforeStatus.lastGapRecovery).toBeNull();

    // After start
    await manager.start(makeConfig(adapter));
    const afterStatus = manager.getStatus();
    expect(afterStatus.syncCompleted).toBe(true);
    expect(afterStatus.collecting).toBe(true);
    expect(afterStatus.activeSubscriptions).toBe(4); // from mock collector
    expect(afterStatus.lastReceivedAt).toEqual(new Date("2024-06-01T12:00:00Z"));
    expect(afterStatus.lastGapRecovery).toBeNull();
  });

  it("onCandleClose(cb) proxies to collector.onCandleClose", async () => {
    const { adapter } = createMockAdapter();
    const { collector, closeCallbacks } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async () => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });

    const userCb = mock((_candle: Candle, _tf: Timeframe) => {});
    const unsub = manager.onCandleClose(userCb);

    expect(collector.onCandleClose).toHaveBeenCalledTimes(1);
    expect(closeCallbacks).toHaveLength(1);

    // Simulate collector firing the close callback
    const testCandle: Candle = {
      id: "test-001",
      symbol: "BTCUSDT",
      exchange: "binance",
      timeframe: "5M",
      open_time: new Date("2024-06-01T12:00:00Z"),
      open: new Decimal("50000"),
      high: new Decimal("50100"),
      low: new Decimal("49900"),
      close: new Decimal("50050"),
      volume: new Decimal("100"),
      is_closed: true,
      created_at: new Date(),
    };
    closeCallbacks[0]!(testCandle, "5M");

    expect(userCb).toHaveBeenCalledTimes(1);
    expect(userCb.mock.calls[0]![0]).toBe(testCandle);
    expect(userCb.mock.calls[0]![1]).toBe("5M");

    // Unsubscribe should remove the callback
    unsub();
    expect(closeCallbacks).toHaveLength(0);
  });

  it("WS reconnect event triggers gapRecovery.recoverAll", async () => {
    const { adapter } = createMockAdapter();
    const { collector, reconnectCallbacks } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async () => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });
    const config = makeConfig(adapter);
    await manager.start(config);

    expect(reconnectCallbacks).toHaveLength(1);

    // Simulate reconnect event
    const reconnectCb = reconnectCallbacks[0]!;
    await reconnectCb();

    // gap recovery called
    expect(gapRecovery.recoverAll).toHaveBeenCalledTimes(1);
    const recoverCall = (gapRecovery.recoverAll as ReturnType<typeof mock>).mock.calls[0]!;
    expect(recoverCall[0]).toEqual([{ symbol: "BTCUSDT", exchange: "binance" }]);
    expect(recoverCall[1]).toEqual(["5M", "1H"]);
    expect(recoverCall[2]).toBe(adapter);

    // lastGapRecovery should be updated
    const status = manager.getStatus();
    expect(status.lastGapRecovery).not.toBeNull();
  });

  it("WS reconnect with gap recovery failure does not throw", async () => {
    const { adapter } = createMockAdapter();
    const { collector, reconnectCallbacks } = createMockCollector();
    const gapRecovery = {
      recover: mock(async () => ({
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "5M",
        gapsFound: 0,
        candlesRecovered: 0,
        errors: 0,
      })),
      recoverAll: mock(async () => {
        throw new Error("recovery failed");
      }),
    } as unknown as GapRecovery;
    const syncFn = mock(async () => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });
    await manager.start(makeConfig(adapter));

    // Simulate reconnect -- should not throw
    const reconnectCb = reconnectCallbacks[0]!;
    await reconnectCb();

    expect(gapRecovery.recoverAll).toHaveBeenCalledTimes(1);

    // lastGapRecovery stays null because recovery failed
    expect(manager.getStatus().lastGapRecovery).toBeNull();
  });

  it("runCleanup() delegates to cleanupFn and returns result", async () => {
    const { adapter } = createMockAdapter();
    const { collector } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async () => []);

    const expectedResult: CleanupResult[] = [
      { timeframe: "1M", deleted: 42, cutoffDate: new Date("2024-01-01") },
    ];
    const cleanupFn = mock(async () => expectedResult);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });

    const result = await manager.runCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expectedResult);
  });

  it("start() uses default TIMEFRAMES when config.timeframes is omitted", async () => {
    const { adapter } = createMockAdapter();
    const { collector } = createMockCollector();
    const { gapRecovery } = createMockGapRecovery();
    const syncFn = mock(async (_opts: SyncOptions) => []);
    const cleanupFn = mock(async () => [] as CleanupResult[]);

    manager = new CandleManager({ collector, gapRecovery, syncFn, cleanupFn });

    const config: CandleManagerConfig = {
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      adapter,
      // No timeframes -- should use TIMEFRAMES default
    };

    await manager.start(config);

    const syncCall = syncFn.mock.calls[0]![0] as SyncOptions;
    expect(syncCall.timeframes).toEqual(["1D", "1H", "5M", "1M"]);
  });

  it("constructor creates default deps when none provided", () => {
    // Verifies that CandleManager can be instantiated without deps
    const defaultManager = new CandleManager();
    const status = defaultManager.getStatus();
    expect(status.syncCompleted).toBe(false);
    expect(status.collecting).toBe(false);
    expect(status.activeSubscriptions).toBe(0);
    expect(status.lastReceivedAt).toBeNull();
    expect(status.lastGapRecovery).toBeNull();
  });
});
