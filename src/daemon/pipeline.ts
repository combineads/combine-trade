/**
 * Pipeline orchestrator — candle-close event → full trading pipeline.
 *
 * Receives candle close events from CandleManager and routes them through
 * the appropriate timeframe-specific pipeline branches. All external
 * dependencies are injected via PipelineDeps for testability.
 *
 * Timeframe routing:
 *   1D → daily bias update
 *   1H → watch session management + TP/trailing updates
 *   5M / 1M → full entry pipeline (blocked check → loss limit → signal → KNN → entry)
 *   All timeframes (with open position) → exit checks + MFE/MAE update
 *
 * Priority rule: If 1M already fired for a symbol in the current interval,
 * the 5M branch for that symbol is skipped.
 *
 * Layer: L9 — may import any lower layer.
 */

import type Decimal from "decimal.js";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type {
  Candle,
  DailyBias,
  Direction,
  Exchange,
  SymbolState,
  Ticket,
  Timeframe,
  VectorTimeframe,
  WatchSession,
} from "@/core/types";
import type { InsertEventParams } from "@/db/event-log";
import type { DbInstance } from "@/db/pool";
import type { EventLogRow, VectorRow } from "@/db/schema";
import type { CheckExitInput, ExitAction } from "@/exits/checker";
import type {
  ExitResult,
  ExitTicket,
  MfeMaeUpdateParams,
  MfeMaeUpdateResult,
  ProcessExitParams,
  ProcessTrailingParams,
  TpUpdateParams,
  TpUpdateResult,
  TrailingUpdateResult,
} from "@/exits/manager";
import type { AllIndicators, BollingerResult } from "@/indicators/types";
import type { KnnDecisionConfig, KnnDecisionResult } from "@/knn/decision";
import type { KnnConfig, KnnSearchOptions } from "@/knn/engine";
import type { KnnNeighbor, TimeDecayConfig, WeightedNeighbor } from "@/knn/time-decay";
import type {
  AccountDailyLimitResult,
  LossLimitConfig,
  LossLimitResult,
  ResetResult,
  SymbolLossState,
} from "@/limits/loss-limit";
import type { SlackAlertDetails, SlackEventType } from "@/notifications/slack";
import type { ExecuteEntryParams, ExecuteEntryResult } from "@/orders/executor";
import type { SlippageConfig } from "@/orders/slippage";
import type { PyramidCheckResult } from "@/positions/pyramid";
import type { CreateTicketParams } from "@/positions/ticket-manager";
import type { EvidenceResult } from "@/signals/evidence-gate";
import type { SafetyResult } from "@/signals/safety-gate";
import type { OpenWatchSessionParams, WatchingResult } from "@/signals/watching";
import type { InsertVectorParams } from "@/vectors/repository";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("pipeline");

// ---------------------------------------------------------------------------
// Active symbol shape
// ---------------------------------------------------------------------------

/**
 * Minimum symbol descriptor passed to handleCandleClose.
 * Includes the execution mode for entry gating.
 */
export type ActiveSymbol = {
  symbol: string;
  exchange: Exchange;
  executionMode: "analysis" | "alert" | "live";
};

// ---------------------------------------------------------------------------
// PipelineDeps — full DI interface
// ---------------------------------------------------------------------------

/**
 * All external dependencies injected into the pipeline.
 * Keeping every collaborator injectable makes unit tests trivial.
 */
