/**
 * Backtest strategy callback — wires the Double-BB signal pipeline into
 * the BacktestRunner's OnCandleClose callback.
 *
 * Uses the same pure functions as the live daemon pipeline:
 *   calcAllIndicators, detectWatching, checkEvidence, checkSafety,
 *   determineDailyBias, calculateSize, getRiskPct
 *
 * State is held in-memory (no DB writes for watch sessions or signals).
 *
 * Pipeline per candle:
 *   1D → daily bias update
 *   1H → watch session detection / invalidation
 *   5M / 1M → entry signal (evidence + safety) → order execution
 *   All TF → SL monitoring via adapter.checkPendingOrders
 */

import type { Decimal } from "@/core/decimal";
import { d } from "@/core/decimal";
import type {
  Candle,
  DailyBias,
  Direction,
  Exchange,
  Timeframe,
  VectorTimeframe,
  WatchSession,
} from "@/core/types";
import type { BacktestTrade } from "./engine";
import type { MockExchangeAdapter } from "./mock-adapter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum candle window size per timeframe for indicator calculation */
const WINDOW_SIZE = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PositionState = {
  direction: Direction;
  entryPrice: Decimal;
  size: Decimal;
  openedAt: Date;
  slOrderId: string;
};

// ---------------------------------------------------------------------------
// In-memory WatchSession builder (mirrors pipeline-adapter.ts pattern)
// ---------------------------------------------------------------------------

function buildInMemoryWatchSession(
  watching: {
    detectionType: WatchSession["detection_type"];
    direction: Direction;
    tp1Price: Decimal;
    tp2Price: Decimal;
    contextData: object;
  },
  candle: Candle,
): WatchSession {
  return {
    id: globalThis.crypto.randomUUID(),
    symbol: candle.symbol,
    exchange: candle.exchange as Exchange,
    detection_type: watching.detectionType,
    direction: watching.direction,
    tp1_price: watching.tp1Price,
    tp2_price: watching.tp2Price,
    detected_at: candle.open_time,
    invalidated_at: null,
    invalidation_reason: null,
    context_data: watching.contextData,
    created_at: candle.open_time,
  };
}

// ---------------------------------------------------------------------------
// createBacktestStrategy
// ---------------------------------------------------------------------------

