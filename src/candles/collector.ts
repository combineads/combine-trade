import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, OHLCVCallback, Unsubscribe } from "@/core/ports";
import type { Candle, Timeframe } from "@/core/types";
import { getDb } from "@/db/pool";
import type { NewCandle } from "./history-loader";
import { bulkUpsertCandles } from "./repository";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CollectorStatus = {
  activeSubscriptions: number;
  lastReceivedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEFRAME_DURATION_MS: Record<Timeframe, number> = {
  "1D": 86_400_000,
  "1H": 3_600_000,
  "5M": 300_000,
  "1M": 60_000,
};

const RECONNECT_MULTIPLIER = 3;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("candles");

// ---------------------------------------------------------------------------
// CandleCollector
// ---------------------------------------------------------------------------

/**
 * Subscribes to exchange WebSocket kline streams for all symbol x timeframe
 * combinations and persists incoming candles to the database via UPSERT.
 *
 * Design decisions:
 * - Each subscription is keyed as "symbol:timeframe" in an internal Map.
 * - Individual UPSERT failures are logged but never stop the collector.
 * - Reconnection is detected per-subscription when the gap since the last
 *   candle exceeds `timeframeDuration * 3`.
 */
export class CandleCollector {
  private subscriptions = new Map<string, Unsubscribe>();
  private lastReceivedAt: Date | null = null;
  private lastReceivedPerSub = new Map<string, Date>();
  private reconnectCallbacks = new Set<() => void>();

  // -----------------------------------------------------------------------
  // start
  // -----------------------------------------------------------------------

  async start(symbols: string[], timeframes: Timeframe[], adapter: ExchangeAdapter): Promise<void> {
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        const key = `${symbol}:${timeframe}`;

        // Skip if already subscribed
        if (this.subscriptions.has(key)) {
          log.warn("subscription_already_exists", { symbol, details: { timeframe, key } });
          continue;
        }

        try {
          const callback: OHLCVCallback = (candle: Candle) => {
            this.handleCandle(candle, key, timeframe);
          };

          const unsubscribe = await adapter.watchOHLCV(symbol, timeframe, callback);
          this.subscriptions.set(key, unsubscribe);

          log.info("subscription_started", { symbol, details: { timeframe, key } });
        } catch (err) {
          log.error("subscription_failed", {
            symbol,
            details: {
              timeframe,
              key,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // stop
  // -----------------------------------------------------------------------

  async stop(): Promise<void> {
    for (const [key, unsubscribe] of this.subscriptions) {
      try {
        unsubscribe();
        log.info("subscription_stopped", { details: { key } });
      } catch (err) {
        log.error("unsubscribe_failed", {
          details: {
            key,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
    this.subscriptions.clear();
  }

  // -----------------------------------------------------------------------
  // getStatus
  // -----------------------------------------------------------------------

  getStatus(): CollectorStatus {
    return {
      activeSubscriptions: this.subscriptions.size,
      lastReceivedAt: this.lastReceivedAt,
    };
  }

  // -----------------------------------------------------------------------
  // onReconnect
  // -----------------------------------------------------------------------

  onReconnect(callback: () => void): Unsubscribe {
    this.reconnectCallbacks.add(callback);
    return () => {
      this.reconnectCallbacks.delete(callback);
    };
  }

  // -----------------------------------------------------------------------
  // Internal: handle incoming candle
  // -----------------------------------------------------------------------

  private handleCandle(candle: Candle, key: string, timeframe: Timeframe): void {
    const now = new Date();

    // Check for reconnection gap
    const lastForSub = this.lastReceivedPerSub.get(key);
    if (lastForSub !== undefined) {
      const gap = now.getTime() - lastForSub.getTime();
      const threshold = TIMEFRAME_DURATION_MS[timeframe] * RECONNECT_MULTIPLIER;
      if (gap > threshold) {
        log.warn("reconnection_detected", {
          symbol: candle.symbol,
          details: { timeframe, key, gapMs: gap, thresholdMs: threshold },
        });
        this.fireReconnectCallbacks();
      }
    }

    // Update timestamps
    this.lastReceivedAt = now;
    this.lastReceivedPerSub.set(key, now);

    // Convert Candle to NewCandle (strip id, created_at)
    const newCandle: NewCandle = {
      symbol: candle.symbol,
      exchange: candle.exchange,
      timeframe: candle.timeframe,
      open_time: candle.open_time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      is_closed: candle.is_closed,
    };

    // Persist to DB — never let a failure stop collection
    bulkUpsertCandles(getDb(), [newCandle]).catch((err) => {
      log.error("upsert_failed", {
        symbol: candle.symbol,
        details: {
          timeframe: candle.timeframe,
          open_time: candle.open_time.toISOString(),
          is_closed: candle.is_closed,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    });

    log.debug("candle_received", {
      symbol: candle.symbol,
      details: {
        timeframe: candle.timeframe,
        open_time: candle.open_time.toISOString(),
        is_closed: candle.is_closed,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Internal: fire reconnect callbacks
  // -----------------------------------------------------------------------

  private fireReconnectCallbacks(): void {
    for (const cb of this.reconnectCallbacks) {
      try {
        cb();
      } catch (err) {
        log.error("reconnect_callback_error", {
          details: {
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }
}
