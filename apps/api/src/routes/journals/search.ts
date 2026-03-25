import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../lib/errors.js";
import type { JournalV2RouteDeps } from "./index.js";
import { MAX_JOURNAL_PAGE_SIZE } from "./list.js";

const DEFAULT_SEARCH_PAGE_SIZE = 20;

/**
 * Build the journal search route.
 * Supports text search on symbol, autoTags, and notes via the `q` param.
 * `q` may start with `tag:` prefix to narrow the search to tags only.
 */
export function journalSearchRoute(deps: JournalV2RouteDeps) {
	return new Elysia().get(
		"/api/v1/journals/search",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";
			if (!userId) throw new UnauthorizedError();

			const limit = Math.min(ctx.query.limit ?? DEFAULT_SEARCH_PAGE_SIZE, MAX_JOURNAL_PAGE_SIZE);
			const page = ctx.query.page ?? 1;

			const result = await deps.searchJournals({
				q: ctx.query.q,
				userId,
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
				q: t.String(),
				page: t.Optional(t.Numeric()),
				limit: t.Optional(t.Numeric()),
			}),
		},
	);
}