export type PipelineDeps = {
  // ---- Infrastructure ----
  /** Drizzle ORM database instance */
  db: DbInstance;
  /** Exchange adapters keyed by exchange name */
  adapters: ReadonlyMap<Exchange, ExchangeAdapter>;

  // ---- Candle history ----
  /** Load recent candles for indicator calculation */
  getCandles: (
    db: DbInstance,
    symbol: string,
    exchange: string,
    timeframe: Timeframe,
    limit: number,
  ) => Promise<Candle[]>;

  // ---- Indicators ----
  /** Compute all indicators from candle history */
  calcAllIndicators: (candles: Candle[]) => AllIndicators;
  /**
   * Compute BB4 (4-period, 4-stddev, source="open") Bollinger Bands.
   * Used by processEntry() to inject 1H BB4 data into indicators.bb4_1h
   * before calling checkEvidence(). Returns null when candles < 4.
   */
  calcBB4: (candles: Candle[]) => BollingerResult | null;

  // ---- Symbol state ----
  /** Fetch the current SymbolState row for a symbol, or null if not found */
  getSymbolState: (db: DbInstance, symbol: string, exchange: string) => Promise<SymbolState | null>;

  // ---- Filters ----
  /** Determine daily bias from today's candle + MA */
  determineDailyBias: (
    todayClose: Decimal,
    dailyOpen: Decimal,
    ma20Today: Decimal,
    ma20Yesterday: Decimal,
  ) => DailyBias;
  /** Persist daily bias to DB */
  updateDailyBias: (
    db: DbInstance,
    symbol: string,
    exchange: string,
    bias: DailyBias,
    dailyOpen: Decimal,
  ) => Promise<void>;
  /**
   * Check whether a new entry is blocked by active trade blocks.
   * Returns { blocked: boolean; reason?: string }.
   */
  isTradeBlocked: (db: DbInstance, now: Date) => Promise<{ blocked: boolean; reason?: string }>;

  // ---- Watch sessions ----
  /** Detect a new WATCHING condition */
  detectWatching: (
    candle: Candle,
    indicators: AllIndicators,
    dailyBias: DailyBias,
  ) => WatchingResult | null;
  /** Fetch the active watch session for a symbol */
  getActiveWatchSession: (
    db: DbInstance,
    symbol: string,
    exchange: string,
  ) => Promise<WatchSession | null>;
  /** Open a new watch session */
  openWatchSession: (db: DbInstance, params: OpenWatchSessionParams) => Promise<WatchSession>;
  /** Invalidate an existing watch session */
  invalidateWatchSession: (db: DbInstance, sessionId: string, reason: string) => Promise<void>;
  /** Check whether the current candle invalidates an active watch session */
  checkInvalidation: (
    candle: Candle,
    indicators: AllIndicators,
    session: WatchSession,
    currentBias?: DailyBias,
  ) => string | null;
  /** Update tp1_price / tp2_price in the watch_sessions table */
  updateWatchSessionTp: (
    db: DbInstance,
    sessionId: string,
    tp1: Decimal,
    tp2: Decimal,
  ) => Promise<void>;

  // ---- Signals ----
  /** Check BB4 evidence for an entry signal */
  checkEvidence: (
    candle: Candle,
    indicators: AllIndicators,
    watchSession: WatchSession,
  ) => EvidenceResult | null;
  /** Run safety filters */
  checkSafety: (
    candle: Candle,
    indicators: AllIndicators,
    signal: { direction: Direction; timeframe: VectorTimeframe },
    symbolState: {
      session_box_high: Decimal | null;
      session_box_low: Decimal | null;
      daily_bias: DailyBias | null;
    },
    recentCandles?: Candle[],
  ) => SafetyResult;

  // ---- Vectors ----
  /** Convert candles + indicators into a 202-dim embedding */
  vectorize: (
    candles: Candle[],
    indicators: AllIndicators,
    timeframe: VectorTimeframe,
  ) => Float32Array;
  /** Persist a vector embedding to the DB */
  insertVector: (db: DbInstance, params: InsertVectorParams) => Promise<VectorRow>;

  // ---- KNN ----
  /** Execute pgvector HNSW nearest-neighbour search */
  searchKnn: (
    db: DbInstance,
    embedding: Float32Array,
    options: KnnSearchOptions,
  ) => Promise<KnnNeighbor[]>;
  /** Apply time-decay weights to raw KNN neighbors */
  applyTimeDecay: (
    neighbors: KnnNeighbor[],
    now: Date,
    config: TimeDecayConfig,
  ) => WeightedNeighbor[];
  /** Load time-decay config (steps are structural constants; no DB needed) */
  loadTimeDecayConfig: () => Promise<TimeDecayConfig>;
  /** Derive a trading decision from weighted neighbors */
  makeDecision: (
    neighbors: WeightedNeighbor[],
    isAGrade: boolean,
    config?: KnnDecisionConfig,
  ) => KnnDecisionResult;
  /** Load KNN config from CommonCode */
  loadKnnConfig: (db: DbInstance) => Promise<KnnConfig>;
  /** Load KNN decision thresholds (winrate, min_samples, a_grade variants) from CommonCode */
  loadKnnDecisionConfig: (db: DbInstance) => Promise<KnnDecisionConfig>;

  // ---- Positions ----
  /** Get the active (open) ticket for a symbol, or null */
  getActiveTicket: (db: DbInstance, symbol: string, exchange: string) => Promise<Ticket | null>;
  /** Check whether a pyramid add-on is allowed */
  canPyramid: (
    ticket: Ticket,
    currentPrice: Decimal,
    maxPyramidCount: number,
  ) => PyramidCheckResult;
  /**
   * Compute entry size and leverage given the evidence and adapter.
   * Wraps balance fetch + exchange info + sizer in one injectable call.
   * Returns { size: Decimal; leverage: number }.
   */
  computeEntrySize: (
    adapter: ExchangeAdapter,
    symbol: string,
    exchange: string,
    evidence: EvidenceResult,
  ) => Promise<{ size: Decimal; leverage: number }>;
  /** Create a new ticket in the DB */
  createTicket: (db: DbInstance, params: CreateTicketParams) => Promise<Ticket>;

  // ---- Orders ----
  /** Execute a full entry order flow */
  executeEntry: (params: ExecuteEntryParams) => Promise<ExecuteEntryResult>;
  /** Load slippage config from CommonCode */
  loadSlippageConfig: (db: DbInstance) => Promise<SlippageConfig>;

  // ---- Exits ----
  /**
   * Check whether a TP / TIME_EXIT / NONE exit is due.
   *
   * timeframe controls which checks run (PRD §7.13):
   *   - TIME_EXIT: all timeframes
   *   - TP1/TP2: only "5M"
   * Omit timeframe (backtest / legacy) to run all checks.
   */
  checkExit: (
    ticket: CheckExitInput,
    currentPrice: string,
    nowMs: number,
    timeframe?: Timeframe,
  ) => ExitAction;
  /** Execute a TP or TIME_EXIT close */
  processExit: (params: ProcessExitParams) => Promise<ExitResult>;
  /** Update the trailing SL on exchange + DB */
  processTrailing: (params: ProcessTrailingParams) => Promise<TrailingUpdateResult>;
  /** Sync TP prices from watch session into the ticket */
  updateTpPrices: (params: TpUpdateParams) => TpUpdateResult;
  /** Persist MFE / MAE updates */
  updateMfeMae: (params: MfeMaeUpdateParams) => MfeMaeUpdateResult;

  // ---- Loss limits ----
  /** Pure function — evaluates loss counter state */
  checkLossLimit: (
    state: SymbolLossState,
    balance: Decimal | string,
    config: LossLimitConfig,
  ) => LossLimitResult;
  /** Load loss limit config from CommonCode */
  loadLossLimitConfig: (db: DbInstance) => Promise<LossLimitConfig>;
  /**
   * Account-level daily loss check: SUM(losses_today) across all symbols.
   * Called once per processEntry() before per-symbol checks.
   */
  checkAccountDailyLimit: (
    db: DbInstance,
    balance: Decimal | string,
    config: LossLimitConfig,
  ) => Promise<AccountDailyLimitResult>;
  /**
   * Fetch the current account balance for the given exchange.
   * May return a cached value — no need to hit exchange API every candle.
   */
  getBalance: (exchange: string) => Promise<Decimal>;
  /**
   * Reset expired loss counters for a given symbol×exchange pair.
   *
   * Called at the start of every candle-close handler. The implementation
   * checks UTC day/hour boundaries and fires the appropriate DB resets.
   * The caller (daemon) maintains LastResets state across calls.
   *
   * Returns which resets were performed (for logging).
   */
  resetExpiredLosses: (symbol: string, exchange: string, now: Date) => Promise<ResetResult>;
  /**
   * Notify the daemon that a new trade session has started (market open).
   *
   * Called when isTradeBlocked transitions from blocked→unblocked.
   * The daemon updates LastResets.sessionStartTime so that
   * resetExpiredLosses will reset session losses on the next call.
   */
  setSessionStartTime: (time: Date) => void;

  // ---- Notifications ----
  /** Fire-and-forget Slack alert */
  sendSlackAlert: (
    eventType: SlackEventType,
    details: SlackAlertDetails,
    db?: DbInstance,
  ) => Promise<void>;

  // ---- Event log ----
  /** Append-only event log insert */
  insertEvent: (db: DbInstance, params: InsertEventParams) => Promise<EventLogRow>;
};

