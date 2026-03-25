import { Elysia, t } from "elysia";
import { NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import type { JournalV2RouteDeps } from "./index.js";

/**
 * Build the journal detail route.
 * Returns 404 when the journal is not found or belongs to a different user.
 */
export function journalDetailRoute(deps: JournalV2RouteDeps) {
	return new Elysia().get(
		"/api/v1/journals/:id",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";
			if (!userId) throw new UnauthorizedError();

			const result = await deps.getJournal({ id: ctx.params.id, userId });
			if (!result) throw new NotFoundError(`Journal ${ctx.params.id} not found`);

			return ok(result);
		},
		{
			params: t.Object({ id: t.String() }),
		},
	);
}
