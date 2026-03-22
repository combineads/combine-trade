import { Elysia, t } from "elysia";
import { paginated } from "../lib/response.js";

const MAX_PAGE_SIZE = 200;

export interface Alert {
	id: string;
	strategyId: string;
	symbol: string;
	direction: "long" | "short";
	entryPrice: string;
	status: "pending" | "sent" | "failed";
	createdAt: Date;
}

export interface AlertQueryOptions {
	strategyId?: string;
	status?: string;
	page: number;
	pageSize: number;
}

export interface AlertRouteDeps {
	findAlerts: (opts: AlertQueryOptions) => Promise<{ items: Alert[]; total: number }>;
}

export function alertRoutes(deps: AlertRouteDeps) {
	return new Elysia().get(
		"/api/v1/alerts",
		async ({ query }) => {
			const pageSize = Math.min(query.pageSize ?? 50, MAX_PAGE_SIZE);
			const page = query.page ?? 1;

			const result = await deps.findAlerts({
				strategyId: query.strategyId,
				status: query.status,
				page,
				pageSize,
			});

			return paginated(result.items, result.total, page, pageSize);
		},
		{
			query: t.Object({
				strategyId: t.Optional(t.String()),
				status: t.Optional(t.String()),
				page: t.Optional(t.Numeric()),
				pageSize: t.Optional(t.Numeric()),
			}),
		},
	);
}