// ---------------------------------------------------------------------------
// 1M "recently fired" tracker — per-symbol deduplication across 5M/1M
// ---------------------------------------------------------------------------

/**
 * Tracks symbols where 1M fired recently, so we can skip the 5M branch.
 * Key: `${symbol}@${exchange}`, Value: timestamp (ms) when 1M last fired.
 *
 * TTL of 60 seconds (one 1M candle interval).
 */
const recent1MFired = new Map<string, number>();
const RECENT_1M_TTL_MS = 60_000;

function symbolKey(symbol: string, exchange: string): string {
  return `${symbol}@${exchange}`;
}

function mark1MFired(symbol: string, exchange: string): void {
  recent1MFired.set(symbolKey(symbol, exchange), Date.now());
}

function was1MFiredRecently(symbol: string, exchange: string): boolean {
  const ts = recent1MFired.get(symbolKey(symbol, exchange));
  if (ts === undefined) return false;
  return Date.now() - ts < RECENT_1M_TTL_MS;
}

// ---------------------------------------------------------------------------
// Trade block transition tracker — session start detection
// ---------------------------------------------------------------------------

/**
 * Tracks whether each symbol×exchange was in a blocked state on the last
 * processEntry() call.  When the state flips from blocked→unblocked,
 * setSessionStartTime() is called to notify the daemon that a new trade
 * session has started so it can reset losses_session.
 *
 * Key: `${symbol}@${exchange}`, Value: true = was blocked on last call.
 */
const previouslyBlocked = new Map<string, boolean>();

/**
 * Clears all module-level test state (previouslyBlocked + recent1MFired).
 *
 * Exported for test isolation only — do NOT call from production code.
 */
export function _resetModuleStateForTesting(): void {
  previouslyBlocked.clear();
  recent1MFired.clear();
}

