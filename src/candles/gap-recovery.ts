import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type { Timeframe } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { getDb } from "@/db/pool";
import { type CandleGap, detectGaps } from "./gap-detection";
import type { NewCandle } from "./history-loader";
import { fetchCandlesViaREST } from "./history-loader";
import { bulkUpsertCandles } from "./repository";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecoveryResult = {
  symbol: string;
  exchange: string;
  timeframe: string;
  gapsFound: number;
  candlesRecovered: number;
  errors: number;
};

// ─── Dependency function types ────────────────────────────────────────────────

type DetectGapsFn = (
  symbol: string,
  exchange: string,
  timeframe: Timeframe,
  from: Date,
  to: Date,
) => Promise<CandleGap[]>;

type FetchCandlesFn = (
  adapter: ExchangeAdapter,
  symbol: string,
  timeframe: Timeframe,
  since: number,
  limit?: number,
) => Promise<NewCandle[]>;

type UpsertFn = (db: DbInstance, candles: NewCandle[]) => Promise<number>;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Recovery window: scan the last 24 hours for gaps. */
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Delay between gap recovery fetches to protect against rate limits. */
const GAP_DELAY_MS = 500;

// ─── GapRecovery ──────────────────────────────────────────────────────────────

export class GapRecovery {
  private readonly log = createLogger("candles");
  private readonly detectGapsFn: DetectGapsFn;
  private readonly fetchCandlesFn: FetchCandlesFn;
  private readonly upsertFn: UpsertFn;

  constructor(
    detectGapsFn: DetectGapsFn = detectGaps,
    fetchCandlesFn: FetchCandlesFn = fetchCandlesViaREST,
    upsertFn: UpsertFn = bulkUpsertCandles,
  ) {
    this.detectGapsFn = detectGapsFn;
    this.fetchCandlesFn = fetchCandlesFn;
    this.upsertFn = upsertFn;
  }

  /**
   * Recovers gaps for a single symbol/exchange/timeframe combination.
   * Scans the last 24 hours, detects gaps, and fills them via REST API.
   */
  async recover(
    symbol: string,
    exchange: string,
    timeframe: Timeframe,
    adapter: ExchangeAdapter,
  ): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      symbol,
      exchange,
      timeframe,
      gapsFound: 0,
      candlesRecovered: 0,
      errors: 0,
    };

    const now = new Date();
    const from = new Date(now.getTime() - RECOVERY_WINDOW_MS);

    const gaps = await this.detectGapsFn(symbol, exchange, timeframe, from, now);
    result.gapsFound = gaps.length;

    if (gaps.length === 0) {
      this.log.debug("gap_recovery_no_gaps", {
        symbol,
        exchange,
        details: { timeframe },
      });
      return result;
    }

    this.log.info("gap_recovery_start", {
      symbol,
      exchange,
      details: { timeframe, gapsFound: gaps.length },
    });

    for (let i = 0; i < gaps.length; i++) {
      const gap = gaps[i] as CandleGap;

      try {
        const candles = await this.fetchCandlesFn(
          adapter,
          symbol,
          timeframe,
          gap.from.getTime(),
          gap.expectedCount + 10,
        );

        if (candles.length > 0) {
          const db = getDb();
          const upserted = await this.upsertFn(db, candles);
          result.candlesRecovered += upserted;
        }

        this.log.debug("gap_recovery_filled", {
          symbol,
          exchange,
          details: {
            timeframe,
            gapIndex: i,
            expectedCount: gap.expectedCount,
            fetched: candles.length,
          },
        });
      } catch (err) {
        result.errors++;
        this.log.error("gap_recovery_error", {
          symbol,
          exchange,
          details: {
            timeframe,
            gapIndex: i,
            from: gap.from.toISOString(),
            to: gap.to.toISOString(),
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }

      // Rate limit delay between gaps (skip after the last gap)
      if (i < gaps.length - 1) {
        await new Promise((r) => setTimeout(r, GAP_DELAY_MS));
      }
    }

    this.log.info("gap_recovery_complete", {
      symbol,
      exchange,
      details: {
        timeframe,
        gapsFound: result.gapsFound,
        candlesRecovered: result.candlesRecovered,
        errors: result.errors,
      },
    });

    return result;
  }

  /**
   * Recovers gaps for all symbol/exchange/timeframe combinations.
   * Iterates sequentially to respect rate limits.
   */
  async recoverAll(
    symbols: Array<{ symbol: string; exchange: string }>,
    timeframes: Timeframe[],
    adapter: ExchangeAdapter,
  ): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];

    for (const { symbol, exchange } of symbols) {
      for (const timeframe of timeframes) {
        const result = await this.recover(symbol, exchange, timeframe, adapter);
        results.push(result);
      }
    }

    return results;
  }
}
