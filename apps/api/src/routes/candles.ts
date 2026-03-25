import type { Candle } from "@combine/candle/types.js";
import { Elysia, t } from "elysia";
import { paginated } from "../lib/response.js";

// ---------------------------------------------------------------------------
// Legacy offset-based pagination (kept for backward compatibility)
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 200;

export interface CandleQueryOptions {
	symbol: string;
	timeframe: string;
	page: number;
	pageSize: number;
	from?: Date;
	to?: Date;
}

export interface CandleRouteDeps {
	findCandles: (opts: CandleQueryOptions) => Promise<{ items: Candle[]; total: number }>;
}

export function candleRoutes(deps: CandleRouteDeps) {
	return new Elysia().get(
		"/api/v1/candles",
		async ({ query }) => {
			const pageSize = Math.min(query.pageSize ?? 50, MAX_PAGE_SIZE);
			const page = query.page ?? 1;

			const result = await deps.findCandles({
				symbol: query.symbol,
				timeframe: query.timeframe,
				page,
				pageSize,
				from: query.from ? new Date(query.from) : undefined,
				to: query.to ? new Date(query.to) : undefined,
			});

			return paginated(result.items, result.total, page, pageSize);
		},
		{
			query: t.Object({
				symbol: t.String(),
				timeframe: t.String(),
				page: t.Optional(t.Numeric()),
				pageSize: t.Optional(t.Numeric()),
				from: t.Optional(t.String()),
				to: t.Optional(t.String()),
			}),
		},
	);
}

// ---------------------------------------------------------------------------
// Cursor-based pagination (chart data API)
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/**
 * Options passed to the data-access layer for cursor-based candle queries.
 * The caller fetches `limit + 1` rows; if the extra row exists, a nextCursor
 * is derived from the last item of the page (not the +1 sentinel).
 */
export interface CandleCursorQueryOptions {
	symbol: string;
	timeframe: string;
	/** ISO 8601 timestamp (exclusive lower bound). When absent, fetch from the earliest record. */
	cursor?: string;
	/** How many candles to return on this page (already clamped to MAX_LIMIT). */
	limit: number;
}

export interface CandleCursorRouteDeps {
	/**
	 * Return up to `opts.limit + 1` candles with `openTime > cursor` for the
	 * given symbol+timeframe, ordered by `openTime ASC`.
	 * The +1 sentinel is used by the route layer to detect whether a next page exists.
	 */
	findCandlesCursor: (opts: CandleCursorQueryOptions) => Promise<Candle[]>;
}

/**
 * Cursor-based pagination helper.
 * Extracts the nextCursor ISO string from a page of candles.
 *
 * @param rows   Slice of candles fetched with `limit + 1` strategy.
 * @param limit  Page size (not including the sentinel).
 * @returns `{ data, nextCursor }` where nextCursor is the openTime of the
 *          last returned candle (used as the exclusive start of the next page).
 */
export function buildCursorPage(
	rows: Candle[],
	limit: number,
): { data: Candle[]; nextCursor: string | null } {
	const hasMore = rows.length > limit;
	const data = hasMore ? rows.slice(0, limit) : rows;
	const nextCursor = hasMore ? data[data.length - 1].openTime.toISOString() : null;
	return { data, nextCursor };
}

export function candleCursorRoutes(deps: CandleCursorRouteDeps) {
	return new Elysia().get(
		"/api/v1/candles/:symbol/:timeframe",
		async ({ params, query }) => {
			const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

			const rows = await deps.findCandlesCursor({
				symbol: params.symbol,
				timeframe: params.timeframe,
				cursor: query.cursor,
				limit,
			});

			return buildCursorPage(rows, limit);
		},
		{
			params: t.Object({
				symbol: t.String(),
				timeframe: t.String(),
			}),
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Numeric()),
			}),
		},
	);
}