// ---------------------------------------------------------------------------
// handleCandleClose — main entry point
// ---------------------------------------------------------------------------

/**
 * Main pipeline entry point. Called once per candle close event.
 *
 * Iterates over `activeSymbols`, finds those matching the closed candle's
 * symbol+exchange, and processes each through `processSymbol()`.
 *
 * Per-symbol errors are caught and logged without interrupting other symbols.
 * Records a PIPELINE_LATENCY event at the end.
 */
export async function handleCandleClose(
  candle: Candle,
  timeframe: Timeframe,
  activeSymbols: ReadonlyArray<ActiveSymbol>,
  deps: PipelineDeps,
): Promise<void> {
  const startMs = Date.now();

  // Find matching active symbols
  const matching = activeSymbols.filter(
    (s) => s.symbol === candle.symbol && s.exchange === candle.exchange,
  );

  for (const sym of matching) {
    try {
      await processSymbol(candle, timeframe, sym, deps);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("pipeline_symbol_error", {
        symbol: sym.symbol,
        exchange: sym.exchange,
        details: { timeframe, error: errMsg },
      });

      // Fire-and-forget Slack alert — never throw
      deps
        .sendSlackAlert(
          "CRASH_RECOVERY" as SlackEventType,
          {
            symbol: sym.symbol,
            exchange: sym.exchange,
            timeframe,
            error: errMsg,
          },
          deps.db,
        )
        .catch(() => {});
    }
  }

  // Record pipeline latency — fire and forget
  const durationMs = Date.now() - startMs;
  deps
    .insertEvent(deps.db, {
      event_type: "PIPELINE_LATENCY",
      symbol: candle.symbol,
      exchange: candle.exchange,
      data: { timeframe, durationMs, symbolCount: matching.length },
    })
    .catch((err: unknown) => {
      log.warn("pipeline_latency_insert_failed", {
        details: { error: String(err) },
      });
    });
}

// ---------------------------------------------------------------------------
// processSymbol — per-symbol dispatcher
// ---------------------------------------------------------------------------

async function processSymbol(
  candle: Candle,
  timeframe: Timeframe,
  sym: ActiveSymbol,
  deps: PipelineDeps,
): Promise<void> {
  const { symbol, exchange } = sym;

  // ---- Reset expired loss counters (runs every candle, checks time boundaries) ----
  const now = new Date();
  const resetResult = await deps.resetExpiredLosses(symbol, exchange, now);
  if (resetResult.dailyReset || resetResult.sessionReset || resetResult.hourlyReset) {
    log.info("pipeline_loss_counters_reset", {
      symbol,
      exchange,
      details: {
        timeframe,
        dailyReset: resetResult.dailyReset,
        sessionReset: resetResult.sessionReset,
        hourlyReset: resetResult.hourlyReset,
      },
    });
  }

  // Load recent candles for indicator computation (200 bars gives enough history)
  const candles = await deps.getCandles(deps.db, symbol, exchange, timeframe, 200);
  const indicators = deps.calcAllIndicators(candles);

  // Check for open position — needed by all timeframe branches (exit processing)
  const activeTicket = await deps.getActiveTicket(deps.db, symbol, exchange);

  // ---- 1D: update daily bias ----
  if (timeframe === "1D") {
    await process1D(candle, indicators, symbol, exchange, deps);
  }

  // ---- 1H: watch session management ----
  if (timeframe === "1H") {
    await process1H(candle, indicators, symbol, exchange, deps);
  }

  // ---- 5M / 1M: entry pipeline ----
  if (timeframe === "5M" || timeframe === "1M") {
    // Priority rule: skip 5M if 1M already fired for this symbol recently
    if (timeframe === "5M" && was1MFiredRecently(symbol, exchange)) {
      log.debug("pipeline_5m_skipped_1m_priority", { symbol, exchange });
    } else {
      if (timeframe === "1M") {
        mark1MFired(symbol, exchange);
      }
      await processEntry(candle, timeframe as VectorTimeframe, indicators, candles, sym, deps);
    }
  }

  // ---- All timeframes: exit processing for open positions ----
  // TIME_EXIT runs on all TF; TP1/TP2 only on 5M; trailing only on 1H (PRD §7.13)
  if (activeTicket !== null) {
    await processExits(candle, activeTicket, timeframe, deps);
  }
}

// ---------------------------------------------------------------------------
// process1D — daily bias
// ---------------------------------------------------------------------------

