import { Elysia, t } from "elysia";
import { ForbiddenError, UnauthorizedError } from "../../lib/errors.js";
import { paginated } from "../../lib/response.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperOrder {
	id: string;
	symbol: string;
	side: "buy" | "sell";
	size: string;
	price: string;
	status: "filled" | "cancelled" | "open";
	filledAt: string | null;
	pnl: string | null;
}

export interface PaperOrdersQuery {
	page: number;
	limit: number;
	status?: string;
	symbol?: string;
}

export interface PaperOrdersDeps {
	getStrategyOwner: (strategyId: string) => Promise<string | null>;
	listPaperOrders: (
		strategyId: string,
		opts: PaperOrdersQuery,
	) => Promise<{ data: PaperOrder[]; total: number }>;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function paperOrdersRoute(deps: PaperOrdersDeps) {
	return new Elysia().get(
		"/api/v1/paper/:strategyId/orders",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";

			if (!userId) throw new UnauthorizedError();

			const owner = await deps.getStrategyOwner(ctx.params.strategyId);
			if (owner !== userId) throw new ForbiddenError();

			const page = ctx.query.page ?? 1;
			const limit = Math.min(ctx.query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

			const result = await deps.listPaperOrders(ctx.params.strategyId, {
				page,
				limit,
				status: ctx.query.status,
				symbol: ctx.query.symbol,
			});

			return paginated(result.data, result.total, page, limit);
		},
		{
			params: t.Object({ strategyId: t.String() }),
			query: t.Object({
				page: t.Optional(t.Numeric()),
				limit: t.Optional(t.Numeric()),
				status: t.Optional(
					t.Union([t.Literal("filled"), t.Literal("cancelled"), t.Literal("open")]),
				),
				symbol: t.Optional(t.String()),
			}),
		},
	);
}
