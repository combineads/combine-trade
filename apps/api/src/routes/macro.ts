import Elysia, { t } from "elysia";
import { NotFoundError } from "../lib/errors.js";

export interface MacroRouteDeps {
	findEvents: (opts: {
		startDate?: string;
		endDate?: string;
		impact?: string;
	}) => Promise<unknown[]>;
	getMacroAnalytics: () => Promise<unknown[]>;
	getRetrospective: (
		journalId: string,
	) => Promise<{ report: string | null; generatedAt: string | null } | null>;
}

export function macroRoutes(deps: MacroRouteDeps) {
	return new Elysia({ prefix: "/api/v1" })
		.get(
			"/macro/events",
			async ({ query }) => {
				const events = await deps.findEvents({
					startDate: query.startDate,
					endDate: query.endDate,
					impact: query.impact,
				});
				return { data: events };
			},
			{
				query: t.Object({
					startDate: t.Optional(t.String()),
					endDate: t.Optional(t.String()),
					impact: t.Optional(t.String()),
				}),
			},
		)
		.get("/journals/macro-analytics", async () => {
			const analytics = await deps.getMacroAnalytics();
			return { data: analytics };
		})
		.get("/journals/:id/retrospective", async ({ params }) => {
			const result = await deps.getRetrospective(params.id);
			if (!result) {
				throw new NotFoundError("Journal");
			}
			return {
				data: {
					report: result.report,
					generatedAt: result.generatedAt,
					pending: result.report === null,
				},
			};
		});
}
