/**
 * economic-calendar.ts
 *
 * T-19-010: Investing.com 경제 캘린더 스크래퍼
 *
 * PRD §7.3 L227: 3스타 이상 경제 이벤트 120분 전 거래 차단
 * ADR-004: 스크래핑 fail-closed 정책 (실패 시 24시간 전체 차단)
 */

import { createLogger } from "@/core/logger";
import type { DbInstance } from "@/db/pool";
import { tradeBlockTable } from "@/db/schema";

/** Local type to avoid L4→L7 layer violation (notifications is L7). */
type SlackAlertFn = (
  eventType: string,
  details: Record<string, string | number | boolean | undefined>,
  db?: DbInstance,
) => Promise<void>;

const logger = createLogger("economic-calendar");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_DURATION_MIN = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EconomicEvent {
  title: string;
  scheduledAt: Date;
  impactStars: number;
}

export interface EconomicCalendarDeps {
  fetch?: typeof globalThis.fetch;
  sendSlackAlert?: SlackAlertFn;
  now?: Date;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Counts the number of impact star icons in a sentiment cell HTML snippet.
 * Investing.com renders filled stars as <i class="grayFullBullishIcon"></i>.
 */
function countStarsInSentimentHtml(sentimentHtml: string): number {
  const matches = sentimentHtml.match(/grayFullBullishIcon/g);
  return matches ? matches.length : 0;
}

/**
 * Extracts the event title text from a table row HTML snippet.
 * Looks for <td class="left event">...</td> or <td ...event...>text</td>.
 */
function extractEventTitle(rowHtml: string): string | null {
  // Match: <td ... class="... event ...">title text</td>
  const titleMatch = rowHtml.match(/<td[^>]*class="[^"]*event[^"]*"[^>]*>\s*([^<]+)\s*<\/td>/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  return null;
}

/**
 * Extracts the event datetime from the row's data-event-datetime attribute.
 * Format: "YYYY/MM/DD HH:MM:SS"
 */
function extractEventDatetime(rowHtml: string): Date | null {
  const datetimeMatch = rowHtml.match(
    /data-event-datetime="(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})"/,
  );
  if (datetimeMatch?.[1]) {
    // Replace slashes with dashes for ISO compatibility
    const iso = `${datetimeMatch[1].replace(/\//g, "-").replace(" ", "T")}Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  // Fallback: try event_timestamp attribute (Unix seconds)
  const tsMatch = rowHtml.match(/event_timestamp="(\d+)"/);
  if (tsMatch?.[1]) {
    const ts = Number(tsMatch[1]) * 1000;
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  return null;
}

/**
 * Parses the Investing.com economic calendar HTML.
 * Extracts all events with impactStars >= 3.
 *
 * Strategy: split by <tr class="js-event-item" ...> rows, then extract
 * title, datetime, and sentiment star count from each row.
 */
function parseCalendarHtml(html: string): EconomicEvent[] {
  const events: EconomicEvent[] = [];

  // Split HTML into individual event rows
  // Match all <tr class="js-event-item"...>...</tr> blocks
  const rowPattern = /<tr[^>]*class="[^"]*js-event-item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[0];

    const title = extractEventTitle(rowHtml);
    if (!title) continue;

    const scheduledAt = extractEventDatetime(rowHtml);
    if (!scheduledAt) continue;

    // Extract sentiment cell to count stars
    const sentimentMatch = rowHtml.match(
      /<td[^>]*class="[^"]*sentiment[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
    );
    const sentimentHtml = sentimentMatch?.[1] ?? "";
    const impactStars = countStarsInSentimentHtml(sentimentHtml);

    // Filter: only 3-star events
    if (impactStars < 3) continue;

    events.push({ title, scheduledAt, impactStars });
  }

  return events;
}

// ---------------------------------------------------------------------------
// fetchEconomicCalendar
// ---------------------------------------------------------------------------

/**
 * Fetches high-impact (3-star) economic events from Investing.com for the given date.
 *
 * Uses simple HTTP fetch with browser-like headers (best-effort).
 * Throws on network error or non-OK HTTP response — callers must handle.
 *
 * @param date - The date to fetch events for (UTC)
 * @param fetchFn - Injectable fetch function (defaults to globalThis.fetch)
 */
export async function fetchEconomicCalendar(
  date: Date,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<EconomicEvent[]> {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Investing.com economic calendar URL for a specific date
  const url = `https://www.investing.com/economic-calendar/#${dateStr}`;

  logger.info("economic_calendar_fetch_start", { date: dateStr, url });

  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Investing.com fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const events = parseCalendarHtml(html);

  logger.info("economic_calendar_fetch_done", { date: dateStr, eventCount: events.length });

  return events;
}

// ---------------------------------------------------------------------------
// createEconomicTradeBlocks
// ---------------------------------------------------------------------------

/**
 * Inserts one ECONOMIC TradeBlock per event.
 * Window: [scheduledAt - 120min, scheduledAt + 120min]
 */
export async function createEconomicTradeBlocks(
  db: DbInstance,
  events: EconomicEvent[],
): Promise<void> {
  for (const event of events) {
    const startTime = new Date(event.scheduledAt.getTime() - BLOCK_DURATION_MIN * 60 * 1000);
    const endTime = new Date(event.scheduledAt.getTime() + BLOCK_DURATION_MIN * 60 * 1000);

    await db.insert(tradeBlockTable).values({
      block_type: "ECONOMIC",
      start_time: startTime,
      end_time: endTime,
      reason: event.title,
      is_recurring: false,
      recurrence_rule: null,
      source_data: {
        scheduledAt: event.scheduledAt.toISOString(),
        impactStars: event.impactStars,
      },
    });

    logger.info("economic_trade_block_created", {
      title: event.title,
      scheduledAt: event.scheduledAt.toISOString(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// createFallbackTradeBlock
// ---------------------------------------------------------------------------

/**
 * Inserts a 24-hour ECONOMIC TradeBlock covering the entire current UTC day.
 * Used when scraping fails (fail-closed policy).
 *
 * @param db - Database instance
 * @param now - Current time (defaults to new Date())
 */
export async function createFallbackTradeBlock(
  db: DbInstance,
  now: Date = new Date(),
): Promise<void> {
  // Start: UTC midnight of current day
  const startTime = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );

  // End: UTC midnight of next day (24h window)
  const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

  await db.insert(tradeBlockTable).values({
    block_type: "ECONOMIC",
    start_time: startTime,
    end_time: endTime,
    reason: "ECONOMIC_CALENDAR_FETCH_FAILED",
    is_recurring: false,
    recurrence_rule: null,
    source_data: null,
  });

  logger.warn("economic_fallback_trade_block_created", {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// runDailyEconomicCalendar
// ---------------------------------------------------------------------------

/**
 * Orchestrates the daily economic calendar fetch and TradeBlock creation.
 *
 * Success path: fetch events → insert ECONOMIC TradeBlocks per event
 * Failure path: insert 24h fallback TradeBlock + send Slack alert
 *
 * @param db - Database instance
 * @param deps - Injectable dependencies for testability
 */
export async function runDailyEconomicCalendar(
  db: DbInstance,
  deps: EconomicCalendarDeps = {},
): Promise<void> {
  const { fetch: fetchFn = globalThis.fetch, sendSlackAlert: slackFn, now = new Date() } = deps;

  // sendSlackAlert must be injected via deps (L4 cannot import L7 notifications)
  // If not provided, alert is skipped (logged only)
  const sendAlert: SlackAlertFn =
    slackFn ??
    (async (_eventType, details) => {
      logger.warn("economic_calendar_slack_not_configured", details);
    });

  try {
    const events = await fetchEconomicCalendar(now, fetchFn);

    if (events.length === 0) {
      logger.info("economic_calendar_no_events", { date: now.toISOString() });
      return;
    }

    await createEconomicTradeBlocks(db, events);
    logger.info("economic_calendar_run_complete", { eventCount: events.length });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("economic_calendar_fetch_failed", { error: errorMessage });

    await createFallbackTradeBlock(db, now);
    await sendAlert("ECONOMIC_CALENDAR_FAILED", {
      error: errorMessage,
      date: now.toISOString(),
      policy: "fail-closed: 24h block created",
    });
  }
}

// ---------------------------------------------------------------------------
// scheduleDailyEconomicCalendar
// ---------------------------------------------------------------------------

/**
 * Computes milliseconds until the next UTC midnight.
 */
function msUntilNextUtcMidnight(now: Date): number {
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return nextMidnight.getTime() - now.getTime();
}

/**
 * Schedules `runDailyEconomicCalendar` to run at UTC 00:00 every day.
 * Runs once immediately at next UTC midnight, then repeats every 24h.
 *
 * @param db - Database instance
 * @param deps - Injectable dependencies (fetch, sendSlackAlert)
 * @returns Cleanup function that cancels the schedule
 */
export function scheduleDailyEconomicCalendar(
  db: DbInstance,
  deps: Omit<EconomicCalendarDeps, "now"> = {},
): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const runNow = () => runDailyEconomicCalendar(db, deps);

  const startDailyInterval = () => {
    // Run once on the first tick
    void runNow();

    // Then repeat every 24 hours
    intervalId = setInterval(
      () => {
        void runNow();
      },
      24 * 60 * 60 * 1000,
    );
  };

  const delayMs = msUntilNextUtcMidnight(new Date());
  logger.info("economic_calendar_scheduler_start", {
    nextRunInMs: delayMs,
    nextRunAt: new Date(Date.now() + delayMs).toISOString(),
  });

  timeoutId = setTimeout(() => {
    startDailyInterval();
  }, delayMs);

  // Return cleanup function
  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}
