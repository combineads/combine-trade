import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../lib/errors.js";
import { paginated } from "../../lib/response.js";
import type { JournalV2RouteDeps } from "./index.js";

export const MAX_JOURNAL_PAGE_SIZE = 100;
const DEFAULT_JOURNAL_PAGE_SIZE = 20;

/**
 * Build the journal list route.
 * Injects userId from the derived context (betterAuthPlugin).
 */
export function journalListRoute(deps: JournalV2RouteDeps) {
	return new Elysia().get(
		"/api/v1/journals",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";
			if (!userId) throw new UnauthorizedError();

			const limit = Math.min(ctx.query.limit ?? DEFAULT_JOURNAL_PAGE_SIZE, MAX_JOURNAL_PAGE_SIZE);
			const page = ctx.query.page ?? 1;

			const result = await deps.listJournals({
				userId,
				strategyId: ctx.query.strategyId,
				symbol: ctx.query.symbol,
				side: ctx.query.side as "LONG" | "SHORT" | undefined,
				outcome: ctx.query.outcome as "WIN" | "LOSS" | "PASS" | undefined,
				from: ctx.query.from,
				to: ctx.query.to,
				page,
				limit,
			});

			return {
				data: result.data,
				meta: {
					total: result.total,
					page,
					limit,
					totalPages: Math.ceil(result.total / limit),
				},
			};
		},
		{
			query: t.Object({
				page: t.Optional(t.Numeric()),
				limit: t.Optional(t.Numeric()),
				strategyId: t.Optional(t.String()),
				symbol: t.Optional(t.String()),
				side: t.Optional(t.Union([t.Literal("LONG"), t.Literal("SHORT")])),
				outcome: t.Optional(t.Union([t.Literal("WIN"), t.Literal("LOSS"), t.Literal("PASS")])),
				from: t.Optional(t.String()),
				to: t.Optional(t.String()),
			}),
		},
	);
}

/**
 * Re-export paginated helper so detail/search can use it.
 */
export { paginated };
