import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../lib/errors.js";
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

/**
 * Extract userId from Elysia context.
 * betterAuthPlugin derives `userId` globally (T-181).
 */
function extractUserId(ctx: Record<string, unknown>): string {
	return typeof ctx.userId === "string" ? ctx.userId : "";
}

export function orderRoutes(deps: OrderRouteDeps) {
	return new Elysia().get(
		"/api/v1/orders",
		async (ctx) => {
			const userId = extractUserId(ctx as unknown as Record<string, unknown>);
			if (!userId) throw new UnauthorizedError();
			const pageSize = Math.min(ctx.query.pageSize ?? 50, MAX_PAGE_SIZE);
			const page = ctx.query.page ?? 1;

			const result = await deps.findOrders({
				userId,
				symbol: ctx.query.symbol,
				status: ctx.query.status,
				strategyId: ctx.query.strategyId,
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
