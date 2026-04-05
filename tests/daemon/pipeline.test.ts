/**
 * Tests for the pipeline orchestrator (handleCandleClose).
 *
 * Strategy: inject mocks for ALL external dependencies via PipelineDeps so
 * no real DB / exchange connections are made.
 *
 * Focuses on:
 * - Timeframe-based routing (1D / 1H / 5M / 1M)
 * - Per-symbol error isolation
 * - 1M priority rule (5M skipped when 1M fires recently)
 * - PIPELINE_LATENCY event recording
 * - Guard conditions (trade blocked, loss limit, no evidence, safety fail, KNN fail)
 */

import { describe, expect, it, mock } from "bun:test";
import Decimal from "decimal.js";
import type { ActiveSymbol, PipelineDeps } from "../../src/daemon/pipeline";
import { handleCandleClose } from "../../src/daemon/pipeline";
import type { Candle, Exchange, Timeframe, WatchSession, Ticket, SymbolState } from "../../src/core/types";
import type { AllIndicators } from "../../src/indicators/types";
import type { EvidenceResult } from "../../src/signals/evidence-gate";
import type { SafetyResult } from "../../src/signals/safety-gate";
import type { KnnDecisionResult } from "../../src/knn/decision";
import type { ExitAction } from "../../src/exits/checker";
import type { LossViolation } from "../../src/limits/loss-limit";

// ---------------------------------------------------------------------------
// Helpers: build minimal domain objects for tests
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

