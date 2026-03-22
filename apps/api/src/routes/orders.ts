import { Elysia, t } from "elysia";
import { paginated } from "../lib/response.js";

const MAX_PAGE_SIZE = 200;

export interface Order {
	id: string;
	strategyId: string;
	symbol: string;
	side: "buy" | "sell";
	type: "market" | "limit";
	price: string;
	amount: string;
	filled: string;
	status: "open" | "closed" | "canceled";
	createdAt: Date;
}

export interface OrderQueryOptions {
	symbol?: string;
	status?: string;
	strategyId?: string;
	page: number;
	pageSize: number;
}

export interface OrderRouteDeps {
	findOrders: (opts: OrderQueryOptions) => Promise<{ items: Order[]; total: number }>;
}

export function orderRoutes(deps: OrderRouteDeps) {
	return new Elysia().get(
		"/api/v1/orders",
		async ({ query }) => {
			const pageSize = Math.min(query.pageSize ?? 50, MAX_PAGE_SIZE);
			const page = query.page ?? 1;

			const result = await deps.findOrders({
				symbol: query.symbol,
				status: query.status,
				strategyId: query.strategyId,
				page,
				pageSize,
			});

			return paginated(result.items, result.total, page, pageSize);
		},
		{
			query: t.Object({
				symbol: t.Optional(t.String()),
				status: t.Optional(t.String()),
				strategyId: t.Optional(t.String()),
				page: t.Optional(t.Numeric()),
				pageSize: t.Optional(t.Numeric()),
			}),
		},
	);
}
