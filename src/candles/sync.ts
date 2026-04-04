import { TIMEFRAMES } from "@/core/constants";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type { Timeframe } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { getDb } from "@/db/pool";
import { downloadCandles, fetchCandlesViaREST, type NewCandle } from "./history-loader";
import { bulkUpsertCandles, getLatestCandleTime } from "./repository";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("candle-sync");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncResult = {
  symbol: string;
  exchange: string;
  timeframe: string;
  inserted: number;
  skipped: number;
  errors: string[];
};

export type SyncOptions = {
  symbols: Array<{ symbol: string; exchange: string }>;
  timeframes?: Timeframe[];
  adapter?: ExchangeAdapter;
  // For dependency injection (testing):
  downloadFn?: typeof downloadCandles;
  fetchRestFn?: typeof fetchCandlesViaREST;
  upsertFn?: typeof bulkUpsertCandles;
  getLatestFn?: typeof getLatestCandleTime;
  /** Injectable DB instance (testing) */
  db?: DbInstance;
  /** Injectable "now" for deterministic tests */
  now?: Date;
};

// ---------------------------------------------------------------------------
// Retention periods
// ---------------------------------------------------------------------------

const RETENTION_MONTHS: Record<Timeframe, number> = {
  "1D": 36,
  "1H": 36,
  "5M": 36,
  "1M": 6,
};

/**
 * Computes the retention start date for a given timeframe.
 */
function getRetentionStart(timeframe: Timeframe, now: Date): Date {
  const months = RETENTION_MONTHS[timeframe];
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
}

/**
 * Computes yesterday 23:59:59 UTC — the `to` boundary for sync.
 */
function getYesterdayEnd(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59),
  );
}

// ---------------------------------------------------------------------------
// One-day constant (ms)
// ---------------------------------------------------------------------------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// syncCandles
// ---------------------------------------------------------------------------

/**
 * Synchronises candle data for the given symbols and timeframes.
 *
 * For each (symbol, exchange, timeframe) combination it:
 *   1. Determines the retention window start (3 years for 1D/1H/5M, 6 months for 1M).
 *   2. Queries the latest candle time already stored in the DB.
 *   3. Subtracts 1 day from `from` to always re-download the last day (미완결 캔들 보정).
 *   4. Downloads candles from Binance public data. On failure, falls back to CCXT REST if an adapter is provided.
 *   5. Upserts downloaded candles into the DB.
 *
 * Individual symbol/timeframe failures do not stop other pairs from syncing.
 */
export async function syncCandles(options: SyncOptions): Promise<SyncResult[]> {
  const {
    symbols,
    timeframes = [...TIMEFRAMES],
    adapter,
    downloadFn = downloadCandles,
    fetchRestFn = fetchCandlesViaREST,
    upsertFn = bulkUpsertCandles,
    getLatestFn = getLatestCandleTime,
    db: injectedDb,
    now: injectedNow,
  } = options;

  const now = injectedNow ?? new Date();
  const db = injectedDb ?? getDb();
  const to = getYesterdayEnd(now);
  const results: SyncResult[] = [];

  for (const { symbol, exchange } of symbols) {
    for (const timeframe of timeframes) {
      const result: SyncResult = {
        symbol,
        exchange,
        timeframe,
        inserted: 0,
        skipped: 0,
        errors: [],
      };

      try {
        const startTime = Date.now();

        // 1. Retention start
        const retentionStart = getRetentionStart(timeframe, now);

        // 2. Latest candle in DB
        const latestTime = await getLatestFn(db, symbol, exchange, timeframe);

        // 3. Compute `from`: max(retention start, latest candle time), or retention start if no data
        let from: Date;
        if (latestTime !== null && latestTime > retentionStart) {
          from = latestTime;
        } else {
          from = retentionStart;
        }

        // 4. Always re-download last day (subtract 1 day)
        from = new Date(from.getTime() - ONE_DAY_MS);

        // Clamp: from should not be before retention start
        if (from < retentionStart) {
          from = retentionStart;
        }

        // Skip if to <= from (nothing to download)
        if (to <= from) {
          log.info("sync_skip", {
            symbol,
            exchange,
            details: {
              timeframe,
              reason: "to <= from",
              from: from.toISOString(),
              to: to.toISOString(),
            },
          });
          results.push(result);
          continue;
        }

        // 5. Download candles
        let candles: NewCandle[] = [];
        let downloadFailed = false;

        let downloadError = "";
        try {
          candles = await downloadFn(
            symbol,
            exchange as "binance" | "okx" | "bitget" | "mexc",
            timeframe,
            from,
            to,
          );
        } catch (err) {
          downloadFailed = true;
          downloadError = err instanceof Error ? err.message : String(err);
          log.warn("sync_download_failed", {
            symbol,
            exchange,
            details: { timeframe, error: downloadError },
          });
        }

        // If download returned empty or failed, try REST fallback
        if ((candles.length === 0 || downloadFailed) && adapter !== undefined) {
          try {
            log.info("sync_rest_fallback", {
              symbol,
              exchange,
              details: { timeframe },
            });
            candles = await fetchRestFn(adapter, symbol, timeframe, from.getTime());
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`REST fallback failed: ${msg}`);
            log.warn("sync_rest_fallback_failed", {
              symbol,
              exchange,
              details: { timeframe, error: msg },
            });
          }
        } else if (downloadFailed) {
          // Download failed and no adapter to fall back to
          result.errors.push(`Download failed: ${downloadError}`);
        } else if (candles.length === 0) {
          // Download succeeded but returned nothing (no data for this range)
          log.info("sync_no_data", {
            symbol,
            exchange,
            details: {
              timeframe,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          });
        }

        // 6. Upsert
        if (candles.length > 0) {
          const upserted = await upsertFn(db, candles);
          result.inserted = upserted;
          result.skipped = candles.length - upserted;
        }

        const elapsed = Date.now() - startTime;
        log.info("sync_complete", {
          symbol,
          exchange,
          details: {
            timeframe,
            downloaded: candles.length,
            inserted: result.inserted,
            skipped: result.skipped,
            elapsedMs: elapsed,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(msg);
        log.error("sync_error", {
          symbol,
          exchange,
          details: { timeframe, error: msg },
        });
      }

      results.push(result);
    }
  }

  return results;
}
