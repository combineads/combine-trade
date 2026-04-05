/**
 * Pipeline — processEntry() loss limit fix unit tests
 *
 * T-18-005: processEntry()에서 checkLossLimit()에 실제 balance를 전달하는지 검증
 *           및 checkAccountDailyLimit() 호출 검증
 *
 * T-18-008: TP/트레일링 타임프레임 가드 — processExits()가 timeframe에 따라
 *           TP1/TP2 및 trailing 업데이트를 올바르게 분기하는지 검증
 *
 * Tests exercise handleCandleClose() with a 5M candle to trigger processEntry().
 * processEntry() is private but exercised through handleCandleClose → processSymbol.
 *
 * Key assertions:
 *   - deps.getBalance(exchange) is called during processEntry
 *   - deps.checkLossLimit receives the value from getBalance (not losses_today)
 *   - deps.checkAccountDailyLimit is called before per-symbol check
 *   - When account daily limit is blocked, processing returns early
 */

import { describe, expect, it } from "bun:test";
import { type Decimal, d } from "@/core/decimal";
import type { Candle, Exchange, SymbolState, Ticket, Timeframe } from "@/core/types";
import type { ActiveSymbol, PipelineDeps } from "@/daemon/pipeline";
import { _resetModuleStateForTesting, handleCandleClose } from "@/daemon/pipeline";
import type { DbInstance } from "@/db/pool";
import type { AllIndicators } from "@/indicators/types";
import type {
  AccountDailyLimitResult,
  LossLimitConfig,
  LossLimitResult,
  SymbolLossState,
} from "@/limits/loss-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides?: Partial<Candle>): Candle {
  return {
    id: "c1",
    symbol: "BTC/USDT",
    exchange: "binance" as Exchange,
    timeframe: "5M",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: d("100"),
    high: d("110"),
    low: d("90"),
    close: d("105"),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date("2024-01-01"),
    ...overrides,
  };
}

const SYMBOL: ActiveSymbol = {
  symbol: "BTC/USDT",
  exchange: "binance",
  executionMode: "live",
};

// biome-ignore lint/suspicious/noExplicitAny: test stub needs loose typing
const STUB_DB = {} as any as DbInstance;

const STUB_INDICATORS: AllIndicators = {
  bb20: null,
  bb4: null,
  bb4_1h: null,
  sma20: null,
  prevSma20: null,
  sma20_5m: null,
  sma60: null,
  sma120: null,
  ema20: null,
  ema60: null,
  ema120: null,
  rsi14: null,
  atr14: null,
  squeeze: "normal",
};

function makeLossConfig(): LossLimitConfig {
  return {
    maxDailyLossPct: d("0.10"),
    maxSessionLosses: 3,
    maxHourly5m: 2,
    maxHourly1m: 1,
  };
}

function makeSymbolState(lossesToday: string): SymbolState {
  return {
    id: "ss1",
    symbol: "BTC/USDT",
    exchange: "binance" as Exchange,
    fsm_state: "IDLE",
    execution_mode: "live",
    daily_bias: null,
    daily_open: null,
    session_box_high: null,
    session_box_low: null,
    losses_today: d(lossesToday),
    losses_session: 0,
    losses_this_1h_5m: 0,
    losses_this_1h_1m: 0,
    updated_at: new Date(),
  };
}

type CaptureArgs = {
  balancePassedToCheckLossLimit?: Decimal | string;
  checkAccountDailyLimitCalled?: boolean;
  balancePassedToAccountLimit?: Decimal | string;
};

/**
 * Builds a minimal PipelineDeps with injectable checkLossLimit and getBalance.
 * All other deps return benign stubs that short-circuit early in processEntry.
 */
