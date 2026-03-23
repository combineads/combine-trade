import { Elysia, t } from "elysia";
import { ok, paginated } from "../lib/response.js";

const MAX_PAGE_SIZE = 100;

export type PaperPeriod = "day" | "week" | "month" | "all";

export interface PaperRouteDeps {
	getPaperStatus: () => Promise<{
		balance: string;
		positions: {
			symbol: string;
			side: "LONG" | "SHORT";
			size: string;
			entryPrice: string;
			unrealizedPnl: string;
		}[];
		unrealizedPnl: string;
		totalPnl: string;
	}>;
	listPaperOrders: (query: { page: number; pageSize: number }) => Promise<{
		data: unknown[];
		total: number;
	}>;
	getPaperPerformance: (period: PaperPeriod) => Promise<{ summaries: unknown[] }>;
	getPaperComparison: (
		strategyId: string,
		symbol: string,
	) => Promise<{
		backtest: unknown;
		paper: unknown;
		delta: unknown;
	}>;
	resetPaper: (initialBalance: string) => Promise<{ success: true; balance: string }>;
}

export function paperRoutes(deps: PaperRouteDeps) {
	return new Elysia()
		.get("/api/v1/paper/status", async () => {
			const status = await deps.getPaperStatus();
			return ok(status);
		})
		.get(
			"/api/v1/paper/orders",
			async ({ query }) => {
				const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
				const page = query.page ?? 1;
				const result = await deps.listPaperOrders({ page, pageSize });
				return paginated(result.data, result.total, page, pageSize);
			},
			{
				query: t.Object({
					page: t.Optional(t.Numeric()),
					pageSize: t.Optional(t.Numeric()),
				}),
			},
		)
		.get(
			"/api/v1/paper/performance",
			async ({ query }) => {
				const period = (query.period ?? "all") as PaperPeriod;
				const result = await deps.getPaperPerformance(period);
				return ok(result);
			},
			{
				query: t.Object({
					period: t.Optional(
						t.Union([t.Literal("day"), t.Literal("week"), t.Literal("month"), t.Literal("all")]),
					),
				}),
			},
		)
		.get(
			"/api/v1/paper/comparison",
			async ({ query }) => {
				const result = await deps.getPaperComparison(query.strategyId, query.symbol);
				return ok(result);
			},
			{
				query: t.Object({
					strategyId: t.String(),
					symbol: t.String(),
				}),
			},
		)
		.post(
			"/api/v1/paper/reset",
			async ({ body }) => {
				const result = await deps.resetPaper(body.initialBalance);
				return ok(result);
			},
			{
				body: t.Object({
					initialBalance: t.String(),
				}),
			},
		);
}