async function process1D(
  candle: Candle,
  indicators: AllIndicators,
  symbol: string,
  exchange: string,
  deps: PipelineDeps,
): Promise<void> {
  const sma20Today = indicators.sma20;
  if (sma20Today === null || sma20Today === undefined) {
    log.debug("pipeline_1d_no_sma20", { symbol, exchange });
    return;
  }

  // Load 2 prior daily candles to derive yesterday's SMA20
  const priorCandles = await deps.getCandles(deps.db, symbol, exchange, "1D", 2);
  // Need at least 2 candles: prior and current. If only 1, no yesterday MA available.
  const sma20Yesterday =
    priorCandles.length >= 2
      ? (deps.calcAllIndicators(priorCandles.slice(0, -1)).sma20 ?? null)
      : null;

  if (sma20Yesterday === null || sma20Yesterday === undefined) {
    log.debug("pipeline_1d_no_prior_sma20", { symbol, exchange });
    return;
  }

  const bias = deps.determineDailyBias(candle.close, candle.open, sma20Today, sma20Yesterday);

  await deps.updateDailyBias(deps.db, symbol, exchange, bias, candle.open);

  await deps.insertEvent(deps.db, {
    event_type: "BIAS_CHANGE",
    symbol,
    exchange,
    data: { bias, close: candle.close.toString(), open: candle.open.toString() },
  });

  log.info("pipeline_1d_bias_updated", { symbol, exchange, details: { bias } });
}

// ---------------------------------------------------------------------------
// refreshWatchSessionTp — TP recalculation helper for process1H
// ---------------------------------------------------------------------------

/**
 * Recalculates tp1/tp2 for an active WatchSession based on current 1H
 * indicators and detection_type, then persists the updated values to DB.
 *
 * Recalculation rules (per detection_type):
 *   SQUEEZE_BREAKOUT — tp1 = BB20 opposite band (LONG → upper, SHORT → lower)
 *   BB4_TOUCH        — tp1 = SMA20, tp2 = BB20 opposite band
 *   SR_CONFLUENCE    — no recalculation (S/R levels don't change with indicators)
 *
 * If indicators.bb20 or indicators.sma20 is null (insufficient candle history),
 * the function is a no-op and the existing TP values are preserved.
 *
 * Only writes to DB when at least one TP value has changed, avoiding
 * unnecessary UPDATE operations on unchanged sessions.
 */
async function refreshWatchSessionTp(
  _candle: Candle,
  indicators: AllIndicators,
  session: WatchSession,
  deps: PipelineDeps,
): Promise<void> {
  const { bb20, sma20 } = indicators;

  // Guard: insufficient indicator data — keep existing TP
  if (!bb20 || !sma20) return;

  const { upper: bb20Upper, lower: bb20Lower } = bb20;
  const { detection_type, direction } = session;

  let newTp1: Decimal | null = null;
  let newTp2: Decimal | null = null;

  if (detection_type === "SQUEEZE_BREAKOUT") {
    // tp1 = BB20 opposite band (price target after breakout retrace)
    newTp1 = direction === "LONG" ? bb20Upper : bb20Lower;
    // tp2 unchanged — keep existing value
    newTp2 = session.tp2_price;
  } else if (detection_type === "BB4_TOUCH") {
    // tp1 = SMA20 (mean reversion first target)
    // tp2 = BB20 opposite band (extended target)
    newTp1 = sma20;
    newTp2 = direction === "LONG" ? bb20Upper : bb20Lower;
  } else {
    // SR_CONFLUENCE: S/R levels are structural — no recalculation
    return;
  }

  if (newTp1 === null || newTp2 === null) return;

  // Only write when values actually changed
  const tp1Unchanged = session.tp1_price !== null && newTp1.equals(session.tp1_price);
  const tp2Unchanged = session.tp2_price !== null && newTp2.equals(session.tp2_price);
  if (tp1Unchanged && tp2Unchanged) return;

  await deps.updateWatchSessionTp(deps.db, session.id, newTp1, newTp2);
}

// ---------------------------------------------------------------------------
// process1H — watch session management
// ---------------------------------------------------------------------------

