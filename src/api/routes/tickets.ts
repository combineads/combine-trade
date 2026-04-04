/**
 * Ticket list route — GET /tickets
 *
 * Returns CLOSED tickets with filtering and cursor-based pagination.
 * Query params:
 *   ?period=today|7d|30d|all  (default: all)
 *   ?symbol=BTCUSDT
 *   ?exchange=binance
 *   ?result=WIN|LOSS|TIME_EXIT
 *   ?cursor=<uuid>            (last item id from previous page)
 *   ?limit=20                 (default: 20, max: 100)
 *
 * Layer: L8 (api) — route handler only, no DB access.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape returned by the DI query function. All numerics as strings. */
export type TicketRow = {
  id: string;
  symbol: string;
  exchange: string;
  direction: string;
  timeframe: string;
  entry_price: string;
  sl_price: string;
  size: string;
  leverage: number;
  result: string | null;
  pnl: string | null;
  pnl_pct: string | null;
  close_reason: string | null;
  opened_at: string;
  closed_at: string | null;
  hold_duration_sec: number | null;
  created_at: string;
};

/** Filters parsed from query params and forwarded to the DI function. */
export type TicketFilters = {
  period: "today" | "7d" | "30d" | "all";
  symbol?: string | undefined;
  exchange?: string | undefined;
  result?: "WIN" | "LOSS" | "TIME_EXIT" | undefined;
};

/** Result from the DI query function. */
export type TicketQueryResult = {
  data: TicketRow[];
  total: number;
};

/** Dependency injection interface for the tickets route. */
export type TicketsDeps = {
  getTickets(
    filters: TicketFilters,
    cursor: string | undefined,
    limit: number,
  ): Promise<TicketQueryResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PERIODS = new Set(["today", "7d", "30d", "all"]);
const VALID_RESULTS = new Set(["WIN", "LOSS", "TIME_EXIT"]);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the tickets sub-router.
 *
 * GET /tickets — list CLOSED tickets with filters and cursor pagination.
 */
export function createTicketRoutes(deps: TicketsDeps): Hono {
  const router = new Hono();

  router.get("/tickets", async (c) => {
    // ---- Parse & validate query params ----
    const periodParam = c.req.query("period") ?? "all";
    if (!VALID_PERIODS.has(periodParam)) {
      return c.json({ error: "Invalid period" }, 400);
    }
    const period = periodParam as TicketFilters["period"];

    const symbol = c.req.query("symbol");
    const exchange = c.req.query("exchange");

    const resultParam = c.req.query("result");
    if (resultParam !== undefined && !VALID_RESULTS.has(resultParam)) {
      return c.json({ error: "Invalid result" }, 400);
    }
    const result = resultParam as TicketFilters["result"];

    const cursor = c.req.query("cursor");

    const limitParam = c.req.query("limit");
    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = Number.parseInt(limitParam, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        return c.json({ error: "Invalid limit" }, 400);
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    // ---- Query via DI ----
    const filters: TicketFilters = { period };
    if (symbol !== undefined) filters.symbol = symbol;
    if (exchange !== undefined) filters.exchange = exchange;
    if (result !== undefined) filters.result = result;

    // Request limit+1 to determine hasMore
    const queryResult = await deps.getTickets(filters, cursor, limit + 1);

    const hasMore = queryResult.data.length > limit;
    const data = hasMore ? queryResult.data.slice(0, limit) : queryResult.data;
    const lastItem = data[data.length - 1];
    const nextCursor = hasMore && lastItem !== undefined ? lastItem.id : null;

    return c.json({
      data,
      cursor: nextCursor,
      hasMore,
      total: queryResult.total,
    });
  });

  return router;
}