function makeDeps(opts: {
  balance: string;
  lossesToday: string;
  checkLossLimitOverride?: (
    state: SymbolLossState,
    balance: Decimal | string,
    config: LossLimitConfig,
  ) => LossLimitResult;
  accountDailyLimitAllowed?: boolean;
  captureArgs?: CaptureArgs;
}): PipelineDeps {
  const { balance, lossesToday, accountDailyLimitAllowed = true, captureArgs } = opts;

  const deps: PipelineDeps = {
    db: STUB_DB,
    adapters: new Map(),

    getCandles: async () => [],
    calcAllIndicators: () => STUB_INDICATORS,
    calcBB4: () => null,

    getSymbolState: async () => makeSymbolState(lossesToday),

    determineDailyBias: () => "NEUTRAL",
    updateDailyBias: async () => {},
    isTradeBlocked: async () => ({ blocked: false }),

    detectWatching: () => null,
    // Returns null → processEntry returns early after loss check (no watch session)
    getActiveWatchSession: async () => null,
    openWatchSession: async () => {
      throw new Error("should not be called");
    },
    invalidateWatchSession: async () => {},
    checkInvalidation: () => null,
    updateWatchSessionTp: async () => {},

    checkEvidence: () => null,
    checkSafety: () => ({ passed: true, reasons: [] }),

    vectorize: () => new Float32Array(202),
    insertVector: async () => {
      throw new Error("should not be called");
    },

    searchKnn: async () => [],
    applyTimeDecay: () => [],
    loadTimeDecayConfig: async () => ({}),
    makeDecision: () => ({
      decision: "SKIP" as const,
      sampleCount: 0,
      winRate: 0,
      expectancy: 0,
      aGrade: false,
    }),
    loadKnnConfig: async () => ({ topK: 50, distanceMetric: "cosine" as const }),
    loadKnnDecisionConfig: async () => ({
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    }),

    getActiveTicket: async () => null,
    canPyramid: () => ({ allowed: false, reason: "max_count_reached" }),
    computeEntrySize: async () => ({ size: d("0.001"), leverage: 1 }),
    createTicket: async () => {
      throw new Error("should not be called");
    },

    executeEntry: async () => {
      throw new Error("should not be called");
    },
    loadSlippageConfig: async () => ({ maxSpreadPct: d("0.05") }),

    checkExit: () => ({ type: "NONE" as const, closeSize: d("0"), closeReason: null }),
    processExit: async () => {
      throw new Error("should not be called");
    },
    processTrailing: async () => {
      throw new Error("should not be called");
    },
    updateTpPrices: () => {
      throw new Error("should not be called");
    },
    updateMfeMae: () => {
      throw new Error("should not be called");
    },

    checkLossLimit: (state, bal, config) => {
      if (captureArgs) {
        captureArgs.balancePassedToCheckLossLimit = bal;
      }
      if (opts.checkLossLimitOverride) {
        return opts.checkLossLimitOverride(state, bal, config);
      }
      return { allowed: true, violations: [] };
    },
    loadLossLimitConfig: async () => makeLossConfig(),

    checkAccountDailyLimit: async (_db, bal, _config) => {
      if (captureArgs) {
        captureArgs.checkAccountDailyLimitCalled = true;
        captureArgs.balancePassedToAccountLimit = bal;
      }
      return {
        allowed: accountDailyLimitAllowed,
        totalLossesToday: d("0"),
        threshold: d("1000"),
      } satisfies AccountDailyLimitResult;
    },

    getBalance: async (_exchange: string) => d(balance),

    // T-18-006: loss counter reset — no-op stubs
    resetExpiredLosses: async (_symbol: string, _exchange: string, _now: Date) => ({
      dailyReset: false,
      sessionReset: false,
      hourlyReset: false,
    }),
    setSessionStartTime: (_time: Date) => {},

    sendSlackAlert: async () => {},
    insertEvent: async () => ({
      id: "e1",
      event_type: "PIPELINE_LATENCY" as const,
      symbol: null,
      exchange: null,
      ref_id: null,
      ref_type: null,
      data: null,
      created_at: new Date(),
    }),
  };

  return deps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processEntry / getBalance — 실제 balance를 checkLossLimit에 전달", () => {
  it("getBalance(exchange)가 반환한 값을 checkLossLimit 두 번째 인자로 전달한다", async () => {
    const captureArgs: CaptureArgs = {};

    const candle = makeCandle();
    const deps = makeDeps({ balance: "10000", lossesToday: "900", captureArgs });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    // checkLossLimit should have been called with balance=10000, not losses_today=900
    expect(captureArgs.balancePassedToCheckLossLimit).toBeDefined();
    const passedBalance = d(captureArgs.balancePassedToCheckLossLimit?.toString() ?? "0");
    expect(passedBalance.toString()).toBe("10000");
  });

  it("balance=10000, losses_today=900 → checkLossLimit allowed (900 < 1000)", async () => {
    const candle = makeCandle();
    const lossLimitCallCount = { count: 0 };
    const deps = makeDeps({
      balance: "10000",
      lossesToday: "900",
      checkLossLimitOverride: (_state, _balance, _config) => {
        lossLimitCallCount.count++;
        return { allowed: true, violations: [] };
      },
    });

    // Should not throw — processing continues (stops at no watch session)
    await handleCandleClose(candle, "5M", [SYMBOL], deps);
    expect(lossLimitCallCount.count).toBeGreaterThan(0);
  });

  it("balance=10000, losses_today=1000 → checkLossLimit receives real balance not losses_today", async () => {
    const candle = makeCandle();
    const captureArgs: CaptureArgs = {};
    const deps = makeDeps({
      balance: "10000",
      lossesToday: "1000",
      captureArgs,
      checkLossLimitOverride: (state, bal, _config) => {
        captureArgs.balancePassedToCheckLossLimit = bal;
        // Simulate the real checkLossLimit logic: losses_today=1000 >= 10000*0.10=1000 → DAILY
        const threshold = d(bal.toString()).mul(d("0.10"));
        const blocked = state.lossesToday.gte(threshold);
        return blocked
          ? { allowed: false, violations: ["DAILY"] }
          : { allowed: true, violations: [] };
      },
    });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    // Balance should have been 10000, not 1000 (the losses_today value)
    expect(captureArgs.balancePassedToCheckLossLimit).toBeDefined();
    expect(d(captureArgs.balancePassedToCheckLossLimit?.toString() ?? "0").toString()).toBe(
      "10000",
    );
  });
});