async function process1H(
  candle: Candle,
  indicators: AllIndicators,
  symbol: string,
  exchange: string,
  deps: PipelineDeps,
): Promise<void> {
  const symbolState = await deps.getSymbolState(deps.db, symbol, exchange);
  const currentBias: DailyBias | undefined = symbolState?.daily_bias ?? undefined;

  // Check for active watch session
  const activeSession = await deps.getActiveWatchSession(deps.db, symbol, exchange);

  if (activeSession !== null) {
    // Check for invalidation
    const invalidReason = deps.checkInvalidation(candle, indicators, activeSession, currentBias);
    if (invalidReason !== null) {
      await deps.invalidateWatchSession(deps.db, activeSession.id, invalidReason);
      log.info("pipeline_1h_session_invalidated", {
        symbol,
        exchange,
        details: { reason: invalidReason, sessionId: activeSession.id },
      });
    } else {
      // Recalculate and persist TP prices based on current 1H indicators
      await refreshWatchSessionTp(candle, indicators, activeSession, deps);

      // Update TP prices in memory (syncs watch session TP into the ticket state)
      deps.updateTpPrices({
        tp1Price: activeSession.tp1_price,
        tp2Price: activeSession.tp2_price,
      });
    }
  } else {
    // No active session — try to detect a new one
    if (currentBias !== undefined) {
      const watchingResult = deps.detectWatching(candle, indicators, currentBias);
      if (watchingResult !== null) {
        const session = await deps.openWatchSession(deps.db, {
          symbol,
          exchange,
          detectionType: watchingResult.detectionType,
          direction: watchingResult.direction,
          tp1Price: watchingResult.tp1Price,
          tp2Price: watchingResult.tp2Price,
          detectedAt: candle.open_time,
          contextData: watchingResult.contextData,
        });

        await deps.insertEvent(deps.db, {
          event_type: "WATCHING_START",
          symbol,
          exchange,
          ref_id: session.id,
          ref_type: "watch_session",
          data: {
            detectionType: watchingResult.detectionType,
            direction: watchingResult.direction,
          },
        });

        log.info("pipeline_1h_session_opened", {
          symbol,
          exchange,
          details: {
            sessionId: session.id,
            detectionType: watchingResult.detectionType,
            direction: watchingResult.direction,
          },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// processEntry — 5M/1M entry pipeline
// ---------------------------------------------------------------------------

async function processEntry(
  candle: Candle,
  timeframe: VectorTimeframe,
  indicators: AllIndicators,
  candles: Candle[],
  sym: ActiveSymbol,
  deps: PipelineDeps,
): Promise<void> {
  const { symbol, exchange } = sym;

  // ---- 1. Trade block check ----
  const entryNow = new Date();
  const blockResult = await deps.isTradeBlocked(deps.db, entryNow);
  const key = symbolKey(symbol, exchange);
  const wasBlocked = previouslyBlocked.get(key) ?? false;

  if (blockResult.blocked) {
    // Record blocked state for session transition detection on next call
    previouslyBlocked.set(key, true);
    log.debug("pipeline_entry_trade_blocked", {
      symbol,
      exchange,
      details: { timeframe, reason: blockResult.reason ?? "unknown" },
    });
    return;
  }

  // Transition: blocked → unblocked (market opened → new session started)
  if (wasBlocked) {
    deps.setSessionStartTime(entryNow);
    log.info("pipeline_session_start_detected", {
      symbol,
      exchange,
      details: { timeframe },
    });
  }
  previouslyBlocked.set(key, false);

  // ---- 2. Loss limit check ----
  const symbolState = await deps.getSymbolState(deps.db, symbol, exchange);
  const balance = await deps.getBalance(exchange);
  const lossConfig = await deps.loadLossLimitConfig(deps.db);

  // 2a. Account-level daily limit: SUM(losses_today) >= balance × maxDailyLossPct
  const accountLimitResult = await deps.checkAccountDailyLimit(deps.db, balance, lossConfig);
  if (!accountLimitResult.allowed) {
    log.info("pipeline_entry_account_daily_limit", {
      symbol,
      exchange,
      details: {
        timeframe,
        totalLossesToday: accountLimitResult.totalLossesToday.toString(),
        threshold: accountLimitResult.threshold.toString(),
      },
    });
    return;
  }

  // 2b. Per-symbol loss limit check
  if (symbolState !== null) {
    const lossState: SymbolLossState = {
      lossesToday: symbolState.losses_today,
      lossesSession: symbolState.losses_session,
      lossesThisHour5m: symbolState.losses_this_1h_5m,
      lossesThisHour1m: symbolState.losses_this_1h_1m,
    };
    const limitResult = deps.checkLossLimit(lossState, balance, lossConfig);
    if (!limitResult.allowed) {
      log.info("pipeline_entry_loss_limit", {
        symbol,
        exchange,
        details: { timeframe, violations: limitResult.violations.join(",") },
      });
      return;
    }
  }

  // ---- 3. Need active watch session ----
  const activeSession = await deps.getActiveWatchSession(deps.db, symbol, exchange);
  if (activeSession === null) {
    log.debug("pipeline_entry_no_watch_session", { symbol, exchange, details: { timeframe } });
    return;
  }

  // ---- 3b. Inject 1H BB4 into indicators for a_grade determination ----
  // Load 1H candles and compute BB4(period=4, stddev=4, source="open").
  // The result is injected into indicators.bb4_1h so that checkEvidence()
  // can set aGrade=true when the 1H BB4 band is simultaneously touched.
  // If fewer than 4 candles are available, bb4_1h stays null (existing default).
  const candles1H = await deps.getCandles(deps.db, symbol, exchange, "1H", 10);
  if (candles1H.length >= 4) {
    const bb4_1h = deps.calcBB4(candles1H);
    if (bb4_1h !== null) {
      indicators.bb4_1h = bb4_1h;
    }
  }

  // ---- 3c. Inject 5M SMA20 into indicators for 1M noise filter (PRD §7.7) ----
  // When processing a 1M candle, load 5M candle indicators and inject sma20_5m.
  // This allows checkNoise1M() to compare the 5M MA20 direction against the
  // daily bias, filtering 1M entries that contradict the 5M trend.
  if (timeframe === "1M") {
    const candles5M = await deps.getCandles(deps.db, symbol, exchange, "5M", 25);
    const indicators5M = deps.calcAllIndicators(candles5M);
    indicators.sma20_5m = indicators5M.sma20;
  }

  // ---- 4. Evidence check (BB4 touch) ----
  const evidence = deps.checkEvidence(candle, indicators, activeSession);
  if (evidence === null) {
    log.debug("pipeline_entry_no_evidence", { symbol, exchange, details: { timeframe } });
    return;
  }

  // ---- 5. Safety gate ----
  const safetySymbolState = {
    session_box_high: symbolState?.session_box_high ?? null,
    session_box_low: symbolState?.session_box_low ?? null,
    daily_bias: symbolState?.daily_bias ?? null,
  };

  const safetyResult = deps.checkSafety(
    candle,
    indicators,
    { direction: evidence.direction, timeframe },
    safetySymbolState,
    candles,
  );

  if (!safetyResult.passed) {
    log.info("pipeline_entry_safety_failed", {
      symbol,
      exchange,
      details: { timeframe, reasons: safetyResult.reasons.join(",") },
    });
    return;
  }

  // ---- 6. Vectorize ----
  const embedding = deps.vectorize(candles, indicators, timeframe);

  // ---- 7. Load KNN config + persist vector ----
  const knnConfig = await deps.loadKnnConfig(deps.db);
  const vectorRow = await deps.insertVector(deps.db, {
    candleId: candle.id,
    symbol,
    exchange,
    timeframe,
    embedding,
  });

  // ---- 8. KNN search ----
  const rawNeighbors = await deps.searchKnn(deps.db, embedding, {
    symbol,
    exchange,
    timeframe,
    topK: knnConfig.topK,
    distanceMetric: knnConfig.distanceMetric,
  });

  // ---- 9. Time-decay + decision ----
  const timeDecayConfig = await deps.loadTimeDecayConfig();
  const weightedNeighbors = deps.applyTimeDecay(rawNeighbors, new Date(), timeDecayConfig);
  const knnDecisionConfig = await deps.loadKnnDecisionConfig(deps.db);
  const knnDecision = deps.makeDecision(weightedNeighbors, evidence.aGrade, knnDecisionConfig);

  log.info("pipeline_knn_decision", {
    symbol,
    exchange,
    details: {
      timeframe,
      decision: knnDecision.decision,
      winRate: knnDecision.winRate,
      sampleCount: knnDecision.sampleCount,
    },
  });

  if (knnDecision.decision !== "PASS") {
    log.debug("pipeline_entry_knn_blocked", {
      symbol,
      exchange,
      details: { timeframe, decision: knnDecision.decision },
    });
    return;
  }

  // ---- 9b. daily_bias cross-validation ----
  const dailyBias = symbolState?.daily_bias ?? null;
  if (dailyBias !== null && dailyBias !== "NEUTRAL") {
    const biasDirection = dailyBias === "LONG_ONLY" ? "LONG" : "SHORT";
    if (evidence.direction !== biasDirection) {
      log.info("pipeline_daily_bias_mismatch", {
        symbol,
        exchange,
        details: { timeframe, evidenceDirection: evidence.direction, dailyBias },
      });
      await deps.insertEvent(deps.db, {
        event_type: "DAILY_BIAS_MISMATCH",
        symbol,
        exchange,
        ref_id: null,
        ref_type: null,
        data: { timeframe, evidenceDirection: evidence.direction, dailyBias },
      });
      return;
    }
  }

  // ---- 10. Skip execution in analysis mode ----
  if (sym.executionMode === "analysis") {
    log.info("pipeline_entry_analysis_mode_skip", {
      symbol,
      exchange,
      details: { timeframe, vectorId: vectorRow.id },
    });
    return;
  }

  // ---- 11. Get exchange adapter ----
  const adapter = deps.adapters.get(exchange);
  if (adapter === undefined) {
    log.error("pipeline_entry_no_adapter", { symbol, exchange });
    return;
  }

  // ---- 12. Compute entry size + load slippage config ----
  const { size, leverage } = await deps.computeEntrySize(adapter, symbol, exchange, evidence);
  const slippageConfig = await deps.loadSlippageConfig(deps.db);

  const entryResult = await deps.executeEntry({
    adapter,
    symbol,
    exchange,
    mode: sym.executionMode,
    direction: evidence.direction,
    entryPrice: evidence.entryPrice,
    slPrice: evidence.slPrice,
    size,
    leverage,
    slippageConfig,
  });

  if (!entryResult.success) {
    log.warn("pipeline_entry_failed", {
      symbol,
      exchange,
      details: { timeframe, abortReason: entryResult.abortReason ?? "unknown" },
    });
    return;
  }

  // ---- 13. Create ticket ----
  const filledPrice =
    entryResult.entryOrder?.filled_price != null
      ? entryResult.entryOrder.filled_price
      : evidence.entryPrice.toString();

  const createTicketParams: CreateTicketParams = {
    symbol,
    exchange,
    signalId: vectorRow.id,
    timeframe,
    direction: evidence.direction,
    entryPrice: filledPrice,
    slPrice: evidence.slPrice.toString(),
    size: size.toString(),
    leverage,
  };
  const tp1Str = activeSession.tp1_price?.toString();
  const tp2Str = activeSession.tp2_price?.toString();
  if (tp1Str !== undefined) createTicketParams.tp1Price = tp1Str;
  if (tp2Str !== undefined) createTicketParams.tp2Price = tp2Str;

  await deps.createTicket(deps.db, createTicketParams);

  log.info("pipeline_entry_completed", {
    symbol,
    exchange,
    details: {
      timeframe,
      direction: evidence.direction,
      entryPrice: filledPrice,
      vectorId: vectorRow.id,
    },
  });
}

// ---------------------------------------------------------------------------
// processExits — exit checks for open positions
// ---------------------------------------------------------------------------

/**
 * Timeframe routing (PRD §7.13, 김직선 원칙):
 *   - TIME_EXIT (60h hold): ALL timeframes — safety mechanism, must run as often as possible
 *   - TP1/TP2 check:        5M only  — "TP는 5M이 메인, 1M은 노이즈, 1H는 느림"
 *   - Trailing SL update:   1H only  — "트레일링은 큰 그림에서 봐야 한다"
 *   - MFE/MAE update:       ALL timeframes — stats collection, no trade impact
 */
async function processExits(
  candle: Candle,
  ticket: Ticket,
  timeframe: Timeframe,
  deps: PipelineDeps,
): Promise<void> {
  const exchange = ticket.exchange;
  const currentPrice = candle.close.toString();

  // ---- Check TIME_EXIT (all TF) + TP1/TP2 (5M only) ----
  const checkInput: CheckExitInput = {
    state: ticket.state,
    direction: ticket.direction,
    entry_price: ticket.entry_price.toString(),
    tp1_price: ticket.tp1_price?.toString() ?? null,
    tp2_price: ticket.tp2_price?.toString() ?? null,
    size: ticket.size.toString(),
    remaining_size: ticket.remaining_size.toString(),
    opened_at: ticket.opened_at,
    trailing_active: ticket.trailing_active,
    max_favorable: ticket.max_favorable?.toString() ?? null,
    max_adverse: ticket.max_adverse?.toString() ?? null,
  };

  // Pass timeframe so checker can skip TP1/TP2 on non-5M closes
  const exitAction = deps.checkExit(checkInput, currentPrice, Date.now(), timeframe);

  if (exitAction.type !== "NONE") {
    const adapter = deps.adapters.get(exchange);
    if (adapter !== undefined) {
      const exitTicket: ExitTicket = {
        id: ticket.id,
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        direction: ticket.direction,
        entry_price: ticket.entry_price.toString(),
        size: ticket.size.toString(),
        remaining_size: ticket.remaining_size.toString(),
        trailing_active: ticket.trailing_active,
        trailing_price: ticket.trailing_price?.toString() ?? null,
        max_profit: ticket.max_profit.toString(),
        sl_order_id: null,
      };

      const exitResult = await deps.processExit({
        adapter,
        ticket: exitTicket,
        action: exitAction,
        exchange,
      });

      if (exitResult.success) {
        log.info("pipeline_exit_processed", {
          symbol: ticket.symbol,
          exchange: ticket.exchange,
          details: { exitType: exitAction.type, newState: exitResult.newState },
        });
      }
    }
  }

  // ---- Update trailing SL (1H only — PRD §7.13 L328) ----
  if (timeframe === "1H" && ticket.trailing_active) {
    const adapter = deps.adapters.get(exchange);
    if (adapter !== undefined) {
      const exitTicket: ExitTicket = {
        id: ticket.id,
        symbol: ticket.symbol,
        exchange: ticket.exchange,
        direction: ticket.direction,
        entry_price: ticket.entry_price.toString(),
        size: ticket.size.toString(),
        remaining_size: ticket.remaining_size.toString(),
        trailing_active: ticket.trailing_active,
        trailing_price: ticket.trailing_price?.toString() ?? null,
        max_profit: ticket.max_profit.toString(),
        sl_order_id: null,
      };

      await deps.processTrailing({
        adapter,
        ticket: exitTicket,
        currentPrice: candle.close,
        exchange,
      });
    }
  }

  // ---- Update MFE / MAE (all timeframes — stats only) ----
  if (ticket.max_favorable !== null && ticket.max_adverse !== null) {
    deps.updateMfeMae({
      mfe: ticket.max_favorable,
      mae: ticket.max_adverse,
    });
  }
}
