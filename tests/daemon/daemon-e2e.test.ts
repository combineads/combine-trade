/**
 * Daemon E2E integration tests.
 *
 * Verifies the full module integration chain without duplicating unit-level
 * tests that already exist in daemon-skeleton.test.ts, pipeline.test.ts,
 * crash-recovery.test.ts, shutdown.test.ts, and kill-switch.test.ts.
 *
 * Focus areas:
 * 1. Startup lifecycle: initDb → loadAllConfig → recoverFromCrash →
 *    CandleManager.start → onCandleClose → startReconciliation
 * 2. Pipeline routing: candle close events flow through daemon → pipeline → modules
 * 3. Crash recovery → normal pipeline operation
 * 4. Graceful shutdown integration (startDaemon + shutdownDeps)
 * 5. Kill switch standalone
 */

import { afterEach, describe, expect, it, mock } from "bun:test";
import Decimal from "decimal.js";

import type { DaemonDeps, DaemonHandle } from "../../src/daemon";
import { startDaemon } from "../../src/daemon";
import type { CandleCloseCallback } from "../../src/candles/types";
import type { CrashRecoveryDeps, CrashRecoveryResult } from "../../src/daemon/crash-recovery";
import { recoverFromCrash } from "../../src/daemon/crash-recovery";
import type { ActiveSymbol, PipelineDeps } from "../../src/daemon/pipeline";
import type { ShutdownDeps } from "../../src/daemon/shutdown";
import type { ExchangeAdapter } from "../../src/core/ports";
import type { Candle, Exchange, Timeframe, WatchSession, SymbolState } from "../../src/core/types";
import type { ReconciliationDeps, ReconciliationHandle } from "../../src/reconciliation/worker";
import type { AllIndicators } from "../../src/indicators/types";
import type { EvidenceResult } from "../../src/signals/evidence-gate";
import type { SafetyResult } from "../../src/signals/safety-gate";
import type { KnnDecisionResult } from "../../src/knn/decision";
import type { ExitAction } from "../../src/exits/checker";
import {
  killSwitch,
  type KillSwitchDeps,
} from "../../scripts/kill-switch";

// ---------------------------------------------------------------------------
// Utility: call count helper
// ---------------------------------------------------------------------------

function callCount(fn: unknown): number {
  return (fn as ReturnType<typeof mock>).mock.calls.length;
}

// ---------------------------------------------------------------------------
// Domain object factories
// ---------------------------------------------------------------------------

function makeCandle(overrides?: Partial<Candle>): Candle {
  return {
    id: "candle-1",
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    timeframe: "5M" as Timeframe,
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: new Decimal("40000"),
    high: new Decimal("40100"),
    low: new Decimal("39900"),
    close: new Decimal("40050"),
    volume: new Decimal("100"),
    is_closed: true,
    created_at: new Date(),
    ...overrides,
  };
}

function makeSymbolState(overrides?: Partial<SymbolState>): SymbolState {
  return {
    id: "state-1",
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    fsm_state: "IDLE",
    execution_mode: "analysis",
    daily_bias: "NEUTRAL",
    daily_open: new Decimal("40000"),
    session_box_high: null,
    session_box_low: null,
    losses_today: new Decimal("0"),
    losses_session: 0,
    losses_this_1h_5m: 0,
    losses_this_1h_1m: 0,
    updated_at: new Date(),
    ...overrides,
  };
}