export function createBacktestStrategy(symbol: string) {
  // Lazy imports — avoid circular deps and keep the module lightweight
  let _deps: {
    calcAllIndicators: typeof import("@/indicators/index").calcAllIndicators;
    detectWatching: typeof import("@/signals/watching").detectWatching;
    checkInvalidation: typeof import("@/signals/watching").checkInvalidation;
    checkEvidence: typeof import("@/signals/evidence-gate").checkEvidence;
    checkSafety: typeof import("@/signals/safety-gate").checkSafety;
    determineDailyBias: typeof import("@/filters/daily-direction").determineDailyBias;
    calculateSize: typeof import("@/positions/sizer").calculateSize;
    getRiskPct: typeof import("@/positions/sizer").getRiskPct;
  } | null = null;

  async function loadDeps() {
    if (_deps) return _deps;
    const [indicators, watching, evidence, safety, dailyDir, sizer] = await Promise.all([
      import("@/indicators/index"),
      import("@/signals/watching"),
      import("@/signals/evidence-gate"),
      import("@/signals/safety-gate"),
      import("@/filters/daily-direction"),
      import("@/positions/sizer"),
    ]);
    _deps = {
      calcAllIndicators: indicators.calcAllIndicators,
      detectWatching: watching.detectWatching,
      checkInvalidation: watching.checkInvalidation,
      checkEvidence: evidence.checkEvidence,
      checkSafety: safety.checkSafety,
      determineDailyBias: dailyDir.determineDailyBias,
      calculateSize: sizer.calculateSize,
      getRiskPct: sizer.getRiskPct,
    };
    return _deps;
  }

  // ---- Strategy state ----
  const candleWindows = new Map<Timeframe, Candle[]>();
  let dailyBias: DailyBias = "NEUTRAL";
  let watchSession: WatchSession | null = null;
  let position: PositionState | null = null;

  // ---- Candle window helper ----
  function pushCandle(tf: Timeframe, candle: Candle): Candle[] {
    let window = candleWindows.get(tf);
    if (!window) {
      window = [];
      candleWindows.set(tf, window);
    }
    window.push(candle);
    if (window.length > WINDOW_SIZE) window.shift();
    return window;
  }

  // ---- The OnCandleClose callback ----
  return async (
    candle: Candle,
    adapter: MockExchangeAdapter,
    addTrade: (trade: BacktestTrade) => void,
  ): Promise<void> => {
    const deps = await loadDeps();
    const tf = candle.timeframe as Timeframe;
    const window = pushCandle(tf, candle);

    // ── SL monitoring (every candle, before anything else) ──────────────
    if (position) {
      const fills = adapter.checkPendingOrders(candle);
      for (const fill of fills) {
        if (fill.status === "FILLED" && fill.filledPrice && position) {
          const pnl =
            position.direction === "LONG"
              ? fill.filledPrice.minus(position.entryPrice).times(position.size)
              : position.entryPrice.minus(fill.filledPrice).times(position.size);
          const cost = position.entryPrice.times(position.size);
          const pnlPct = cost.isZero() ? d("0") : pnl.dividedBy(cost).times("100");
          addTrade({
            direction: position.direction,
            entryPrice: position.entryPrice,
            exitPrice: fill.filledPrice,
            size: position.size,
            pnl,
            pnlPct,
            holdDurationSec: Math.floor(
              (candle.open_time.getTime() - position.openedAt.getTime()) / 1000,
            ),
            result: pnl.isPositive() ? "WIN" : "LOSS",
            openedAt: position.openedAt,
            closedAt: candle.open_time,
          });
          position = null;
          watchSession = null;
        }
      }
    }

    // ── 1D: daily bias update ──────────────────────────────────────────
    if (tf === "1D" && window.length >= 2) {
      const indicators = deps.calcAllIndicators(window);
      if (indicators.sma20 !== null && indicators.prevSma20 !== null) {
        dailyBias = deps.determineDailyBias(
          candle.close,
          candle.open,
          indicators.sma20,
          indicators.prevSma20,
        );
      }
    }

    // ── 1H: watch session management ───────────────────────────────────
    if (tf === "1H") {
      const indicators = deps.calcAllIndicators(window);

      if (watchSession && !position) {
        // Check invalidation
        const reason = deps.checkInvalidation(candle, indicators, watchSession, dailyBias);
        if (reason) {
          watchSession = null;
        }
      }

      if (!watchSession && !position) {
        // Try to detect new watching condition
        const result = deps.detectWatching(candle, indicators, dailyBias);
        if (result) {
          watchSession = buildInMemoryWatchSession(result, candle);
        }
      }
    }

    // ── 5M / 1M: entry pipeline ────────────────────────────────────────
    if ((tf === "5M" || tf === "1M") && watchSession && !position) {
      const indicators = deps.calcAllIndicators(window);

      const evidence = deps.checkEvidence(candle, indicators, watchSession);
      if (evidence) {
        const safetyResult = deps.checkSafety(
          candle,
          indicators,
          { direction: evidence.direction, timeframe: tf as VectorTimeframe },
          { session_box_high: null, session_box_low: null, daily_bias: dailyBias },
          window,
        );

        if (safetyResult.passed) {
          // Compute position size
          const { available: balance } = await adapter.fetchBalance();
          const exchangeInfo = await adapter.getExchangeInfo(symbol);
          const riskPct = deps.getRiskPct(balance);
          const sizeResult = deps.calculateSize({
            balance,
            entryPrice: evidence.entryPrice,
            slPrice: evidence.slPrice,
            direction: evidence.direction,
            exchangeInfo,
            riskPct,
          });

          let size = sizeResult ? sizeResult.size : exchangeInfo.minOrderSize;

          // Cap size to available balance (MockAdapter uses 1x leverage)
          const maxSize = balance.dividedBy(evidence.entryPrice).times("0.95"); // 5% margin
          if (size.greaterThan(maxSize)) {
            size = maxSize;
          }
          if (size.lessThan(exchangeInfo.minOrderSize)) return;

          const side = evidence.direction === "LONG" ? "BUY" : "SELL";

          // Place entry order — skip on insufficient balance
          let entryResult;
          try {
            entryResult = await adapter.createOrder({
              symbol,
              side: side as "BUY" | "SELL",
              type: "market",
              size,
            });
          } catch {
            return; // insufficient balance — skip this entry
          }

          if (entryResult.status === "FILLED" && entryResult.filledPrice && entryResult.filledSize) {
            // Place SL order (MUST be before any other post-entry action)
            const slSide = evidence.direction === "LONG" ? "SELL" : "BUY";
            const slResult = await adapter.createOrder({
              symbol,
              side: slSide as "BUY" | "SELL",
              type: "stop_market",
              size: entryResult.filledSize,
              price: evidence.slPrice,
              reduceOnly: true,
            });

            position = {
              direction: evidence.direction,
              entryPrice: entryResult.filledPrice,
              size: entryResult.filledSize,
              openedAt: candle.open_time,
              slOrderId: slResult.orderId,
            };
          }
        }
      }
    }
  };
}