function makeActiveSymbol(overrides?: Partial<ActiveSymbol>): ActiveSymbol {
  return {
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    executionMode: "analysis",
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

function makeTicket(overrides?: Partial<Ticket>): Ticket {
  return {
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

function makeIndicators(overrides?: Partial<AllIndicators>): AllIndicators {
  return {
    bb20: null,
    bb4: null,
    bb4_1h: null,
    sma20: new Decimal("40000"),
    prevSma20: new Decimal("39900"),
    sma20_5m: null,
    sma60: new Decimal("39000"),
    sma120: new Decimal("38000"),
    ema20: new Decimal("40000"),
    ema60: new Decimal("39000"),
    ema120: new Decimal("38000"),
    rsi14: new Decimal("50"),
    atr14: new Decimal("100"),
    squeeze: "normal",
    ...overrides,
  };
}

function makeEvidence(): EvidenceResult {
  return {
    signalType: "ONE_B",
    direction: "LONG",
    entryPrice: new Decimal("40050"),
    slPrice: new Decimal("39500"),
    aGrade: false,
    details: {},
  };
}

function makeSafetyPassed(): SafetyResult {
  return { passed: true, reasons: [] };
}

function makeSafetyFailed(): SafetyResult {
  return { passed: false, reasons: ["wick_ratio_exceeded"] };
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

function makeKnnFail(): KnnDecisionResult {
  return {
    decision: "FAIL",
    winRate: 0.4,
    expectancy: -0.2,
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
// buildDeps — factory for a full mocked PipelineDeps
// ---------------------------------------------------------------------------

function buildDeps(overrides?: Partial<PipelineDeps>): PipelineDeps {
  // biome-ignore lint/suspicious/noExplicitAny: mock adapter needs loose typing
  const mockAdapter: any = {
    fetchBalance: mock(async () => ({
      total: new Decimal("10000"),
      available: new Decimal("10000"),
    })),
    fetchPositions: mock(async () => []),
    createOrder: mock(async () => ({
      orderId: "o1",
      exchangeOrderId: "eo1",
      status: "FILLED" as const,
      filledPrice: new Decimal("40050"),
      filledSize: new Decimal("0.1"),
      timestamp: new Date(),
    })),
    cancelOrder: mock(async () => {}),
    editOrder: mock(async () => ({
      orderId: "o2",
      exchangeOrderId: "eo2",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    fetchOrder: mock(async () => ({
      orderId: "o3",
      exchangeOrderId: "eo3",
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
    transfer: mock(async () => ({ id: "mock-transfer-id", status: "ok" })),
    fetchOHLCV: mock(async () => []),
  };

  const adapters = new Map([["binance" as Exchange, mockAdapter]]);

  // biome-ignore lint/suspicious/noExplicitAny: mock DB needs loose typing
  const mockDb: any = {};

  const defaultDeps: PipelineDeps = {
    db: mockDb,
    adapters,

    getCandles: mock(async () => [makeCandle()]),
    calcAllIndicators: mock(() => makeIndicators()),
    calcBB4: mock(() => null),
    getSymbolState: mock(async () => makeSymbolState()),

    determineDailyBias: mock(() => "NEUTRAL" as const),
    updateDailyBias: mock(async () => {}),
    isTradeBlocked: mock(async () => ({ blocked: false })),

    detectWatching: mock(() => null),
    getActiveWatchSession: mock(async () => null),
    openWatchSession: mock(async () => makeWatchSession()),
    invalidateWatchSession: mock(async () => {}),
    checkInvalidation: mock(() => null),
    updateWatchSessionTp: mock(async () => {}),

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
    loadKnnDecisionConfig: mock(async () => ({
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    })),
    loadTimeDecayConfig: mock(async () => ({})),

    getActiveTicket: mock(async () => null),
    canPyramid: mock(() => ({ allowed: false, reason: "max_count_reached" })),
    computeEntrySize: mock(async () => ({ size: new Decimal("0.1"), leverage: 10 })),
    createTicket: mock(async () => makeTicket()),

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
    checkAccountDailyLimit: mock(async () => ({
      allowed: true,
      totalLossesToday: new Decimal("0"),
      threshold: new Decimal("1000"),
    })),
    getBalance: mock(async () => new Decimal("10000")),

    // T-18-006: loss counter reset — no-op stubs
    resetExpiredLosses: mock(async () => ({
      dailyReset: false,
      sessionReset: false,
      hourlyReset: false,
    })),
    setSessionStartTime: mock(() => {}),

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

  return defaultDeps;
}

// Helper to get mock call count
function callCount(fn: unknown): number {
  return (fn as ReturnType<typeof mock>).mock.calls.length;
}

// Helper to get mock call args
function callArgs(fn: unknown, callIdx = 0): unknown[] {
  return ((fn as ReturnType<typeof mock>).mock.calls[callIdx] as unknown[]) ?? [];
}

// ---------------------------------------------------------------------------
// Clear recent 1M fired state between tests by ensuring a fresh delay
// ---------------------------------------------------------------------------

// The recent1MFired map is module-level state. We can reset it by waiting >60s
// or by calling the pipeline with symbols that differ each time. For simplicity
// use different symbol names in 1M/5M priority tests.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleCandleClose", () => {
  describe("symbol matching", () => {
    it("processes symbols matching candle symbol+exchange", async () => {
      const deps = buildDeps();
      const candle = makeCandle({ symbol: "BTCUSDT", exchange: "binance" });
      const activeSymbols: ActiveSymbol[] = [
        makeActiveSymbol({ symbol: "BTCUSDT", exchange: "binance" }),
        makeActiveSymbol({ symbol: "ETHUSDT", exchange: "binance" }),
      ];

      await handleCandleClose(candle, "5M", activeSymbols, deps);

      // getCandles should be called once (only BTCUSDT matches)
      expect(callCount(deps.getCandles)).toBe(1);
    });

    it("skips symbols that do not match candle symbol+exchange", async () => {
      const deps = buildDeps();
      const candle = makeCandle({ symbol: "BTCUSDT", exchange: "binance" });
      const activeSymbols: ActiveSymbol[] = [
        makeActiveSymbol({ symbol: "ETHUSDT", exchange: "binance" }),
      ];

      await handleCandleClose(candle, "5M", activeSymbols, deps);

      expect(callCount(deps.getCandles)).toBe(0);
    });

    it("processes multiple matching symbols independently", async () => {
      const deps = buildDeps();
      const candle = makeCandle({ symbol: "BTCUSDT", exchange: "binance" });
      const activeSymbols: ActiveSymbol[] = [
        makeActiveSymbol({ symbol: "BTCUSDT", exchange: "binance" }),
        makeActiveSymbol({ symbol: "BTCUSDT", exchange: "binance", executionMode: "live" }),
      ];

      await handleCandleClose(candle, "5M", activeSymbols, deps);

      // getCandles called twice — once per matching symbol
      expect(callCount(deps.getCandles)).toBe(2);
    });
  });

  describe("PIPELINE_LATENCY recording", () => {
    it("calls insertEvent with PIPELINE_LATENCY event type", async () => {
      const deps = buildDeps();
      const candle = makeCandle();
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      // insertEvent may be called for PIPELINE_LATENCY
      // It is fire-and-forget so we just verify it was called at least once
      // (processing also may call it for BIAS_CHANGE / WATCHING_START etc.)
      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const latencyCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "PIPELINE_LATENCY",
      );
      expect(latencyCall).toBeDefined();
    });

    it("includes symbolCount in PIPELINE_LATENCY data", async () => {
      const deps = buildDeps();
      const candle = makeCandle();
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      // Allow microtasks to flush (insertEvent is fire-and-forget)
      await new Promise((resolve) => setTimeout(resolve, 10));

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const latencyCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "PIPELINE_LATENCY",
      );
      expect(latencyCall).toBeDefined();
      const params = (latencyCall as unknown[])[1] as { data: { symbolCount: number } };
      expect(params.data.symbolCount).toBe(1);
    });
  });

  describe("error isolation", () => {
    it("continues processing symbol B when symbol A throws", async () => {
      let callsToGetCandles = 0;
      const deps = buildDeps({
        getCandles: mock(async (_db, symbol) => {
          callsToGetCandles++;
          if (symbol === "BTCUSDT" && callsToGetCandles === 1) {
            throw new Error("DB failure");
          }
          return [makeCandle()];
        }),
      });

      const candle = makeCandle({ symbol: "BTCUSDT", exchange: "binance" });
      const activeSymbols: ActiveSymbol[] = [
        makeActiveSymbol({ symbol: "BTCUSDT", exchange: "binance" }),
        makeActiveSymbol({ symbol: "BTCUSDT", exchange: "binance", executionMode: "live" }),
      ];

      // Should not throw even though first symbol fails
      await expect(
        handleCandleClose(candle, "5M", activeSymbols, deps),
      ).resolves.toBeUndefined();

      // Both symbols were attempted (2 calls)
      expect(callsToGetCandles).toBe(2);
    });

    it("calls sendSlackAlert when a symbol processing error occurs", async () => {
      const deps = buildDeps({
        getCandles: mock(async () => {
          throw new Error("test error");
        }),
      });

      const candle = makeCandle();
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      // Allow fire-and-forget to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount(deps.sendSlackAlert)).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 1D branch
  // ---------------------------------------------------------------------------

  describe("1D timeframe — daily bias", () => {
    it("calls determineDailyBias and updateDailyBias on 1D candle close", async () => {
      const deps = buildDeps({
        getCandles: mock(async () => [
          makeCandle({ timeframe: "1D" }),
          makeCandle({ timeframe: "1D" }),
        ]),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          sma20: new Decimal("40000"),
        })),
        determineDailyBias: mock(() => "LONG_ONLY" as const),
      });

      const candle = makeCandle({ timeframe: "1D" });
      await handleCandleClose(candle, "1D", [makeActiveSymbol()], deps);

      expect(callCount(deps.determineDailyBias)).toBe(1);
      expect(callCount(deps.updateDailyBias)).toBe(1);
    });

    it("inserts BIAS_CHANGE event after updating daily bias", async () => {
      const deps = buildDeps({
        getCandles: mock(async () => [
          makeCandle({ timeframe: "1D" }),
          makeCandle({ timeframe: "1D" }),
        ]),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          sma20: new Decimal("40000"),
        })),
        determineDailyBias: mock(() => "SHORT_ONLY" as const),
      });

      const candle = makeCandle({ timeframe: "1D" });
      await handleCandleClose(candle, "1D", [makeActiveSymbol()], deps);

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const biasCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "BIAS_CHANGE",
      );
      expect(biasCall).toBeDefined();
    });

    it("skips 1D processing when sma20 is null", async () => {
      const deps = buildDeps({
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          sma20: null,
        })),
      });

      const candle = makeCandle({ timeframe: "1D" });
      await handleCandleClose(candle, "1D", [makeActiveSymbol()], deps);

      expect(callCount(deps.determineDailyBias)).toBe(0);
      expect(callCount(deps.updateDailyBias)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 1H branch
  // ---------------------------------------------------------------------------

  describe("1H timeframe — watch session management", () => {
    it("calls detectWatching when no active session exists", async () => {
      const deps = buildDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "LONG_ONLY" })),
        detectWatching: mock(() => null),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.detectWatching)).toBe(1);
    });

    it("opens a new watch session when detectWatching returns a result", async () => {
      const watching = {
        detectionType: "BB4_TOUCH" as const,
        direction: "LONG" as const,
        tp1Price: new Decimal("41000"),
        tp2Price: new Decimal("42000"),
        contextData: {},
      };

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "LONG_ONLY" })),
        detectWatching: mock(() => watching),
        openWatchSession: mock(async () => makeWatchSession()),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.openWatchSession)).toBe(1);
    });

    it("inserts WATCHING_START event when a new session is opened", async () => {
      const watching = {
        detectionType: "SQUEEZE_BREAKOUT" as const,
        direction: "SHORT" as const,
        tp1Price: new Decimal("39000"),
        tp2Price: new Decimal("38000"),
        contextData: {},
      };

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "SHORT_ONLY" })),
        detectWatching: mock(() => watching),
        openWatchSession: mock(async () => makeWatchSession({ detection_type: "SQUEEZE_BREAKOUT" })),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const watchingCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "WATCHING_START",
      );
      expect(watchingCall).toBeDefined();
    });

    it("invalidates active session when checkInvalidation returns a reason", async () => {
      const deps = buildDeps({
        getActiveWatchSession: mock(async () => makeWatchSession()),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: "SHORT_ONLY" })),
        checkInvalidation: mock(() => "bias_changed"),
        invalidateWatchSession: mock(async () => {}),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.invalidateWatchSession)).toBe(1);
      const args = callArgs(deps.invalidateWatchSession);
      expect(args[2]).toBe("bias_changed");
    });

    it("does not open a new session when no daily bias is set", async () => {
      const deps = buildDeps({
        getActiveWatchSession: mock(async () => null),
        getSymbolState: mock(async () => makeSymbolState({ daily_bias: null })),
        detectWatching: mock(() => ({
          detectionType: "BB4_TOUCH" as const,
          direction: "LONG" as const,
          tp1Price: new Decimal("41000"),
          tp2Price: new Decimal("42000"),
          contextData: {},
        })),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.openWatchSession)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5M/1M branch — entry pipeline guard conditions
  // ---------------------------------------------------------------------------

  describe("5M/1M timeframe — entry pipeline", () => {
    it("returns early when isTradeBlocked is true", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: true, reason: "funding_window" })),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkEvidence)).toBe(0);
    });

    it("returns early when loss limit is violated", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () => makeSymbolState()),
        checkLossLimit: mock(() => ({ allowed: false, violations: ["DAILY"] as LossViolation[] })),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkEvidence)).toBe(0);
    });

    it("returns early when no active watch session exists", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => null),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkEvidence)).toBe(0);
    });

    it("returns early when checkEvidence returns null", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => null),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkSafety)).toBe(0);
    });

    it("returns early when checkSafety fails", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyFailed()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.vectorize)).toBe(0);
    });

    it("calls vectorize and insertVector when evidence + safety pass", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.vectorize)).toBe(1);
      expect(callCount(deps.insertVector)).toBe(1);
    });

    it("calls searchKnn after vectorize", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.searchKnn)).toBe(1);
      expect(callCount(deps.makeDecision)).toBe(1);
    });

    it("returns early when KNN decision is FAIL", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnFail()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.executeEntry)).toBe(0);
    });

    it("skips executeEntry in analysis mode", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ executionMode: "analysis" })], deps);

      expect(callCount(deps.executeEntry)).toBe(0);
    });

    it("calls executeEntry in live mode when KNN passes", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ executionMode: "live" })], deps);

      expect(callCount(deps.executeEntry)).toBe(1);
    });

    it("calls createTicket after a successful entry execution", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
        executeEntry: mock(async () => ({
          success: true,
          entryOrder: { filled_price: "40050" } as never,
          slOrder: null,
          aborted: false,
        })),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ executionMode: "live" })], deps);

      expect(callCount(deps.createTicket)).toBe(1);
    });

    it("does NOT call createTicket when entry is aborted", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
        executeEntry: mock(async () => ({
          success: false,
          entryOrder: null,
          slOrder: null,
          aborted: true,
          abortReason: "SL registration timed out",
        })),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ executionMode: "live" })], deps);

      expect(callCount(deps.createTicket)).toBe(0);
    });

    it("passes 1M timeframe to vectorize and insertVector", async () => {
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => makeEvidence()),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnFail()), // stop after KNN
        vectorize: mock(() => new Float32Array(202)),
      });

      const candle = makeCandle({ timeframe: "1M" });
      await handleCandleClose(candle, "1M", [makeActiveSymbol()], deps);

      expect(callCount(deps.vectorize)).toBe(1);
      const vecArgs = callArgs(deps.vectorize);
      expect(vecArgs[2]).toBe("1M");
    });
  });

  // ---------------------------------------------------------------------------
  // 1M priority rule
  // ---------------------------------------------------------------------------

  describe("1M priority rule", () => {
    it("skips 5M entry pipeline for the same symbol when 1M fires within TTL", async () => {
      // Use a unique symbol for this test to avoid cross-test state contamination
      const symbol = "PRIORITY_TEST_BTCUSDT";
      const exchange = "binance" as Exchange;

      let evidenceCallCount = 0;
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => {
          evidenceCallCount++;
          return null; // stop pipeline early
        }),
      });

      // First: fire 1M for this symbol
      const candle1M = makeCandle({ symbol, exchange, timeframe: "1M" });
      await handleCandleClose(candle1M, "1M", [makeActiveSymbol({ symbol, exchange })], deps);

      const after1MCount = evidenceCallCount;

      // Then immediately fire 5M for the same symbol
      const candle5M = makeCandle({ symbol, exchange, timeframe: "5M" });
      await handleCandleClose(candle5M, "5M", [makeActiveSymbol({ symbol, exchange })], deps);

      // The 5M pipeline should be skipped — evidenceCallCount should not increase
      expect(evidenceCallCount).toBe(after1MCount);
    });

    it("does NOT skip 5M for a different symbol even if 1M fired for another", async () => {
      const symbol1 = "BTC_SKIP_TEST_1";
      const symbol2 = "BTC_SKIP_TEST_2";
      const exchange = "binance" as Exchange;

      let evidenceCallCount = 0;
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => {
          evidenceCallCount++;
          return null;
        }),
      });

      // Fire 1M for symbol1
      const candle1M = makeCandle({ symbol: symbol1, exchange, timeframe: "1M" });
      await handleCandleClose(candle1M, "1M", [makeActiveSymbol({ symbol: symbol1, exchange })], deps);

      // Fire 5M for symbol2 — should NOT be skipped
      const candle5M = makeCandle({ symbol: symbol2, exchange, timeframe: "5M" });
      await handleCandleClose(candle5M, "5M", [makeActiveSymbol({ symbol: symbol2, exchange })], deps);

      // evidenceCallCount should be 2 (once for 1M symbol1, once for 5M symbol2)
      expect(evidenceCallCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Exit processing
  // ---------------------------------------------------------------------------

  describe("exit processing for open positions", () => {
    it("calls checkExit when there is an active ticket", async () => {
      const ticket = makeTicket();
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => makeExitNone()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkExit)).toBe(1);
    });

    it("does NOT call checkExit when there is no active ticket", async () => {
      const deps = buildDeps({
        getActiveTicket: mock(async () => null),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkExit)).toBe(0);
    });

    it("calls processExit when checkExit returns a non-NONE action", async () => {
      const ticket = makeTicket();
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => ({
          type: "TP1" as const,
          closeSize: new Decimal("0.05"),
          closeReason: "TP1" as const,
        })),
        processExit: mock(async () => ({
          success: true,
          closeOrder: null,
          slOrder: null,
          newState: "TP1_HIT",
          ticketUpdates: null,
        })),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.processExit)).toBe(1);
    });

    it("does NOT call processExit when checkExit returns NONE", async () => {
      const ticket = makeTicket();
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => makeExitNone()),
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.processExit)).toBe(0);
    });

    it("calls processTrailing when ticket has trailing_active=true on 1H candle (PRD §7.13)", async () => {
      const ticket = makeTicket({ trailing_active: true });
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => makeExitNone()),
        processTrailing: mock(async () => ({
          updated: false,
          newTrailingPrice: null,
          newMaxProfit: null,
          slOrder: null,
        })),
      });

      // Trailing SL update runs only on 1H candle close (PRD §7.13 — T-18-008)
      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(deps.processTrailing)).toBe(1);
    });

    it("does NOT call processTrailing when trailing_active=false", async () => {
      const ticket = makeTicket({ trailing_active: false });
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => makeExitNone()),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.processTrailing)).toBe(0);
    });

    it("calls updateMfeMae when ticket has non-null MFE and MAE", async () => {
      const ticket = makeTicket({
        max_favorable: new Decimal("500"),
        max_adverse: new Decimal("-200"),
      });
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => makeExitNone()),
        updateMfeMae: mock(() => ({ max_favorable: "500", max_adverse: "-200" })),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(callCount(deps.updateMfeMae)).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // All timeframes: exit runs on 1D candle close too
  // ---------------------------------------------------------------------------

  describe("exit processing applies to all timeframes", () => {
    it("calls checkExit even for 1D candle close when ticket is active", async () => {
      const ticket = makeTicket();
      const deps = buildDeps({
        getActiveTicket: mock(async () => ticket),
        checkExit: mock(() => makeExitNone()),
        // 1D processing needs sma20
        getCandles: mock(async () => [makeCandle({ timeframe: "1D" }), makeCandle({ timeframe: "1D" })]),
        calcAllIndicators: mock(() => ({ ...makeIndicators(), sma20: new Decimal("40000") })),
      });

      const candle = makeCandle({ timeframe: "1D" });
      await handleCandleClose(candle, "1D", [makeActiveSymbol()], deps);

      expect(callCount(deps.checkExit)).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 1H BB4 injection into processEntry()
  // ---------------------------------------------------------------------------

  describe("1H BB4 injection — a_grade activation", () => {
    // Helper: make a realistic candle array (>=4) to simulate 1H history
    function make1HCandles(count: number): Candle[] {
      return Array.from({ length: count }, (_, i) =>
        makeCandle({ timeframe: "1H", id: `1h-candle-${i}` }),
      );
    }

    const bb4_1h_result = {
      upper: new Decimal("41000"),
      middle: new Decimal("40500"),
      lower: new Decimal("40000"),
      bandwidth: new Decimal("0.025"),
      percentB: new Decimal("0.5"),
    };

    it("injects bb4_1h into indicators when 1H candles >= 4 and calcBB4 returns a value", async () => {
      // Use a unique symbol to avoid recent1MFired module-level state contamination
      const symbol = "BB4_INJECT_TEST_1";
      let capturedIndicators: AllIndicators | null = null;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        // Return 4 1H candles for the "1H" timeframe call; regular candles otherwise
        getCandles: mock(async (_db: unknown, _symbol: unknown, _exchange: unknown, tf: unknown) => {
          if (tf === "1H") return make1HCandles(4);
          return [makeCandle({ symbol })];
        }),
        calcBB4: mock(() => bb4_1h_result),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null; // stop pipeline early
        }),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      expect(capturedIndicators).not.toBeNull();
      expect((capturedIndicators as unknown as AllIndicators).bb4_1h).not.toBeNull();
      expect((capturedIndicators as unknown as AllIndicators).bb4_1h?.upper.toString()).toBe("41000");
      expect((capturedIndicators as unknown as AllIndicators).bb4_1h?.lower.toString()).toBe("40000");
    });

    it("leaves bb4_1h as null when 1H candles < 4", async () => {
      const symbol = "BB4_INJECT_TEST_2";
      let capturedIndicators: AllIndicators | null = null;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        // Return only 3 1H candles — insufficient for BB4
        getCandles: mock(async (_db: unknown, _symbol: unknown, _exchange: unknown, tf: unknown) => {
          if (tf === "1H") return make1HCandles(3);
          return [makeCandle({ symbol })];
        }),
        calcBB4: mock(() => bb4_1h_result),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null;
        }),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      expect(capturedIndicators).not.toBeNull();
      expect((capturedIndicators as unknown as AllIndicators).bb4_1h).toBeNull();
    });

    it("leaves bb4_1h as null when calcBB4 returns null despite sufficient candles", async () => {
      const symbol = "BB4_INJECT_TEST_3";
      let capturedIndicators: AllIndicators | null = null;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        getCandles: mock(async (_db: unknown, _symbol: unknown, _exchange: unknown, tf: unknown) => {
          if (tf === "1H") return make1HCandles(6);
          return [makeCandle({ symbol })];
        }),
        calcBB4: mock(() => null), // calcBB4 returns null (warm-up / NaN guard)
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null;
        }),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      expect(capturedIndicators).not.toBeNull();
      expect((capturedIndicators as unknown as AllIndicators).bb4_1h).toBeNull();
    });

    it("passes indicators with bb4_1h to checkEvidence — enabling aGrade=true for LONG BB4 lower touch", async () => {
      const symbol = "BB4_INJECT_TEST_4";
      // Candle with low <= bb4_1h_lower (40000) — pipeline wires bb4_1h so evidence gate can set aGrade=true
      const candle = makeCandle({
        symbol,
        timeframe: "5M",
        low: new Decimal("39999"), // touches bb4_1h lower
        close: new Decimal("40050"),
      });

      let capturedIndicators: AllIndicators | null = null;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol, direction: "LONG" })),
        getCandles: mock(async (_db: unknown, _symbol: unknown, _exchange: unknown, tf: unknown) => {
          if (tf === "1H") return make1HCandles(5);
          return [makeCandle({ symbol })];
        }),
        calcBB4: mock(() => bb4_1h_result),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null; // stop — we only need to verify indicators contain bb4_1h
        }),
      });

      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      // Verify bb4_1h was injected before checkEvidence was called
      expect((capturedIndicators as AllIndicators | null)?.bb4_1h).not.toBeNull();
      expect((capturedIndicators as AllIndicators | null)?.bb4_1h?.lower.toString()).toBe("40000");
    });

    it("does not inject bb4_1h when processEntry returns early before watch session check", async () => {
      // Trade blocked → returns before reaching bb4_1h injection code
      let calcBB4CallCount = 0;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: true, reason: "funding_window" })),
        calcBB4: mock(() => {
          calcBB4CallCount++;
          return bb4_1h_result;
        }),
      });

      const candle = makeCandle({ timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol()], deps);

      expect(calcBB4CallCount).toBe(0);
    });

    it("works identically for 1M timeframe entries", async () => {
      let capturedIndicators: AllIndicators | null = null;
      const symbol = "BB4_1M_TEST";

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        getCandles: mock(async (_db: unknown, _symbol: unknown, _exchange: unknown, tf: unknown) => {
          if (tf === "1H") return make1HCandles(4);
          return [makeCandle({ symbol })];
        }),
        calcBB4: mock(() => bb4_1h_result),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null;
        }),
      });

      const candle = makeCandle({ timeframe: "1M", symbol });
      await handleCandleClose(candle, "1M", [makeActiveSymbol({ symbol })], deps);

      expect((capturedIndicators as AllIndicators | null)?.bb4_1h).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 1H TP refresh — DB persistence
  // ---------------------------------------------------------------------------

  describe("1H TP refresh — updateWatchSessionTp", () => {
    const bb20WithBands = {
      upper: new Decimal("42000"),
      middle: new Decimal("41000"),
      lower: new Decimal("40000"),
      bandwidth: new Decimal("0.05"),
      percentB: new Decimal("0.5"),
    };

    it("calls updateWatchSessionTp for SQUEEZE_BREAKOUT LONG session with new tp1=bb20Upper", async () => {
      const session = makeWatchSession({
        detection_type: "SQUEEZE_BREAKOUT",
        direction: "LONG",
        tp1_price: new Decimal("39000"), // old value — will change
        tp2_price: new Decimal("38000"),
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: bb20WithBands,
          sma20: new Decimal("41000"),
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(1);
      const args = callArgs(updateWatchSessionTpMock);
      // args[1] = sessionId, args[2] = tp1, args[3] = tp2
      expect(args[1]).toBe("session-1");
      // tp1 = bb20Upper (LONG → upper) = 42000
      expect((args[2] as Decimal).toString()).toBe("42000");
    });

    it("calls updateWatchSessionTp for SQUEEZE_BREAKOUT SHORT session with new tp1=bb20Lower", async () => {
      const session = makeWatchSession({
        detection_type: "SQUEEZE_BREAKOUT",
        direction: "SHORT",
        tp1_price: new Decimal("43000"), // old value
        tp2_price: new Decimal("44000"),
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: bb20WithBands,
          sma20: new Decimal("41000"),
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(1);
      const args = callArgs(updateWatchSessionTpMock);
      // tp1 = bb20Lower (SHORT → lower) = 40000
      expect((args[2] as Decimal).toString()).toBe("40000");
    });

    it("calls updateWatchSessionTp for BB4_TOUCH session with tp1=sma20 and tp2=bb20Upper", async () => {
      const session = makeWatchSession({
        detection_type: "BB4_TOUCH",
        direction: "LONG",
        tp1_price: new Decimal("39500"), // old value
        tp2_price: new Decimal("40000"), // old value
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: bb20WithBands,
          sma20: new Decimal("41000"),
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(1);
      const args = callArgs(updateWatchSessionTpMock);
      // tp1 = sma20 = 41000, tp2 = bb20Upper (LONG) = 42000
      expect((args[2] as Decimal).toString()).toBe("41000");
      expect((args[3] as Decimal).toString()).toBe("42000");
    });

    it("does NOT call updateWatchSessionTp for SR_CONFLUENCE session", async () => {
      const session = makeWatchSession({
        detection_type: "SR_CONFLUENCE",
        direction: "LONG",
        tp1_price: new Decimal("41000"),
        tp2_price: new Decimal("42000"),
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: bb20WithBands,
          sma20: new Decimal("41000"),
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(0);
    });

    it("does NOT call updateWatchSessionTp when indicators.bb20 is null", async () => {
      const session = makeWatchSession({
        detection_type: "SQUEEZE_BREAKOUT",
        direction: "LONG",
        tp1_price: new Decimal("41000"),
        tp2_price: new Decimal("42000"),
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: null, // insufficient data
          sma20: new Decimal("41000"),
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(0);
    });

    it("does NOT call updateWatchSessionTp when indicators.sma20 is null", async () => {
      const session = makeWatchSession({
        detection_type: "BB4_TOUCH",
        direction: "LONG",
        tp1_price: new Decimal("41000"),
        tp2_price: new Decimal("42000"),
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: bb20WithBands,
          sma20: null, // insufficient data
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(0);
    });

    it("does NOT call updateWatchSessionTp when no active session exists", async () => {
      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => null),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(0);
    });

    it("does NOT call updateWatchSessionTp when TP values are unchanged", async () => {
      // Session already has the current computed TP values — skip the write
      const session = makeWatchSession({
        detection_type: "BB4_TOUCH",
        direction: "LONG",
        tp1_price: new Decimal("41000"), // matches sma20
        tp2_price: new Decimal("42000"), // matches bb20Upper
      });

      const updateWatchSessionTpMock = mock(async () => {});

      const deps = buildDeps({
        getActiveWatchSession: mock(async () => session),
        checkInvalidation: mock(() => null),
        calcAllIndicators: mock(() => ({
          ...makeIndicators(),
          bb20: bb20WithBands,
          sma20: new Decimal("41000"),
        })),
        updateWatchSessionTp: updateWatchSessionTpMock,
      });

      const candle = makeCandle({ timeframe: "1H" });
      await handleCandleClose(candle, "1H", [makeActiveSymbol()], deps);

      expect(callCount(updateWatchSessionTpMock)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // daily_bias cross-validation (step 9b) — after KNN PASS, before analysis mode
  // ---------------------------------------------------------------------------

  describe("daily_bias cross-validation — post-KNN PASS", () => {
    // Shared helper: build deps that reach the daily_bias check.
    // KNN always PASSes; execution mode is "analysis" so executeEntry is never called.
    function buildBiasCheckDeps(
      dailyBias: SymbolState["daily_bias"],
      evidenceDirection: "LONG" | "SHORT",
    ): PipelineDeps {
      const symbol = `BIAS_CHECK_${dailyBias}_${evidenceDirection}`;
      return buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () => makeSymbolState({ symbol, daily_bias: dailyBias })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: evidenceDirection })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });
    }

    it("skips entry when daily_bias=LONG_ONLY and evidence.direction=SHORT (KNN PASS)", async () => {
      const symbol = "BIAS_CHECK_LONG_ONLY_SHORT";
      const deps = buildBiasCheckDeps("LONG_ONLY", "SHORT");

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "live" })],
        deps,
      );

      // executeEntry must NOT be called — pipeline returned before analysis mode check
      expect(callCount(deps.executeEntry)).toBe(0);
    });

    it("inserts DAILY_BIAS_MISMATCH event when LONG_ONLY + SHORT evidence", async () => {
      const symbol = "BIAS_EVENT_LONG_ONLY_SHORT";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () =>
          makeSymbolState({ symbol, daily_bias: "LONG_ONLY" }),
        ),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: "SHORT" as const })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeDefined();
    });

    it("skips entry when daily_bias=SHORT_ONLY and evidence.direction=LONG (KNN PASS)", async () => {
      const symbol = "BIAS_CHECK_SHORT_ONLY_LONG";
      const deps = buildBiasCheckDeps("SHORT_ONLY", "LONG");

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "live" })],
        deps,
      );

      expect(callCount(deps.executeEntry)).toBe(0);
    });

    it("proceeds to execution when daily_bias=LONG_ONLY and evidence.direction=LONG", async () => {
      const symbol = "BIAS_CHECK_LONG_ONLY_LONG";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () =>
          makeSymbolState({ symbol, daily_bias: "LONG_ONLY" }),
        ),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: "LONG" as const })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "analysis" })],
        deps,
      );

      // Pipeline proceeds past bias check; analysis mode skip prevents executeEntry,
      // but executeEntry call count of 0 is ambiguous — verify no DAILY_BIAS_MISMATCH event.
      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeUndefined();
    });

    it("proceeds to execution when daily_bias=SHORT_ONLY and evidence.direction=SHORT", async () => {
      const symbol = "BIAS_CHECK_SHORT_ONLY_SHORT";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () =>
          makeSymbolState({ symbol, daily_bias: "SHORT_ONLY" }),
        ),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({
          ...makeEvidence(),
          direction: "SHORT" as const,
          slPrice: new Decimal("40500"),
        })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "analysis" })],
        deps,
      );

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeUndefined();
    });

    it("proceeds when daily_bias=NEUTRAL regardless of evidence direction", async () => {
      const symbol = "BIAS_CHECK_NEUTRAL";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () =>
          makeSymbolState({ symbol, daily_bias: "NEUTRAL" }),
        ),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: "SHORT" as const })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "analysis" })],
        deps,
      );

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeUndefined();
    });

    it("proceeds when daily_bias=null regardless of evidence direction", async () => {
      const symbol = "BIAS_CHECK_NULL";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () =>
          makeSymbolState({ symbol, daily_bias: null }),
        ),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: "SHORT" as const })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "analysis" })],
        deps,
      );

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeUndefined();
    });

    it("proceeds when symbolState is null (no bias available)", async () => {
      const symbol = "BIAS_CHECK_NO_STATE";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () => null),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: "SHORT" as const })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnPass()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(
        candle,
        "5M",
        [makeActiveSymbol({ symbol, executionMode: "analysis" })],
        deps,
      );

      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeUndefined();
    });

    it("bias check does not fire when KNN decision is FAIL (check is post-KNN)", async () => {
      const symbol = "BIAS_CHECK_AFTER_KNN_FAIL";
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getSymbolState: mock(async () =>
          makeSymbolState({ symbol, daily_bias: "LONG_ONLY" }),
        ),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock(() => ({ ...makeEvidence(), direction: "SHORT" as const })),
        checkSafety: mock(() => makeSafetyPassed()),
        makeDecision: mock(() => makeKnnFail()),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      // Pipeline exits at KNN check — no DAILY_BIAS_MISMATCH event should be inserted
      const insertEventMock = deps.insertEvent as ReturnType<typeof mock>;
      const mismatchCall = insertEventMock.mock.calls.find(
        (args) => (args[1] as { event_type: string }).event_type === "DAILY_BIAS_MISMATCH",
      );
      expect(mismatchCall).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5M SMA20 injection for 1M noise filter (PRD §7.7)
  // ---------------------------------------------------------------------------

  describe("1M noise filter — 5M SMA20 injection", () => {
    it("injects sma20_5m into indicators when processing 1M candle", async () => {
      const symbol = "NOISE_5M_INJECT_1";
      let capturedIndicators: AllIndicators | null = null;

      const sma20_5mValue = new Decimal("40500");

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        // Return different indicators for 5M vs other timeframes
        getCandles: mock(async (_db: unknown, _sym: unknown, _exc: unknown, tf: unknown) => {
          return [makeCandle({ symbol, timeframe: tf as Timeframe })];
        }),
        calcAllIndicators: mock((candles: Candle[]) => {
          const tf = candles[0]?.timeframe;
          if (tf === "5M") {
            return makeIndicators({ sma20: sma20_5mValue });
          }
          return makeIndicators({ sma20: new Decimal("40000") });
        }),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null; // stop pipeline early
        }),
      });

      const candle = makeCandle({ symbol, timeframe: "1M" });
      await handleCandleClose(candle, "1M", [makeActiveSymbol({ symbol })], deps);

      expect(capturedIndicators).not.toBeNull();
      expect((capturedIndicators as unknown as AllIndicators).sma20_5m?.toString()).toBe("40500");
    });

    it("does NOT inject sma20_5m when processing 5M candle", async () => {
      const symbol = "NOISE_5M_INJECT_2";
      let capturedIndicators: AllIndicators | null = null;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null;
        }),
      });

      const candle = makeCandle({ symbol, timeframe: "5M" });
      await handleCandleClose(candle, "5M", [makeActiveSymbol({ symbol })], deps);

      expect(capturedIndicators).not.toBeNull();
      // sma20_5m should remain null — not injected for 5M timeframe
      expect((capturedIndicators as unknown as AllIndicators).sma20_5m).toBeNull();
    });

    it("sma20_5m is null when 5M indicator returns null sma20", async () => {
      const symbol = "NOISE_5M_INJECT_3";
      let capturedIndicators: AllIndicators | null = null;

      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession({ symbol })),
        calcAllIndicators: mock(() => makeIndicators({ sma20: null })),
        checkEvidence: mock((_c: unknown, indicators: AllIndicators) => {
          capturedIndicators = indicators;
          return null;
        }),
      });

      const candle = makeCandle({ symbol, timeframe: "1M" });
      await handleCandleClose(candle, "1M", [makeActiveSymbol({ symbol })], deps);

      expect(capturedIndicators).not.toBeNull();
      expect((capturedIndicators as unknown as AllIndicators).sma20_5m).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Simultaneous 5M/1M signal suppression (PRD §7.16)
  // ---------------------------------------------------------------------------

  describe("simultaneous signal suppression — 1M priority (PRD §7.16)", () => {
    it("suppresses 5M entry when 1M fires for the same symbol in the same cycle", async () => {
      // Use a unique symbol to avoid cross-test state contamination with recent1MFired map.
      const symbol = "SIMULTANEOUS_TEST_SYMBOL_1";
      const exchange = "binance" as Exchange;

      let evidenceCallCount = 0;
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => {
          evidenceCallCount++;
          return null;
        }),
      });

      // Fire 1M first (marks symbol in recent1MFired)
      const candle1M = makeCandle({ symbol, exchange, timeframe: "1M" });
      await handleCandleClose(candle1M, "1M", [makeActiveSymbol({ symbol, exchange })], deps);

      const countAfter1M = evidenceCallCount;

      // Immediately fire 5M for the same symbol — should be suppressed
      const candle5M = makeCandle({ symbol, exchange, timeframe: "5M" });
      await handleCandleClose(candle5M, "5M", [makeActiveSymbol({ symbol, exchange })], deps);

      // 5M pipeline should have been skipped — evidenceCallCount unchanged
      expect(evidenceCallCount).toBe(countAfter1M);
    });

    it("allows both signals when they are for different symbols", async () => {
      const symbol5M = "SIMULTANEOUS_DIFF_SYMBOL_5M";
      const symbol1M = "SIMULTANEOUS_DIFF_SYMBOL_1M";
      const exchange = "binance" as Exchange;

      let evidenceCallCount = 0;
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => {
          evidenceCallCount++;
          return null;
        }),
      });

      // Fire 1M for symbol1M
      const candle1M = makeCandle({ symbol: symbol1M, exchange, timeframe: "1M" });
      await handleCandleClose(candle1M, "1M", [makeActiveSymbol({ symbol: symbol1M, exchange })], deps);

      // Fire 5M for symbol5M — different symbol, should NOT be suppressed
      const candle5M = makeCandle({ symbol: symbol5M, exchange, timeframe: "5M" });
      await handleCandleClose(candle5M, "5M", [makeActiveSymbol({ symbol: symbol5M, exchange })], deps);

      // Both 1M (symbol1M) and 5M (symbol5M) should have called checkEvidence
      expect(evidenceCallCount).toBe(2);
    });

    it("executes 1M signal normally when no 5M was pending", async () => {
      const symbol = "SIMULTANEOUS_1M_ONLY";
      const exchange = "binance" as Exchange;

      let evidenceCallCount = 0;
      const deps = buildDeps({
        isTradeBlocked: mock(async () => ({ blocked: false })),
        getActiveWatchSession: mock(async () => makeWatchSession()),
        checkEvidence: mock(() => {
          evidenceCallCount++;
          return null;
        }),
      });

      const candle1M = makeCandle({ symbol, exchange, timeframe: "1M" });
      await handleCandleClose(candle1M, "1M", [makeActiveSymbol({ symbol, exchange })], deps);

      // 1M should proceed normally
      expect(evidenceCallCount).toBe(1);
    });
  });
});