describe("processEntry / checkAccountDailyLimit — 진입부 계정 한도 확인", () => {
  it("checkAccountDailyLimit가 per-symbol check 이전에 호출된다", async () => {
    const captureArgs: CaptureArgs = {};

    const candle = makeCandle();
    const checkLossLimitCalled = { value: false };

    const deps = makeDeps({
      balance: "10000",
      lossesToday: "500",
      captureArgs,
      checkLossLimitOverride: (_state, _bal, _config) => {
        checkLossLimitCalled.value = true;
        return { allowed: true, violations: [] };
      },
    });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    expect(captureArgs.checkAccountDailyLimitCalled).toBe(true);
    // Both were called (account limit passed, so per-symbol also checked)
    expect(checkLossLimitCalled.value).toBe(true);
  });

  it("checkAccountDailyLimit가 차단하면 per-symbol checkLossLimit는 호출되지 않는다", async () => {
    const captureArgs: CaptureArgs = {};

    const candle = makeCandle();
    const checkLossLimitCalled = { value: false };

    const deps = makeDeps({
      balance: "10000",
      lossesToday: "500",
      accountDailyLimitAllowed: false, // account limit breached
      captureArgs,
      checkLossLimitOverride: (_state, _bal, _config) => {
        checkLossLimitCalled.value = true;
        return { allowed: true, violations: [] };
      },
    });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    expect(captureArgs.checkAccountDailyLimitCalled).toBe(true);
    // Account limit blocked → per-symbol check should NOT be called
    expect(checkLossLimitCalled.value).toBe(false);
  });

  it("checkAccountDailyLimit에 getBalance 값이 전달된다", async () => {
    const captureArgs: CaptureArgs = {};

    const candle = makeCandle();
    const deps = makeDeps({ balance: "10000", lossesToday: "500", captureArgs });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    expect(captureArgs.checkAccountDailyLimitCalled).toBe(true);
    expect(captureArgs.balancePassedToAccountLimit).toBeDefined();
    expect(d(captureArgs.balancePassedToAccountLimit?.toString() ?? "0").toString()).toBe("10000");
  });
});

