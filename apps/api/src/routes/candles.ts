import { Elysia, t } from "elysia";
import type { Candle } from "@combine/candle/types.js";
import { paginated } from "../lib/response.js";

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
