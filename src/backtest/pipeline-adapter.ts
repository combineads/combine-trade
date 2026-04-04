/**
 * Backtest pipeline adapter — creates a PipelineDeps populated with
 * MockExchangeAdapter and in-memory collectors instead of DB writes.
 *
 * Design decisions:
 * - Real pure functions (indicators, signals, knn, exits) are used directly.
 * - DB write operations (createTicket, insertVector, insertEvent) collect
 *   into in-memory arrays instead of writing to Postgres.
 * - DB read operations (getCandles, getActiveWatchSession, etc.) use in-memory
 *   state or delegate to MockExchangeAdapter.fetchOHLCV.
 * - Slack notifications are no-ops.
 * - executionMode for the ActiveSymbol must be set to 'live' by the caller
 *   so the mock adapter actually processes orders.
 *
 * Layer: L9 (backtest — may import any lower layer)
 */

import { d } from "@/core/decimal";
import type { ExchangeAdapter } from "@/core/ports";
import type {
  Candle,
  DailyBias,
  Exchange,
  Ticket,
  Timeframe,
  WatchSession,
} from "@/core/types";
import type { InsertEventParams } from "@/db/event-log";
import type { DbInstance } from "@/db/pool";
import type { EventLogRow, VectorRow } from "@/db/schema";
import { checkExit } from "@/exits/checker";
import {
  processExit,
  processTrailing,
  updateMfeMae,
  updateTpPrices,
} from "@/exits/manager";
import { calcAllIndicators, calcBB4 } from "@/indicators/index";
import { loadKnnConfig } from "@/knn/engine";
import { applyTimeDecay, loadTimeDecayConfig } from "@/knn/time-decay";
import { makeDecision } from "@/knn/decision";
import { checkLossLimit } from "@/limits/loss-limit";
import { executeEntry } from "@/orders/executor";
import { canPyramid } from "@/positions/pyramid";
import { calculateSize, getRiskPct } from "@/positions/sizer";
import { checkEvidence } from "@/signals/evidence-gate";
import { checkSafety } from "@/signals/safety-gate";
import {
  checkInvalidation,
  detectWatching,
} from "@/signals/watching";
import { vectorize } from "@/vectors/vectorizer";
import type { PipelineDeps } from "@/daemon/pipeline";
import { determineDailyBias } from "@/filters/daily-direction";
import type { MockExchangeAdapter } from "./mock-adapter";

// ---------------------------------------------------------------------------
// Collector types
// ---------------------------------------------------------------------------

/**
 * In-memory collectors for backtest — hold records that would normally go to DB.
 */
export type BacktestCollectors = {
  /** Tickets created during the backtest run */
  tickets: Ticket[];
  /** Vector rows inserted during the backtest run */
  vectors: VectorRow[];
  /** Event log rows during the backtest run */
  events: EventLogRow[];
  /** In-memory watch sessions (keyed by id) */
  watchSessions: Map<string, WatchSession>;
  /** Currently active watch session per symbol@exchange */
  activeWatchSessions: Map<string, string>;
};

// ---------------------------------------------------------------------------
// In-memory watch session state
// ---------------------------------------------------------------------------

/**
 * Builds a WatchSession domain object from open params.
 */