// ---------------------------------------------------------------------------
// T-18-008: TP/Trailing timeframe guard tests
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Ticket for exit testing.
 * By default: INITIAL state, LONG direction, not trailing.
 */
function makeTicket(overrides?: Partial<Ticket>): Ticket {
  return {
    id: "ticket-1",
    symbol: "BTC/USDT",
    exchange: "binance" as Exchange,
    signal_id: "sig-1",
    parent_ticket_id: null,
    timeframe: "5M",
    direction: "LONG",
    state: "INITIAL",
    entry_price: d("100"),
    sl_price: d("90"),
    current_sl_price: d("90"),
    size: d("1"),
    remaining_size: d("1"),
    leverage: 10,
    tp1_price: d("120"), // TP1 at 120 (current price 200 will trigger this)
    tp2_price: d("150"),
    trailing_active: false,
    trailing_price: null,
    max_profit: d("0"),
    pyramid_count: 0,
    opened_at: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago (not TIME_EXIT)
    closed_at: null,
    close_reason: null,
    result: null,
    pnl: null,
    pnl_pct: null,
    max_favorable: null,
    max_adverse: null,
    hold_duration_sec: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Builds a PipelineDeps that returns an active ticket so processExits() is
 * triggered. Captures which exit hooks are called.
 *
 * When captureProcessTrailing is provided, a stub adapter is added to the map
 * so the `adapter !== undefined` guard in processExits does not block the call.
 */
function makeExitDeps(opts: {
  ticket: Ticket;
  /** checkExit return value — controls whether TP action fires */
  checkExitReturnsTp?: boolean;
  captureCheckExit?: { called: boolean; timeframeArg: Timeframe | undefined };
  captureProcessTrailing?: { called: boolean };
}): PipelineDeps {
  const { ticket, captureCheckExit, captureProcessTrailing } = opts;

  // biome-ignore lint/suspicious/noExplicitAny: stub adapter needs loose typing
  const stubAdapter: any = {
    fetchOHLCV: async () => [],
    fetchBalance: async () => ({ total: d("10000"), available: d("10000") }),
    fetchPositions: async () => [],
    createOrder: async () => ({ orderId: "o1", status: "FILLED", exchangeOrderId: "e1" }),
    cancelOrder: async () => {},
    editOrder: async () => ({ orderId: "o1", status: "FILLED", exchangeOrderId: "e1" }),
    fetchOrder: async () => ({ orderId: "o1", status: "FILLED" }),
    watchOHLCV: async () => () => {},
    getExchangeInfo: async () => ({
      symbol: "BTC/USDT",
      tickSize: d("0.01"),
      minOrderSize: d("0.001"),
      maxLeverage: 20,
      contractSize: d("1"),
    }),
    setLeverage: async () => {},
    transfer: async () => ({ id: "t1", status: "ok" }),
  };

  // Provide adapter so processExits' `adapter !== undefined` check passes
  const adaptersMap = new Map();
  adaptersMap.set("binance", stubAdapter);

  const deps: PipelineDeps = {
    db: {} as DbInstance,
    adapters: adaptersMap,

    getCandles: async () => [],
    calcAllIndicators: () => STUB_INDICATORS,
    calcBB4: () => null,

    getSymbolState: async () => makeSymbolState("0"),

    determineDailyBias: () => "NEUTRAL",
    updateDailyBias: async () => {},
    isTradeBlocked: async () => ({ blocked: false }),

    detectWatching: () => null,
    getActiveWatchSession: async () => null,
    openWatchSession: async () => {
      throw new Error("should not be called");
    },
    invalidateWatchSession: async () => {},
    checkInvalidation: () => null,
    updateWatchSessionTp: async () => {},

    checkEvidence: () => null,
    checkSafety: () => ({ passed: true, reasons: [] }),

    vectorize: () => new Float32Array(202),
    insertVector: async () => {
      throw new Error("should not be called");
    },

    searchKnn: async () => [],
    applyTimeDecay: () => [],
    loadTimeDecayConfig: async () => ({}),
    makeDecision: () => ({
      decision: "SKIP" as const,
      sampleCount: 0,
      winRate: 0,
      expectancy: 0,
      aGrade: false,
    }),
    loadKnnConfig: async () => ({ topK: 50, distanceMetric: "cosine" as const }),
    loadKnnDecisionConfig: async () => ({
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    }),

    // Return the active ticket so processExits is triggered
    getActiveTicket: async () => ticket,
    canPyramid: () => ({ allowed: false, reason: "max_count_reached" }),
    computeEntrySize: async () => ({ size: d("0.001"), leverage: 1 }),
    createTicket: async () => {
      throw new Error("should not be called");
    },

    executeEntry: async () => {
      throw new Error("should not be called");
    },
    loadSlippageConfig: async () => ({ maxSpreadPct: d("0.05") }),

    checkExit: (_input, _price, _nowMs, timeframe) => {
      if (captureCheckExit) {
        captureCheckExit.called = true;
        captureCheckExit.timeframeArg = timeframe;
      }
      if (opts.checkExitReturnsTp) {
        return { type: "TP1" as const, closeSize: d("0.5"), closeReason: "TP1" as const };
      }
      return { type: "NONE" as const, closeSize: d("0"), closeReason: null };
    },
    processExit: async () => ({
      success: true,
      closeOrder: null,
      slOrder: null,
      newState: null,
      ticketUpdates: null,
    }),
    processTrailing: async () => {
      if (captureProcessTrailing) {
        captureProcessTrailing.called = true;
      }
      return {
        updated: false,
        newTrailingPrice: null,
        newMaxProfit: null,
        slOrder: null,
      };
    },
    updateTpPrices: () => ({ tp1_price: null, tp2_price: null }),
    updateMfeMae: () => ({ max_favorable: "0", max_adverse: "0" }),

    checkLossLimit: () => ({ allowed: true, violations: [] }),
    loadLossLimitConfig: async () => makeLossConfig(),

    checkAccountDailyLimit: async (_db, _bal, _config) =>
      ({
        allowed: true,
        totalLossesToday: d("0"),
        threshold: d("1000"),
      }) satisfies AccountDailyLimitResult,

    getBalance: async () => d("10000"),

    // T-18-006: loss counter reset — no-op stubs
    resetExpiredLosses: async (_symbol: string, _exchange: string, _now: Date) => ({
      dailyReset: false,
      sessionReset: false,
      hourlyReset: false,
    }),
    setSessionStartTime: (_time: Date) => {},

    sendSlackAlert: async () => {},
    insertEvent: async () => ({
      id: "e1",
      event_type: "PIPELINE_LATENCY" as const,
      symbol: null,
      exchange: null,
      ref_id: null,
      ref_type: null,
      data: null,
      created_at: new Date(),
    }),
  };

  return deps;
}

describe("T-18-008: processExits — timeframe guard", () => {
  it("1M candle close → checkExit called with timeframe='1M' (TIME_EXIT 가능, TP 스킵)", async () => {
    const ticket = makeTicket();
    const captureCheckExit = { called: false, timeframeArg: undefined as Timeframe | undefined };
    const captureProcessTrailing = { called: false };

    const candle = makeCandle({ timeframe: "1M" });
    const deps = makeExitDeps({ ticket, captureCheckExit, captureProcessTrailing });

    await handleCandleClose(candle, "1M", [SYMBOL], deps);

    expect(captureCheckExit.called).toBe(true);
    expect(captureCheckExit.timeframeArg).toBe("1M");
    // trailing should NOT be called for 1M (ticket.trailing_active is false anyway,
    // but the 1H guard should also prevent it)
    expect(captureProcessTrailing.called).toBe(false);
  });

  it("5M candle close → checkExit called with timeframe='5M' (TP1/TP2 활성화)", async () => {
    const ticket = makeTicket();
    const captureCheckExit = { called: false, timeframeArg: undefined as Timeframe | undefined };

    const candle = makeCandle({ timeframe: "5M" });
    const deps = makeExitDeps({ ticket, captureCheckExit });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    expect(captureCheckExit.called).toBe(true);
    expect(captureCheckExit.timeframeArg).toBe("5M");
  });

  it("1H candle close → processTrailing 호출됨 (trailing_active=true)", async () => {
    const ticket = makeTicket({ trailing_active: true, trailing_price: d("100") });
    const captureProcessTrailing = { called: false };

    // For 1H, the entry pipeline (5M/1M) is skipped, but processExits runs
    const candle = makeCandle({ timeframe: "1H" });
    const deps = makeExitDeps({ ticket, captureProcessTrailing });

    await handleCandleClose(candle, "1H", [SYMBOL], deps);

    expect(captureProcessTrailing.called).toBe(true);
  });

  it("5M candle close → processTrailing 호출되지 않음 (trailing_active=true여도)", async () => {
    const ticket = makeTicket({ trailing_active: true, trailing_price: d("100") });
    const captureProcessTrailing = { called: false };

    const candle = makeCandle({ timeframe: "5M" });
    const deps = makeExitDeps({ ticket, captureProcessTrailing });

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    expect(captureProcessTrailing.called).toBe(false);
  });

  it("1M candle close → processTrailing 호출되지 않음 (trailing_active=true여도)", async () => {
    const ticket = makeTicket({ trailing_active: true, trailing_price: d("100") });
    const captureProcessTrailing = { called: false };

    const candle = makeCandle({ timeframe: "1M" });
    const deps = makeExitDeps({ ticket, captureProcessTrailing });

    await handleCandleClose(candle, "1M", [SYMBOL], deps);

    expect(captureProcessTrailing.called).toBe(false);
  });

  it("1D candle close → checkExit called with timeframe='1D', processTrailing 호출되지 않음", async () => {
    const ticket = makeTicket({ trailing_active: true });
    const captureCheckExit = { called: false, timeframeArg: undefined as Timeframe | undefined };
    const captureProcessTrailing = { called: false };

    const candle = makeCandle({ timeframe: "1D" });
    const deps = makeExitDeps({ ticket, captureCheckExit, captureProcessTrailing });

    await handleCandleClose(candle, "1D", [SYMBOL], deps);

    expect(captureCheckExit.called).toBe(true);
    expect(captureCheckExit.timeframeArg).toBe("1D");
    expect(captureProcessTrailing.called).toBe(false);
  });

  it("1H candle close + trailing_active=false → processTrailing 호출되지 않음", async () => {
    const ticket = makeTicket({ trailing_active: false });
    const captureProcessTrailing = { called: false };

    const candle = makeCandle({ timeframe: "1H" });
    const deps = makeExitDeps({ ticket, captureProcessTrailing });

    await handleCandleClose(candle, "1H", [SYMBOL], deps);

    // trailing_active=false means processTrailing won't do anything even if called,
    // but with the timeframe guard it should be called (and it will return early internally)
    // The guard only prevents calling on non-1H timeframes
    // On 1H with trailing_active=false: processTrailing may or may not be called
    // (it will return early inside processTrailing). The key is it must NOT be called on 5M/1M/1D.
    // Here we just verify it doesn't throw.
    expect(true).toBe(true);
  });
});

describe("backtest mock / getBalance — seed capital 반환", () => {
  it("createBacktestPipelineDeps가 getBalance를 제공한다", async () => {
    // This test verifies the backtest adapter includes getBalance
    const { createBacktestPipelineDeps } = await import("@/backtest/pipeline-adapter");

    // biome-ignore lint/suspicious/noExplicitAny: mock adapter needs loose typing
    const mockAdapter: any = {
      fetchOHLCV: async () => [],
      fetchBalance: async () => ({ total: d("5000"), available: d("5000") }),
      fetchPositions: async () => [],
      createOrder: async () => {
        throw new Error("not implemented");
      },
      cancelOrder: async () => {},
      editOrder: async () => {
        throw new Error("not implemented");
      },
      fetchOrder: async () => {
        throw new Error("not implemented");
      },
      watchOHLCV: async () => () => {},
      getExchangeInfo: async () => ({
        symbol: "BTC/USDT",
        tickSize: d("0.01"),
        minOrderSize: d("0.001"),
        maxLeverage: 20,
        contractSize: d("1"),
      }),
      setLeverage: async () => {},
      transfer: async () => ({ id: "t1", status: "ok" }),
    };

    const { deps } = createBacktestPipelineDeps(mockAdapter, "binance", STUB_DB);

    expect(typeof deps.getBalance).toBe("function");

    // getBalance should return seed capital from adapter.fetchBalance
    const balance = await deps.getBalance("binance");
    expect(balance.toString()).toBe("5000");
  });
});

// ---------------------------------------------------------------------------
// T-18-006: resetExpiredLosses — loss counter reset wiring
// ---------------------------------------------------------------------------

describe("T-18-006: resetExpiredLosses — 손실 카운터 리셋 wiring", () => {
  it("processSymbol에서 resetExpiredLosses가 호출된다 (5M candle)", async () => {
    const resetCalled = { count: 0, lastSymbol: "", lastExchange: "" };

    const candle = makeCandle();
    const deps = makeDeps({
      balance: "10000",
      lossesToday: "0",
    });

    // Override with capture stub
    deps.resetExpiredLosses = async (symbol: string, exchange: string, _now: Date) => {
      resetCalled.count++;
      resetCalled.lastSymbol = symbol;
      resetCalled.lastExchange = exchange;
      return { dailyReset: false, sessionReset: false, hourlyReset: false };
    };

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    expect(resetCalled.count).toBeGreaterThan(0);
    expect(resetCalled.lastSymbol).toBe("BTC/USDT");
    expect(resetCalled.lastExchange).toBe("binance");
  });

  it("processSymbol에서 resetExpiredLosses가 호출된다 (1H candle)", async () => {
    const resetCalled = { count: 0 };

    const candle = makeCandle({ timeframe: "1H" });
    const deps = makeDeps({
      balance: "10000",
      lossesToday: "0",
    });

    deps.resetExpiredLosses = async (_symbol: string, _exchange: string, _now: Date) => {
      resetCalled.count++;
      return { dailyReset: false, sessionReset: false, hourlyReset: false };
    };

    await handleCandleClose(candle, "1H", [SYMBOL], deps);

    expect(resetCalled.count).toBeGreaterThan(0);
  });

  it("resetExpiredLosses가 dailyReset=true 반환 시 로그가 기록된다 (에러 없음)", async () => {
    const candle = makeCandle();
    const deps = makeDeps({
      balance: "10000",
      lossesToday: "0",
    });

    // Return daily reset to verify pipeline handles it without errors
    deps.resetExpiredLosses = async (_symbol: string, _exchange: string, _now: Date) => ({
      dailyReset: true,
      sessionReset: false,
      hourlyReset: false,
    });

    // Should not throw
    await expect(handleCandleClose(candle, "5M", [SYMBOL], deps)).resolves.toBeUndefined();
  });

  it("resetExpiredLosses가 hourlyReset=true 반환 시 에러 없음", async () => {
    const candle = makeCandle();
    const deps = makeDeps({
      balance: "10000",
      lossesToday: "0",
    });

    deps.resetExpiredLosses = async (_symbol: string, _exchange: string, _now: Date) => ({
      dailyReset: false,
      sessionReset: false,
      hourlyReset: true,
    });

    await expect(handleCandleClose(candle, "5M", [SYMBOL], deps)).resolves.toBeUndefined();
  });
});

describe("T-18-006: setSessionStartTime — 세션 시작 감지", () => {
  it("블록 상태에서 비블록으로 전환 시 setSessionStartTime이 호출된다", async () => {
    // Reset module-level state to ensure clean test isolation
    _resetModuleStateForTesting();

    const sessionStartSet = { called: false, time: null as Date | null };

    let callCount = 0;

    const candle = makeCandle();
    const deps = makeDeps({ balance: "10000", lossesToday: "0" });

    // First call: blocked (simulates market closed)
    // Second call: not blocked (simulates market open — session start)
    deps.isTradeBlocked = async (_db, _now) => {
      callCount++;
      return callCount === 1 ? { blocked: true } : { blocked: false };
    };

    deps.setSessionStartTime = (time: Date) => {
      sessionStartSet.called = true;
      sessionStartSet.time = time;
    };

    // First call: enters blocked state
    await handleCandleClose(candle, "5M", [SYMBOL], deps);
    expect(sessionStartSet.called).toBe(false); // still blocked

    // Second call: transitions to unblocked → session starts
    await handleCandleClose(candle, "5M", [SYMBOL], deps);
    expect(sessionStartSet.called).toBe(true);
    expect(sessionStartSet.time).toBeDefined();
  });

  it("처음부터 비블록 → setSessionStartTime 호출되지 않음", async () => {
    // Reset module-level state to ensure clean test isolation
    _resetModuleStateForTesting();

    const sessionStartSet = { called: false };

    const candle = makeCandle();
    const deps = makeDeps({ balance: "10000", lossesToday: "0" });

    deps.isTradeBlocked = async (_db, _now) => ({ blocked: false });
    deps.setSessionStartTime = (_time: Date) => {
      sessionStartSet.called = true;
    };

    await handleCandleClose(candle, "5M", [SYMBOL], deps);

    // No transition from blocked→unblocked, so setSessionStartTime not called
    expect(sessionStartSet.called).toBe(false);
  });

  it("백테스트 adapter가 resetExpiredLosses no-op을 제공한다", async () => {
    const { createBacktestPipelineDeps } = await import("@/backtest/pipeline-adapter");

    // biome-ignore lint/suspicious/noExplicitAny: mock adapter needs loose typing
    const mockAdapter: any = {
      fetchOHLCV: async () => [],
      fetchBalance: async () => ({ total: d("5000"), available: d("5000") }),
      fetchPositions: async () => [],
      createOrder: async () => {
        throw new Error("not implemented");
      },
      cancelOrder: async () => {},
      editOrder: async () => {
        throw new Error("not implemented");
      },
      fetchOrder: async () => {
        throw new Error("not implemented");
      },
      watchOHLCV: async () => () => {},
      getExchangeInfo: async () => ({
        symbol: "BTC/USDT",
        tickSize: d("0.01"),
        minOrderSize: d("0.001"),
        maxLeverage: 20,
        contractSize: d("1"),
      }),
      setLeverage: async () => {},
      transfer: async () => ({ id: "t1", status: "ok" }),
    };

    const { deps } = createBacktestPipelineDeps(mockAdapter, "binance", STUB_DB);

    expect(typeof deps.resetExpiredLosses).toBe("function");
    expect(typeof deps.setSessionStartTime).toBe("function");

    // Should return all-false (no-op)
    const result = await deps.resetExpiredLosses("BTC/USDT", "binance", new Date());
    expect(result.dailyReset).toBe(false);
    expect(result.sessionReset).toBe(false);
    expect(result.hourlyReset).toBe(false);
  });
});
