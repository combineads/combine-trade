import { unzipSync } from "fflate";
import { Decimal } from "@/core/decimal";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter } from "@/core/ports";
import type { Candle, Exchange, Timeframe } from "@/core/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NewCandle = Omit<Candle, "id" | "created_at">;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("history-loader");

// ---------------------------------------------------------------------------
// Timeframe mapping
// ---------------------------------------------------------------------------

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  "1D": "1d",
  "1H": "1h",
  "5M": "5m",
  "1M": "1m",
};

/**
 * Maps application Timeframe to Binance lowercase interval format.
 */
export function mapTimeframe(tf: Timeframe): string {
  return TIMEFRAME_MAP[tf];
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

const BASE_URL = "https://data.binance.vision/data/futures/um";

/**
 * Builds a Binance public data monthly ZIP URL.
 */
export function buildMonthlyUrl(
  symbol: string,
  interval: string,
  year: number,
  month: number,
): string {
  const mm = String(month).padStart(2, "0");
  return `${BASE_URL}/monthly/klines/${symbol}/${interval}/${symbol}-${interval}-${year}-${mm}.zip`;
}

/**
 * Builds a Binance public data daily ZIP URL.
 */
export function buildDailyUrl(
  symbol: string,
  interval: string,
  year: number,
  month: number,
  day: number,
): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${BASE_URL}/daily/klines/${symbol}/${interval}/${symbol}-${interval}-${year}-${mm}-${dd}.zip`;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

/**
 * Parses one CSV row from Binance klines data into a NewCandle.
 * Returns null for malformed or empty rows.
 *
 * Binance CSV columns:
 * open_time, open, high, low, close, volume, close_time, quote_volume,
 * count, taker_buy_volume, taker_buy_quote_volume, ignore
 *
 * The `symbol` field is left empty — the caller sets it after parsing.
 */
export function parseCSVRow(
  row: string,
  exchange: Exchange,
  timeframe: Timeframe,
): NewCandle | null {
  const trimmed = row.trim();
  if (trimmed === "" || trimmed.startsWith("open_time")) {
    return null;
  }

  const cols = trimmed.split(",");
  if (cols.length < 6) {
    return null;
  }

  const openTimeRaw = cols[0] as string;
  const openRaw = cols[1] as string;
  const highRaw = cols[2] as string;
  const lowRaw = cols[3] as string;
  const closeRaw = cols[4] as string;
  const volumeRaw = cols[5] as string;

  // Validate open_time is numeric
  const openTimeMs = Number(openTimeRaw);
  if (Number.isNaN(openTimeMs)) {
    return null;
  }

  // Validate price/volume fields can be parsed as Decimal
  try {
    const open = new Decimal(openRaw);
    const high = new Decimal(highRaw);
    const low = new Decimal(lowRaw);
    const close = new Decimal(closeRaw);
    const volume = new Decimal(volumeRaw);

    return {
      symbol: "",
      exchange,
      timeframe,
      open_time: new Date(openTimeMs),
      open,
      high,
      low,
      close,
      volume,
      is_closed: true,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ZIP extraction helper
// ---------------------------------------------------------------------------

function extractCSVFromZip(zipBuffer: Uint8Array): string {
  const files = unzipSync(zipBuffer);
  // ZIP contains a single CSV file — find the first .csv entry
  for (const [filename, data] of Object.entries(files)) {
    if (filename.endsWith(".csv")) {
      return new TextDecoder().decode(data);
    }
  }
  // If no .csv extension found, use the first file
  const firstKey = Object.keys(files)[0];
  if (firstKey !== undefined) {
    return new TextDecoder().decode(files[firstKey]);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Date range segmentation
// ---------------------------------------------------------------------------

type DownloadSegment =
  | { type: "monthly"; year: number; month: number }
  | { type: "daily"; year: number; month: number; day: number };

/**
 * Splits a date range into monthly (completed months) and daily segments.
 * Monthly ZIPs are preferred for completed months since they are a single download.
 * Partial months at the start and end use daily ZIPs.
 */
function buildSegments(from: Date, to: Date): DownloadSegment[] {
  if (from >= to) {
    return [];
  }

  const segments: DownloadSegment[] = [];

  // Work in UTC
  let currentYear = from.getUTCFullYear();
  let currentMonth = from.getUTCMonth() + 1; // 1-based
  let currentDay = from.getUTCDate();

  const endYear = to.getUTCFullYear();
  const endMonth = to.getUTCMonth() + 1;
  const endDay = to.getUTCDate();

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth < endMonth) ||
    (currentYear === endYear && currentMonth === endMonth && currentDay <= endDay)
  ) {
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();

    const isFirstDayOfMonth = currentDay === 1;

    // Check if the entire remaining month is within range
    const monthEnd = new Date(Date.UTC(currentYear, currentMonth - 1, daysInMonth, 23, 59, 59));
    const isFullMonthInRange = isFirstDayOfMonth && monthEnd <= to;

    if (isFullMonthInRange) {
      // Use monthly ZIP for this complete month
      segments.push({ type: "monthly", year: currentYear, month: currentMonth });

      // Advance to next month
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
      currentDay = 1;
    } else {
      // Use daily ZIP
      segments.push({
        type: "daily",
        year: currentYear,
        month: currentMonth,
        day: currentDay,
      });

      // Advance to next day
      const nextDate = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay + 1));
      currentYear = nextDate.getUTCFullYear();
      currentMonth = nextDate.getUTCMonth() + 1;
      currentDay = nextDate.getUTCDate();
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Download single segment
// ---------------------------------------------------------------------------

async function downloadSegment(
  url: string,
  symbol: string,
  exchange: Exchange,
  timeframe: Timeframe,
): Promise<NewCandle[]> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      log.warn("download_segment_failed", {
        details: { url, status: response.status },
      });
      return [];
    }

    const buffer = await response.arrayBuffer();
    const zipData = new Uint8Array(buffer);
    const csvText = extractCSVFromZip(zipData);

    const rows = csvText.split("\n");
    const candles: NewCandle[] = [];

    for (const row of rows) {
      const candle = parseCSVRow(row, exchange, timeframe);
      if (candle !== null) {
        candle.symbol = symbol;
        candles.push(candle);
      }
    }

    return candles;
  } catch (err) {
    log.warn("download_segment_error", {
      details: {
        url,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Downloads historical candle data from Binance public data archive.
 *
 * Builds monthly ZIP URLs for completed months and daily ZIP URLs for
 * the current (partial) month. Each ZIP is downloaded, extracted, and
 * parsed into NewCandle objects.
 *
 * Failed downloads (404, network errors) are skipped with logging.
 * All price and volume values are Decimal.js instances.
 */
export async function downloadCandles(
  symbol: string,
  exchange: Exchange,
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<NewCandle[]> {
  if (from >= to) {
    return [];
  }

  const interval = mapTimeframe(timeframe);
  const segments = buildSegments(from, to);

  log.info("download_start", {
    symbol,
    exchange,
    details: {
      timeframe,
      from: from.toISOString(),
      to: to.toISOString(),
      segments: segments.length,
    },
  });

  const allCandles: NewCandle[] = [];

  for (const segment of segments) {
    const url =
      segment.type === "monthly"
        ? buildMonthlyUrl(symbol, interval, segment.year, segment.month)
        : buildDailyUrl(symbol, interval, segment.year, segment.month, segment.day);

    const candles = await downloadSegment(url, symbol, exchange, timeframe);
    for (const c of candles) {
      allCandles.push(c);
    }
  }

  log.info("download_complete", {
    symbol,
    exchange,
    details: {
      timeframe,
      totalCandles: allCandles.length,
    },
  });

  return allCandles;
}

/**
 * Fetches candles via CCXT REST API as a fallback when Binance public data
 * is not available. Strips `id` and `created_at` from the adapter response.
 */
export async function fetchCandlesViaREST(
  adapter: ExchangeAdapter,
  symbol: string,
  timeframe: Timeframe,
  since: number,
  limit?: number,
): Promise<NewCandle[]> {
  const candles = await adapter.fetchOHLCV(symbol, timeframe, since, limit);

  return candles.map(
    (c): NewCandle => ({
      symbol: c.symbol,
      exchange: c.exchange,
      timeframe: c.timeframe,
      open_time: c.open_time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      is_closed: c.is_closed,
    }),
  );
}