function buildWatchSession(
  id: string,
  params: {
    symbol: string;
    exchange: string;
    detectionType: WatchSession["detection_type"];
    direction: WatchSession["direction"];
    tp1Price: ReturnType<typeof d>;
    tp2Price: ReturnType<typeof d>;
    detectedAt: Date;
    contextData: object;
  },
): WatchSession {
  return {
    id,
    symbol: params.symbol,
    exchange: params.exchange as Exchange,
    detection_type: params.detectionType,
    direction: params.direction,
    tp1_price: params.tp1Price,
    tp2_price: params.tp2Price,
    detected_at: params.detectedAt,
    invalidated_at: null,
    invalidation_reason: null,
    context_data: params.contextData,
    created_at: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a PipelineDeps object suitable for backtest execution.
 *
 * @param adapter  MockExchangeAdapter for the exchange being tested.
 * @param exchange The exchange label matching the adapter's config.
 * @param db       A real DbInstance for read-only operations (candles, etc.)
 *                 or a stub object for purely in-memory tests.
 * @returns        { deps: PipelineDeps, collectors: BacktestCollectors }
 */
export function createBacktestPipelineDeps(
  adapter: MockExchangeAdapter,
  exchange: Exchange,
  db: DbInstance,
): { deps: PipelineDeps; collectors: BacktestCollectors } {
  const collectors: BacktestCollectors = {
    tickets: [],
    vectors: [],
    events: [],
    watchSessions: new Map(),
    activeWatchSessions: new Map(),
  };

  // Adapters map — single exchange for backtest
  const adaptersMap: Map<Exchange, ExchangeAdapter> = new Map([[exchange, adapter]]);

  // ---------------------------------------------------------------------------
  // getCandles — delegate to mock adapter
  // ---------------------------------------------------------------------------
  async function getCandles(
    _db: DbInstance,
    symbol: string,
    _exchange: string,
    timeframe: Timeframe,
    limit: number,
  ): Promise<Candle[]> {
    return adapter.fetchOHLCV(symbol, timeframe, undefined, limit);
  }

  // ---------------------------------------------------------------------------
  // Watch session in-memory state
  // ---------------------------------------------------------------------------

  function watchSessionKey(symbol: string, exch: string): string {
    return `${symbol}@${exch}`;
  }

  async function getActiveWatchSession(
    _db: DbInstance,
    symbol: string,
    exch: string,
  ): Promise<WatchSession | null> {
    const key = watchSessionKey(symbol, exch);
    const sessionId = collectors.activeWatchSessions.get(key);
    if (sessionId === undefined) return null;
    return collectors.watchSessions.get(sessionId) ?? null;
  }

  async function openWatchSession(
    _db: DbInstance,
    params: Parameters<PipelineDeps["openWatchSession"]>[1],
  ): Promise<WatchSession> {
    const key = watchSessionKey(params.symbol, params.exchange);

    // Invalidate existing active session
    const existingId = collectors.activeWatchSessions.get(key);
    if (existingId !== undefined) {
      const existing = collectors.watchSessions.get(existingId);
      if (existing !== undefined) {
        collectors.watchSessions.set(existingId, {
          ...existing,
          invalidated_at: new Date(),
          invalidation_reason: "new_session_started",
        });
      }
    }

    const id = globalThis.crypto.randomUUID();
    const session = buildWatchSession(id, {
      symbol: params.symbol,
      exchange: params.exchange,
      detectionType: params.detectionType,
      direction: params.direction,
      tp1Price: params.tp1Price,
      tp2Price: params.tp2Price,
      detectedAt: params.detectedAt,
      contextData: params.contextData,
    });

    collectors.watchSessions.set(id, session);
    collectors.activeWatchSessions.set(key, id);

    return session;
  }

  async function invalidateWatchSession(
    _db: DbInstance,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    const session = collectors.watchSessions.get(sessionId);
    if (session !== undefined) {
      collectors.watchSessions.set(sessionId, {
        ...session,
        invalidated_at: new Date(),
        invalidation_reason: reason,
      });

      const key = watchSessionKey(session.symbol, session.exchange);
      if (collectors.activeWatchSessions.get(key) === sessionId) {
        collectors.activeWatchSessions.delete(key);
      }
    }
  }

  async function updateWatchSessionTp(
    _db: DbInstance,
    sessionId: string,
    tp1: ReturnType<typeof d>,
    tp2: ReturnType<typeof d>,
  ): Promise<void> {
    const session = collectors.watchSessions.get(sessionId);
    if (session !== undefined) {
      collectors.watchSessions.set(sessionId, {
        ...session,
        tp1_price: tp1,
        tp2_price: tp2,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // createTicket — in-memory collector
  // ---------------------------------------------------------------------------
  async function createTicket(
    _db: DbInstance,
    params: Parameters<PipelineDeps["createTicket"]>[1],
  ): Promise<Ticket> {
    const now = new Date();
    const ticket: Ticket = {
      id: globalThis.crypto.randomUUID(),
      symbol: params.symbol,
      exchange: params.exchange as Exchange,
      signal_id: params.signalId,
      parent_ticket_id: null,
      timeframe: params.timeframe,
      direction: params.direction,
      state: "INITIAL",
      entry_price: d(params.entryPrice),
      sl_price: d(params.slPrice),
      current_sl_price: d(params.slPrice),
      size: d(params.size),
      remaining_size: d(params.size),
      leverage: params.leverage,
      tp1_price: params.tp1Price !== undefined ? d(params.tp1Price) : null,
      tp2_price: params.tp2Price !== undefined ? d(params.tp2Price) : null,
      trailing_active: false,
      trailing_price: null,
      max_profit: d("0"),
      pyramid_count: 0,
      opened_at: now,
      closed_at: null,
      close_reason: null,
      result: null,
      pnl: null,
      pnl_pct: null,
      max_favorable: null,
      max_adverse: null,
      hold_duration_sec: null,
      created_at: now,
      updated_at: now,
    };

    collectors.tickets.push(ticket);
    return ticket;
  }

  // ---------------------------------------------------------------------------
  // insertVector — in-memory collector
  // ---------------------------------------------------------------------------
  async function insertVectorBacktest(
    _db: DbInstance,
    params: Parameters<PipelineDeps["insertVector"]>[1],
  ): Promise<VectorRow> {
    const now = new Date();
    const row: VectorRow = {
      id: globalThis.crypto.randomUUID(),
      candle_id: params.candleId,
      symbol: params.symbol,
      exchange: params.exchange,
      timeframe: params.timeframe,
      embedding: `[${Array.from(params.embedding).join(",")}]`,
      label: null,
      grade: null,
      labeled_at: null,
      created_at: now,
    };

    collectors.vectors.push(row);
    return row;
  }

  // ---------------------------------------------------------------------------
  // insertEvent — in-memory collector
  // ---------------------------------------------------------------------------
  async function insertEventBacktest(
    _db: DbInstance,
    params: InsertEventParams,
  ): Promise<EventLogRow> {
    const now = new Date();
    const row: EventLogRow = {
      id: globalThis.crypto.randomUUID(),
      event_type: params.event_type,
      symbol: params.symbol ?? null,
      exchange: params.exchange ?? null,
      ref_id: params.ref_id ?? null,
      ref_type: params.ref_type ?? null,
      data: params.data ?? null,
      created_at: now,
    };

    collectors.events.push(row);
    return row;
  }

  // ---------------------------------------------------------------------------
  // canPyramid — wraps positions/pyramid.canPyramid with adapted signature
  // ---------------------------------------------------------------------------
  function canPyramidBacktest(
    ticket: Ticket,
    _currentPrice: ReturnType<typeof d>,
    maxPyramidCount: number,
  ): ReturnType<typeof canPyramid> {
    // Adapt Ticket domain type to TicketRow-like shape expected by canPyramid
    const ticketRow = {
      id: ticket.id,
      symbol: ticket.symbol,
      exchange: ticket.exchange,
      signal_id: ticket.signal_id,
      parent_ticket_id: ticket.parent_ticket_id,
      timeframe: ticket.timeframe,
      direction: ticket.direction,
      state: ticket.state,
      entry_price: ticket.entry_price.toString(),
      sl_price: ticket.sl_price.toString(),
      current_sl_price: ticket.current_sl_price.toString(),
      size: ticket.size.toString(),
      remaining_size: ticket.remaining_size.toString(),
      leverage: ticket.leverage,
      tp1_price: ticket.tp1_price?.toString() ?? null,
      tp2_price: ticket.tp2_price?.toString() ?? null,
      trailing_active: ticket.trailing_active,
      trailing_price: ticket.trailing_price?.toString() ?? null,
      max_profit: ticket.max_profit?.toString() ?? "0",
      pyramid_count: ticket.pyramid_count ?? 0,
      opened_at: ticket.opened_at,
      closed_at: ticket.closed_at,
      close_reason: ticket.close_reason,
      result: ticket.result,
      pnl: ticket.pnl?.toString() ?? null,
      pnl_pct: ticket.pnl_pct?.toString() ?? null,
      max_favorable: ticket.max_favorable?.toString() ?? null,
      max_adverse: ticket.max_adverse?.toString() ?? null,
      hold_duration_sec: ticket.hold_duration_sec,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    };

    return canPyramid(ticketRow as Parameters<typeof canPyramid>[0], { maxPyramidCount });
  }

  // ---------------------------------------------------------------------------
  // computeEntrySize — uses balance from adapter + default symbol info
  // ---------------------------------------------------------------------------
  async function computeEntrySize(
    adapterArg: Parameters<PipelineDeps["computeEntrySize"]>[0],
    symbol: string,
    _exchange: string,
    evidence: Parameters<PipelineDeps["computeEntrySize"]>[3],
  ) {
    const { available: balance } = await adapterArg.fetchBalance();
    const symbolInfo = await adapterArg.getExchangeInfo(symbol);
    const riskPct = getRiskPct(balance);

    const sizeResult = calculateSize({
      balance,
      entryPrice: evidence.entryPrice,
      slPrice: evidence.slPrice,
      direction: evidence.direction,
      exchangeInfo: symbolInfo,
      riskPct,
    });

    if (sizeResult === null) {
      return { size: symbolInfo.minOrderSize, leverage: 1 };
    }

    return { size: sizeResult.size, leverage: sizeResult.leverage };
  }

  // ---------------------------------------------------------------------------
  // Assemble PipelineDeps
  // ---------------------------------------------------------------------------
  const deps: PipelineDeps = {
    db,
    adapters: adaptersMap as ReadonlyMap<Exchange, ExchangeAdapter>,

    // Candle history
    getCandles,

    // Indicators — real implementations
    calcAllIndicators,
    calcBB4,

    // Symbol state
    getSymbolState: async (_db, _symbol, _exchange) => null,

    // Filters
    determineDailyBias,
    updateDailyBias: async (_db, _symbol, _exchange, _bias: DailyBias, _dailyOpen) => {},
    isTradeBlocked: async (_db, _now) => ({ blocked: false }),

    // Watch sessions
    detectWatching,
    getActiveWatchSession,
    openWatchSession,
    invalidateWatchSession,
    checkInvalidation,
    updateWatchSessionTp,

    // Signals — real implementations
    checkEvidence,
    checkSafety,

    // Vectors
    vectorize,
    insertVector: insertVectorBacktest,

    // KNN
    searchKnn: async (_db, _embedding, _options) => [],
    applyTimeDecay,
    loadTimeDecayConfig,
    makeDecision,
    loadKnnConfig: async (_db) => ({ topK: 50, distanceMetric: "cosine" } as ReturnType<typeof loadKnnConfig> extends Promise<infer T> ? T : never),

    // Positions
    getActiveTicket: async (_db, _symbol, _exchange) => null,
    canPyramid: canPyramidBacktest,
    computeEntrySize,
    createTicket,

    // Orders
    executeEntry,
    loadSlippageConfig: async (_db) => ({ maxSpreadPct: d("0.05") }),

    // Exits — real implementations
    checkExit,
    processExit,
    processTrailing,
    updateTpPrices,
    updateMfeMae,

    // Loss limits
    checkLossLimit,
    loadLossLimitConfig: async (_db) => ({
      maxDailyLossPct: d("1"), // 100% — effectively no daily limit
      maxSessionLosses: 999,
      maxHourly5m: 999,
      maxHourly1m: 999,
    }),

    // Notifications
    sendSlackAlert: async () => {},

    // Event log
    insertEvent: insertEventBacktest,
  };

  return { deps, collectors };
}
