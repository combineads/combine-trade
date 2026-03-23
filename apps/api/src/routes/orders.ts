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
	userId: string;
	symbol?: string;
	status?: string;
	strategyId?: string;
	page: number;
	pageSize: number;
}

/**
 * Route dependency interface for order operations.
 * userId is part of OrderQueryOptions to enforce per-user isolation.
 * The route layer is responsible for extracting userId from the session (T-181).
 */
export interface OrderRouteDeps {
	findOrders: (opts: OrderQueryOptions) => Promise<{ items: Order[]; total: number }>;
}

export function orderRoutes(deps: OrderRouteDeps) {
	return new Elysia().get(
		"/api/v1/orders",
		async ({ query }) => {
			// TODO T-181: extract userId from session; placeholder until then
			const userId = "placeholder-user-id";
			const pageSize = Math.min(query.pageSize ?? 50, MAX_PAGE_SIZE);
			const page = query.page ?? 1;

			const result = await deps.findOrders({
				userId,
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