function makeWatchSession(overrides?: Partial<WatchSession>): WatchSession {
  return {
    id: "session-1",
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    detection_type: "BB4_TOUCH",
    direction: "LONG",
    tp1_price: new Decimal("41000"),
    tp2_price: new Decimal("42000"),
    detected_at: new Date(),
    invalidated_at: null,
    invalidation_reason: null,
    context_data: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makeIndicators(): AllIndicators {
  return {
    bb20: null,
    bb4: null,
    sma20: new Decimal("40000"),
    sma60: new Decimal("39000"),
    sma120: new Decimal("38000"),
    ema20: new Decimal("40000"),
    ema60: new Decimal("39000"),
    ema120: new Decimal("38000"),
    rsi14: new Decimal("50"),
    atr14: new Decimal("100"),
    squeeze: "normal",
  };
}

function makeEvidence(): EvidenceResult {
  return {
    signalType: "ONE_B",
    direction: "LONG",
    entryPrice: new Decimal("40050"),
    slPrice: new Decimal("39500"),
    details: {},
  };
}

function makeSafetyPassed(): SafetyResult {
  return { passed: true, reasons: [] };
}

function makeKnnPass(): KnnDecisionResult {
  return {
    decision: "PASS",
    winRate: 0.65,
    expectancy: 0.3,
    sampleCount: 50,
    aGrade: false,
  };
}

function makeExitNone(): ExitAction {
  return {
    type: "NONE",
    closeSize: new Decimal("0"),
    closeReason: null,
  };
}

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides?: Partial<ExchangeAdapter>): ExchangeAdapter {
  return {
    fetchOHLCV: mock(async () => []),
    fetchBalance: mock(async () => ({
      total: new Decimal("10000"),
      available: new Decimal("10000"),
    })),
    fetchPositions: mock(async () => []),
    createOrder: mock(async () => ({
      orderId: crypto.randomUUID(),
      exchangeOrderId: `exch-${crypto.randomUUID()}`,
      status: "FILLED" as const,
      filledPrice: new Decimal("40050"),
      filledSize: new Decimal("0.1"),
      timestamp: new Date(),
    })),
    cancelOrder: mock(async () => {}),
    editOrder: mock(async () => ({
      orderId: crypto.randomUUID(),
      exchangeOrderId: `exch-${crypto.randomUUID()}`,
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    fetchOrder: mock(async () => ({
      orderId: crypto.randomUUID(),
      exchangeOrderId: `exch-${crypto.randomUUID()}`,
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    watchOHLCV: mock(async () => () => {}),
    getExchangeInfo: mock(async () => ({
      symbol: "BTCUSDT",
      tickSize: new Decimal("0.01"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 125,
      contractSize: new Decimal("1"),
    })),
    setLeverage: mock(async () => {}),
    ...overrides,
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
// Mock crash recovery deps factory
// ---------------------------------------------------------------------------

function createMockCrashRecoveryDeps(overrides?: Partial<CrashRecoveryDeps>): CrashRecoveryDeps {
  return {
    adapters: new Map<Exchange, ExchangeAdapter>(),
    getActiveTickets: mock(async () => []),
    getPendingSymbols: mock(async () => new Set<string>()),
    comparePositions: mock(() => ({ matched: [], unmatched: [], orphaned: [], excluded: [] })),
    emergencyClose: mock(async () => {}),
    setSymbolStateIdle: mock(async () => {}),
    checkSlOnExchange: mock(async () => true),
    reRegisterSl: mock(async () => {}),
    restoreLossCounters: mock(async () => {}),
    insertEvent: mock(async () => {}),
    sendSlackAlert: mock(async () => {}),
    ...overrides,
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
// Mock pipeline deps factory
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: mock DB needs loose typing
const mockDb: any = {};

function createMockPipelineDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  // biome-ignore lint/suspicious/noExplicitAny: mock adapter needs loose typing
  const mockAdapter: any = createMockAdapter();
  const adapters = new Map([["binance" as Exchange, mockAdapter]]);

  return {
    db: mockDb,
    adapters,

    getCandles: mock(async () => [makeCandle()]),
    calcAllIndicators: mock(() => makeIndicators()),
    getSymbolState: mock(async () => makeSymbolState()),

    determineDailyBias: mock(() => "NEUTRAL" as const),
    updateDailyBias: mock(async () => {}),
    isTradeBlocked: mock(async () => ({ blocked: false })),

    detectWatching: mock(() => null),
    getActiveWatchSession: mock(async () => null),
    openWatchSession: mock(async () => makeWatchSession()),
    invalidateWatchSession: mock(async () => {}),
    checkInvalidation: mock(() => null),

    checkEvidence: mock(() => null),
    checkSafety: mock(() => makeSafetyPassed()),

    vectorize: mock(() => new Float32Array(202)),
    insertVector: mock(async () => ({
      id: "vector-1",
      candle_id: "candle-1",
      symbol: "BTCUSDT",
      exchange: "binance",
      timeframe: "5M",
      embedding: "[0.1,0.2]",
      label: null,
      grade: null,
      labeled_at: null,
      created_at: new Date(),
    })),

    searchKnn: mock(async () => []),
    applyTimeDecay: mock(() => []),
    makeDecision: mock(() => makeKnnPass()),
    loadKnnConfig: mock(async () => ({ topK: 50, distanceMetric: "cosine" as const })),
    loadTimeDecayConfig: mock(async () => ({ halfLifeDays: 90 })),

    getActiveTicket: mock(async () => null),
    canPyramid: mock(() => ({ allowed: false, reason: "max_count_reached" })),
    computeEntrySize: mock(async () => ({ size: new Decimal("0.1"), leverage: 10 })),
    createTicket: mock(async () => ({
      id: "ticket-1",
      symbol: "BTCUSDT",
      exchange: "binance" as Exchange,
      signal_id: "signal-1",
      parent_ticket_id: null,
      timeframe: "5M",
      direction: "LONG",
      state: "INITIAL",
      entry_price: new Decimal("40050"),
      sl_price: new Decimal("39500"),
      current_sl_price: new Decimal("39500"),
      size: new Decimal("0.1"),
      remaining_size: new Decimal("0.1"),
      leverage: 10,
      tp1_price: new Decimal("41000"),
      tp2_price: new Decimal("42000"),
      trailing_active: false,
      trailing_price: null,
      max_profit: new Decimal("0"),
      pyramid_count: 0,
      opened_at: new Date(),
      closed_at: null,
      close_reason: null,
      result: null,
      pnl: null,
      pnl_pct: null,
      max_favorable: new Decimal("0"),
      max_adverse: new Decimal("0"),
      hold_duration_sec: null,
      created_at: new Date(),
      updated_at: new Date(),
    })),

    executeEntry: mock(async () => ({
      success: true,
      entryOrder: { filled_price: "40050" } as never,
      slOrder: null,
      aborted: false,
    })),
    loadSlippageConfig: mock(async () => ({ maxSpreadPct: new Decimal("0.05") })),

    checkExit: mock(() => makeExitNone()),
    processExit: mock(async () => ({
      success: true,
      closeOrder: null,
      slOrder: null,
      newState: null,
      ticketUpdates: null,
    })),
    processTrailing: mock(async () => ({
      updated: false,
      newTrailingPrice: null,
      newMaxProfit: null,
      slOrder: null,
    })),
    updateTpPrices: mock(() => ({ tp1_price: null, tp2_price: null })),
    updateMfeMae: mock(() => ({ max_favorable: "0", max_adverse: "0" })),

    checkLossLimit: mock(() => ({ allowed: true, violations: [] })),
    loadLossLimitConfig: mock(async () => ({
      maxDailyLossPct: new Decimal("0.10"),
      maxSessionLosses: 3,
      maxHourly5m: 2,
      maxHourly1m: 1,
    })),

    sendSlackAlert: mock(async () => {}),
    insertEvent: mock(async () => ({
      id: "event-1",
      event_type: "PIPELINE_LATENCY",
      symbol: "BTCUSDT",
      exchange: "binance",
      ref_id: null,
      ref_type: null,
      data: null,
      created_at: new Date(),
    })),

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Full DaemonDeps builder
// ---------------------------------------------------------------------------

function buildDaemonDeps(overrides?: Partial<DaemonDeps>): {
  deps: DaemonDeps;
  candleManager: ReturnType<typeof createMockCandleManager>;
  reconciliationHandle: ReconciliationHandle;
  initDb: ReturnType<typeof mock>;
  loadAllConfig: ReturnType<typeof mock>;
  startReconciliation: ReturnType<typeof mock>;
  recoverFromCrash: ReturnType<typeof mock>;
  pipelineDeps: PipelineDeps;
} {
  const candleManager = createMockCandleManager();
  const reconciliationDeps = createMockReconciliationDeps();
  const crashRecoveryDeps = createMockCrashRecoveryDeps();
  const reconciliationHandle: ReconciliationHandle = { stop: mock(() => {}) };
  const startReconciliationFn = mock(() => reconciliationHandle);
  const initDb = mock(async () => {});
  const loadAllConfig = mock(async () => {});
  const recoverFromCrashFn = mock(async (): Promise<CrashRecoveryResult> => ({
    matched: 0,
    unmatched: 0,
    orphaned: 0,
    slReRegistered: 0,
    errors: [],
    durationMs: 0,
  }));

  const adapters = new Map<Exchange, ExchangeAdapter>([
    ["binance", createMockAdapter()],
  ]);

  const pipelineDeps = createMockPipelineDeps();

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
    recoverFromCrash: recoverFromCrashFn,
    crashRecoveryDeps,
    startReconciliation: startReconciliationFn,
    pipelineDeps,
    activeSymbols: [{ symbol: "BTCUSDT", exchange: "binance", executionMode: "analysis" }],
    ...overrides,
  };

  return {
    deps,
    candleManager,
    reconciliationHandle,
    initDb,
    loadAllConfig,
    startReconciliation: startReconciliationFn,
    recoverFromCrash: recoverFromCrashFn,
    pipelineDeps,
  };
}

// ---------------------------------------------------------------------------
// Cleanup: stop all daemon handles after each test
// ---------------------------------------------------------------------------

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

describe("daemon E2E", () => {
  // -------------------------------------------------------------------------
  // 1. Full startup lifecycle
  // -------------------------------------------------------------------------

  describe("full startup lifecycle", () => {
    it("calls initDb → loadAllConfig → recoverFromCrash → CandleManager.start → onCandleClose → startReconciliation in order", async () => {
      const order: string[] = [];
      const candleManager = createMockCandleManager();
      (candleManager.start as ReturnType<typeof mock>) = mock(async () => {
        order.push("candleManager.start");
      });
      (candleManager.onCandleClose as ReturnType<typeof mock>) = mock(
        (cb: CandleCloseCallback) => {
          order.push("onCandleClose");
          return () => {};
        },
      );

      const reconciliationHandle: ReconciliationHandle = { stop: mock(() => {}) };
      const startReconciliationFn = mock(() => {
        order.push("startReconciliation");
        return reconciliationHandle;
      });

      const { deps } = buildDaemonDeps({
        candleManager,
        startReconciliation: startReconciliationFn,
        initDb: mock(async () => {
          order.push("initDb");
        }),
        loadAllConfig: mock(async () => {
          order.push("loadAllConfig");
        }),
        recoverFromCrash: mock(async (): Promise<CrashRecoveryResult> => {
          order.push("recoverFromCrash");
          return {
            matched: 0,
            unmatched: 0,
            orphaned: 0,
            slReRegistered: 0,
            errors: [],
            durationMs: 0,
          };
        }),
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(order.indexOf("initDb")).toBeLessThan(order.indexOf("loadAllConfig"));
      expect(order.indexOf("loadAllConfig")).toBeLessThan(order.indexOf("recoverFromCrash"));
      expect(order.indexOf("recoverFromCrash")).toBeLessThan(order.indexOf("candleManager.start"));
      expect(order.indexOf("candleManager.start")).toBeLessThan(order.indexOf("onCandleClose"));
      expect(order.indexOf("onCandleClose")).toBeLessThan(order.indexOf("startReconciliation"));
    });

    it("passes adapters and reconciliationDeps to startReconciliation", async () => {
      const { deps, startReconciliation } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(callCount(startReconciliation)).toBe(1);
      const [passedAdapters, passedRecDeps] = startReconciliation.mock.calls[0] as [
        ReadonlyMap<Exchange, ExchangeAdapter>,
        ReconciliationDeps,
      ];
      expect(passedAdapters).toBe(deps.adapters);
      expect(passedRecDeps).toBe(deps.reconciliationDeps);
    });

    it("recoverFromCrash is called with crashRecoveryDeps", async () => {
      const { deps, recoverFromCrash } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(callCount(recoverFromCrash)).toBe(1);
      const [passedDeps] = recoverFromCrash.mock.calls[0] as [CrashRecoveryDeps];
      expect(passedDeps).toBe(deps.crashRecoveryDeps);
    });

    it("CandleManager.start is called once", async () => {
      const { deps, candleManager } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(callCount(candleManager.start)).toBe(1);
    });

    it("onCandleClose registers exactly one callback", async () => {
      const { deps, candleManager } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(callCount(candleManager.onCandleClose)).toBe(1);
      expect(candleManager._getCloseCallback()).not.toBeNull();
    });

    it("returns a handle with a stop() method", async () => {
      const { deps } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      expect(typeof handle.stop).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // 2. 1D candle → bias update (pipeline routing)
  // -------------------------------------------------------------------------

  describe("1D candle → bias update", () => {
    it("triggers determineDailyBias via the registered candle-close callback", async () => {
      const determineDailyBias = mock(() => "LONG_ONLY" as const);
      const pipelineDeps = createMockPipelineDeps({
        getCandles: mock(async () => [makeCandle({ timeframe: "1D" }), makeCandle({ timeframe: "1D" })]),
        calcAllIndicators: mock(() => ({ ...makeIndicators(), sma20: new Decimal("40000") })),
        determineDailyBias,
      });

      const { deps, candleManager } = buildDaemonDeps({ pipelineDeps });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      expect(cb).not.toBeNull();

      // Simulate 1D candle close via the registered callback
      const candle = makeCandle({ timeframe: "1D" });
      await cb!(candle, "1D");

      // Allow fire-and-forget microtasks to flush
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(determineDailyBias)).toBe(1);
    });

    it("calls updateDailyBias after determineDailyBias on 1D close", async () => {
      const updateDailyBias = mock(async () => {});
      const pipelineDeps = createMockPipelineDeps({
        getCandles: mock(async () => [makeCandle({ timeframe: "1D" }), makeCandle({ timeframe: "1D" })]),
        calcAllIndicators: mock(() => ({ ...makeIndicators(), sma20: new Decimal("40000") })),
        determineDailyBias: mock(() => "NEUTRAL" as const),
        updateDailyBias,
      });

      const { deps, candleManager } = buildDaemonDeps({ pipelineDeps });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ timeframe: "1D" }), "1D");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(updateDailyBias)).toBe(1);
    });

    it("fires BIAS_CHANGE event after 1D candle close", async () => {
      const insertEvent = mock(async () => ({
        id: "event-1",
        event_type: "BIAS_CHANGE",
        symbol: "BTCUSDT",
        exchange: "binance",
        ref_id: null,
        ref_type: null,
        data: null,
        created_at: new Date(),
      }));

      const pipelineDeps = createMockPipelineDeps({
        getCandles: mock(async () => [makeCandle({ timeframe: "1D" }), makeCandle({ timeframe: "1D" })]),
        calcAllIndicators: mock(() => ({ ...makeIndicators(), sma20: new Decimal("40000") })),
        determineDailyBias: mock(() => "SHORT_ONLY" as const),
        insertEvent,
      });

      const { deps, candleManager } = buildDaemonDeps({ pipelineDeps });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ timeframe: "1D" }), "1D");
      await new Promise((resolve) => setTimeout(resolve, 10));

      const insertEventMock = insertEvent as ReturnType<typeof mock>;
      const biasCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string })?.event_type === "BIAS_CHANGE",
      );
      expect(biasCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. 1H candle → watch session detection
  // -------------------------------------------------------------------------

  describe("1H candle → watching detection", () => {
    it("calls detectWatching via candle-close callback on 1H close", async () => {
      const detectWatching = mock(() => null);
      const pipelineDeps = createMockPipelineDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "LONG_ONLY" })),
        detectWatching,
      });

      const { deps, candleManager } = buildDaemonDeps({ pipelineDeps });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ timeframe: "1H" }), "1H");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(detectWatching)).toBe(1);
    });

    it("calls openWatchSession when detectWatching returns a result on 1H close", async () => {
      const openWatchSession = mock(async () => makeWatchSession());
      const pipelineDeps = createMockPipelineDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "LONG_ONLY" })),
        detectWatching: mock(() => ({
          detectionType: "BB4_TOUCH" as const,
          direction: "LONG" as const,
          tp1Price: new Decimal("41000"),
          tp2Price: new Decimal("42000"),
          contextData: {},
        })),
        openWatchSession,
      });

      const { deps, candleManager } = buildDaemonDeps({ pipelineDeps });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ timeframe: "1H" }), "1H");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(openWatchSession)).toBe(1);
    });

    it("inserts WATCHING_START event when watch session is opened via 1H candle close", async () => {
      const insertEvent = mock(async () => ({
        id: "event-1",
        event_type: "WATCHING_START",
        symbol: "BTCUSDT",
        exchange: "binance",
        ref_id: null,
        ref_type: null,
        data: null,
        created_at: new Date(),
      }));

      const pipelineDeps = createMockPipelineDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "LONG_ONLY" })),
        detectWatching: mock(() => ({
          detectionType: "BB4_TOUCH" as const,
          direction: "LONG" as const,
          tp1Price: new Decimal("41000"),
          tp2Price: new Decimal("42000"),
          contextData: {},
        })),
        openWatchSession: mock(async () => makeWatchSession()),
        insertEvent,
      });

      const { deps, candleManager } = buildDaemonDeps({ pipelineDeps });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ timeframe: "1H" }), "1H");
      await new Promise((resolve) => setTimeout(resolve, 10));

      const watchingCall = (insertEvent as ReturnType<typeof mock>).mock.calls.find(
        (args) => (args[1] as { event_type: string })?.event_type === "WATCHING_START",
      );
      expect(watchingCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. 5M candle → entry pipeline (analysis mode skips executeEntry)
  //
  // NOTE: Each test uses a unique symbol to avoid cross-test contamination
  // from the module-level recent1MFired map in pipeline.ts (which tracks
  // whether a 1M candle has fired recently for a symbol, suppressing 5M).
  // -------------------------------------------------------------------------

  describe("5M candle → entry pipeline", () => {
    it("calls checkEvidence when active watch session exists on 5M close", async () => {
      // Use a unique symbol to avoid 1M priority rule contamination
      const symbol = "E2E_EVIDENCE_TEST_XYZUSDT";
      const checkEvidence = mock(() => null);
      const pipelineDeps = createMockPipelineDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence,
      });

      const { deps, candleManager } = buildDaemonDeps({
        pipelineDeps,
        activeSymbols: [{ symbol, exchange: "binance", executionMode: "analysis" }],
      });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ symbol, timeframe: "5M" }), "5M");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(checkEvidence)).toBe(1);
    });

    it("calls vectorize and searchKnn when evidence + safety pass on 5M close", async () => {
      const symbol = "E2E_VECTORIZE_TEST_XYZUSDT";
      const vectorize = mock(() => new Float32Array(202));
      const searchKnn = mock(async () => []);
      const pipelineDeps = createMockPipelineDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        vectorize,
        searchKnn,
      });

      const { deps, candleManager } = buildDaemonDeps({
        pipelineDeps,
        activeSymbols: [{ symbol, exchange: "binance", executionMode: "analysis" }],
      });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ symbol, timeframe: "5M" }), "5M");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(vectorize)).toBe(1);
      expect(callCount(searchKnn)).toBe(1);
    });

    it("does NOT call executeEntry in analysis mode even when KNN passes", async () => {
      const symbol = "E2E_ANALYSIS_MODE_XYZUSDT";
      const executeEntry = mock(async () => ({
        success: true,
        entryOrder: { filled_price: "40050" } as never,
        slOrder: null,
        aborted: false,
      }));

      const pipelineDeps = createMockPipelineDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
        executeEntry,
      });

      const { deps, candleManager } = buildDaemonDeps({
        pipelineDeps,
        activeSymbols: [{ symbol, exchange: "binance", executionMode: "analysis" }],
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ symbol, timeframe: "5M" }), "5M");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(executeEntry)).toBe(0);
    });

    it("calls executeEntry in live mode when KNN passes on 5M close", async () => {
      const symbol = "E2E_LIVE_ENTRY_XYZUSDT";
      const executeEntry = mock(async () => ({
        success: true,
        entryOrder: { filled_price: "40050" } as never,
        slOrder: null,
        aborted: false,
      }));

      const pipelineDeps = createMockPipelineDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
        executeEntry,
      });

      const { deps, candleManager } = buildDaemonDeps({
        pipelineDeps,
        activeSymbols: [{ symbol, exchange: "binance", executionMode: "live" }],
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ symbol, timeframe: "5M" }), "5M");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(executeEntry)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Crash recovery → pipeline resumes
  // -------------------------------------------------------------------------

  describe("crash recovery → pipeline resumes", () => {
    it("starts pipeline normally after crash recovery resolves with unmatched positions", async () => {
      // Use the real recoverFromCrash so crashRecoveryDeps.emergencyClose is actually called
      const emergencyClose = mock(async () => {});
      const crashRecoveryDeps = createMockCrashRecoveryDeps({
        emergencyClose,
        // comparePositions returns one unmatched position
        comparePositions: mock(() => ({
          matched: [],
          unmatched: [
            {
              position: {
                symbol: "ETHUSDT",
                exchange: "binance" as Exchange,
                side: "LONG" as const,
                size: new Decimal("1.0"),
                entryPrice: new Decimal("3000"),
                unrealizedPnl: new Decimal("0"),
                leverage: 10,
                liquidationPrice: new Decimal("2700"),
              },
            },
          ],
          orphaned: [],
          excluded: [],
        })),
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", createMockAdapter()]]),
      });

      // Use unique symbol for the pipeline part to avoid 1M priority contamination
      const pipelineSymbol = "E2E_RECOVERY_UNMATCHED_XYZUSDT";
      const checkEvidence = mock(() => null);
      const pipelineDeps = createMockPipelineDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol: pipelineSymbol })),
        checkEvidence,
      });

      // Inject the real recoverFromCrash so crashRecoveryDeps gets exercised
      const { deps, candleManager } = buildDaemonDeps({
        crashRecoveryDeps,
        pipelineDeps,
        recoverFromCrash,
        activeSymbols: [{ symbol: pipelineSymbol, exchange: "binance", executionMode: "analysis" }],
      });

      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      // After recovery completes, pipeline candle-close events should still work
      const cb = candleManager._getCloseCallback();
      expect(cb).not.toBeNull();

      await cb!(makeCandle({ symbol: pipelineSymbol, timeframe: "5M" }), "5M");
      await new Promise((resolve) => setTimeout(resolve, 10));

      // emergencyClose ran during recovery because of the unmatched position
      expect(callCount(emergencyClose)).toBe(1);
      // Pipeline still processed the 5M candle after recovery
      expect(callCount(checkEvidence)).toBe(1);
    });

    it("starts pipeline normally after crash recovery with matched+missing SL scenario", async () => {
      const reRegisterSl = mock(async () => {});
      const checkSlOnExchange = mock(async () => false); // SL missing → triggers re-registration

      const crashRecoveryDeps = createMockCrashRecoveryDeps({
        checkSlOnExchange,
        reRegisterSl,
        // comparePositions returns one matched position with missing SL
        comparePositions: mock(() => ({
          matched: [
            {
              position: {
                symbol: "BTCUSDT",
                exchange: "binance" as Exchange,
                side: "LONG" as const,
                size: new Decimal("0.5"),
                entryPrice: new Decimal("40000"),
                unrealizedPnl: new Decimal("25"),
                leverage: 10,
                liquidationPrice: new Decimal("36000"),
              },
              ticket: {
                id: "ticket-matched-1",
                symbol: "BTCUSDT",
                exchange: "binance" as Exchange,
                direction: "LONG" as const,
                state: "INITIAL",
                created_at: new Date("2020-01-01T00:00:00Z"),
              },
            },
          ],
          unmatched: [],
          orphaned: [],
          excluded: [],
        })),
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", createMockAdapter()]]),
      });

      // Use unique symbol for the pipeline part to avoid 1M priority contamination
      const pipelineSymbol = "E2E_RECOVERY_SL_XYZUSDT";
      const getActiveWatchSession = mock(async () => null);
      const pipelineDeps = createMockPipelineDeps({ getActiveWatchSession });

      // Inject the real recoverFromCrash so crashRecoveryDeps gets exercised
      const { deps, candleManager } = buildDaemonDeps({
        crashRecoveryDeps,
        pipelineDeps,
        recoverFromCrash,
        activeSymbols: [{ symbol: pipelineSymbol, exchange: "binance", executionMode: "analysis" }],
      });
      const handle = await startDaemon(deps);
      handlesToStop.push(handle);

      // SL was re-registered during crash recovery because checkSlOnExchange returned false
      expect(callCount(reRegisterSl)).toBe(1);

      // Pipeline still accepts new candle events after recovery
      const cb = candleManager._getCloseCallback();
      await cb!(makeCandle({ symbol: pipelineSymbol, timeframe: "5M" }), "5M");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(getActiveWatchSession)).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Graceful shutdown integration
  // -------------------------------------------------------------------------

  describe("graceful shutdown", () => {
    it("calls candleManager.stop via stop()", async () => {
      const { deps, candleManager } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      await handle.stop();

      expect(callCount(candleManager.stop)).toBe(1);
    });

    it("calls reconciliation.stop via stop()", async () => {
      const { deps, reconciliationHandle } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      await handle.stop();

      expect(callCount(reconciliationHandle.stop)).toBe(1);
    });

    it("candleManager.stop is called before reconciliation.stop", async () => {
      const order: string[] = [];
      const candleManager = createMockCandleManager();
      (candleManager.stop as ReturnType<typeof mock>) = mock(async () => {
        order.push("candleManager.stop");
      });

      const reconciliationHandle: ReconciliationHandle = {
        stop: mock(() => {
          order.push("reconciliation.stop");
        }),
      };
      const startReconciliationFn = mock(() => reconciliationHandle);

      const { deps } = buildDaemonDeps({
        candleManager,
        startReconciliation: startReconciliationFn,
      });

      const handle = await startDaemon(deps);
      await handle.stop();

      expect(order.indexOf("candleManager.stop")).toBeLessThan(order.indexOf("reconciliation.stop"));
    });

    it("with shutdownDeps: calls getPendingOrders during shutdown", async () => {
      const getPendingOrders = mock(async () => []);
      const shutdownDeps: Omit<ShutdownDeps, "candleManager" | "reconciliationHandle"> = {
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", createMockAdapter()]]),
        getPendingOrders,
        cancelOrder: mock(async () => {}),
        closePool: mock(async () => {}),
        sendSlackAlert: mock(async () => {}),
      };

      const { deps } = buildDaemonDeps({
        shutdownDeps: shutdownDeps as ShutdownDeps,
      });

      const handle = await startDaemon(deps);
      await handle.stop();

      // Allow Slack fire-and-forget to flush
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(getPendingOrders)).toBe(1);
    });

    it("with shutdownDeps: cancels PENDING orders during shutdown", async () => {
      const cancelOrder = mock(async () => {});
      const pendingOrder = { exchangeOrderId: "order-123", symbol: "BTCUSDT", exchange: "binance" as Exchange };

      const shutdownDeps: Omit<ShutdownDeps, "candleManager" | "reconciliationHandle"> = {
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", createMockAdapter()]]),
        getPendingOrders: mock(async () => [pendingOrder]),
        cancelOrder,
        closePool: mock(async () => {}),
        sendSlackAlert: mock(async () => {}),
      };

      const { deps } = buildDaemonDeps({
        shutdownDeps: shutdownDeps as ShutdownDeps,
      });

      const handle = await startDaemon(deps);
      await handle.stop();

      expect(callCount(cancelOrder)).toBe(1);
      const [, orderId, symbol] = (cancelOrder as ReturnType<typeof mock>).mock.calls[0] as [
        ExchangeAdapter,
        string,
        string,
      ];
      expect(orderId).toBe("order-123");
      expect(symbol).toBe("BTCUSDT");
    });

    it("stop() is idempotent — second call does not re-stop", async () => {
      const { deps, candleManager } = buildDaemonDeps();

      const handle = await startDaemon(deps);
      await handle.stop();
      await handle.stop();

      expect(callCount(candleManager.stop)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Kill switch standalone
  // -------------------------------------------------------------------------

  describe("kill switch standalone", () => {
    it("closes all positions and sets mode to analysis", async () => {
      const position = {
        symbol: "BTCUSDT",
        exchange: "binance" as Exchange,
        side: "LONG" as const,
        size: new Decimal("1.5"),
        entryPrice: new Decimal("50000"),
        unrealizedPnl: new Decimal("100"),
        leverage: 10,
        liquidationPrice: new Decimal("45000"),
      };

      const adapter = createMockAdapter({
        fetchPositions: mock(async () => [position]),
      });

      const emergencyClose = mock(async () => {});
      const updateAllExecutionMode = mock(async () => 1);

      const deps: KillSwitchDeps = {
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", adapter]]),
        emergencyClose,
        getOpenOrders: mock(async () => []),
        cancelOrder: mock(async () => {}),
        updateAllExecutionMode,
        insertKillSwitchEvent: mock(async () => {}),
        sendAlert: mock(async () => {}),
      };

      const result = await killSwitch(deps);

      expect(callCount(emergencyClose)).toBe(1);
      expect(result.positionsClosed).toBe(1);
      expect(callCount(updateAllExecutionMode)).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it("sends Slack KILL SWITCH ACTIVATED alert", async () => {
      const sendAlert = mock(async () => {});

      const deps: KillSwitchDeps = {
        adapters: new Map(),
        emergencyClose: mock(async () => {}),
        getOpenOrders: mock(async () => []),
        cancelOrder: mock(async () => {}),
        updateAllExecutionMode: mock(async () => 0),
        insertKillSwitchEvent: mock(async () => {}),
        sendAlert,
      };

      await killSwitch(deps);

      expect(callCount(sendAlert)).toBe(1);
      const callArg = (sendAlert as ReturnType<typeof mock>).mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArg?.event).toContain("KILL SWITCH ACTIVATED");
    });

    it("inserts KILL_SWITCH event log entry", async () => {
      const insertKillSwitchEvent = mock(async () => {});

      const deps: KillSwitchDeps = {
        adapters: new Map(),
        emergencyClose: mock(async () => {}),
        getOpenOrders: mock(async () => []),
        cancelOrder: mock(async () => {}),
        updateAllExecutionMode: mock(async () => 0),
        insertKillSwitchEvent,
        sendAlert: mock(async () => {}),
      };

      await killSwitch(deps);

      expect(callCount(insertKillSwitchEvent)).toBe(1);
      const callArg = (insertKillSwitchEvent as ReturnType<typeof mock>).mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(typeof callArg?.positionsClosed).toBe("number");
      expect(typeof callArg?.ordersCancelled).toBe("number");
    });

    it("cancels open orders during kill switch", async () => {
      const cancelOrder = mock(async () => {});
      const openOrders = [
        { exchangeOrderId: "order-1", symbol: "BTCUSDT", exchange: "binance" as Exchange },
        { exchangeOrderId: "order-2", symbol: "ETHUSDT", exchange: "binance" as Exchange },
      ];

      const deps: KillSwitchDeps = {
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", createMockAdapter()]]),
        emergencyClose: mock(async () => {}),
        getOpenOrders: mock(async () => openOrders),
        cancelOrder,
        updateAllExecutionMode: mock(async () => 0),
        insertKillSwitchEvent: mock(async () => {}),
        sendAlert: mock(async () => {}),
      };

      const result = await killSwitch(deps);

      expect(callCount(cancelOrder)).toBe(2);
      expect(result.ordersCancelled).toBe(2);
    });

    it("returns errors array on exchange failure but does not throw", async () => {
      const failingAdapter = createMockAdapter({
        fetchPositions: mock(async () => {
          throw new Error("exchange down");
        }),
      });

      const deps: KillSwitchDeps = {
        adapters: new Map<Exchange, ExchangeAdapter>([["binance", failingAdapter]]),
        emergencyClose: mock(async () => {}),
        getOpenOrders: mock(async () => []),
        cancelOrder: mock(async () => {}),
        updateAllExecutionMode: mock(async () => 0),
        insertKillSwitchEvent: mock(async () => {}),
        sendAlert: mock(async () => {}),
      };

      const result = await killSwitch(deps);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.exchangesFailed).toContain("binance");
    });
  });
});
