import { Elysia, t } from "elysia";
import type { StrategyEvent } from "../../../../packages/core/strategy/event-types.js";
import type { PatternStatistics } from "../../../../packages/core/vector/types.js";
import { NotFoundError } from "../lib/errors.js";
import { ok, paginated } from "../lib/response.js";

const MAX_PAGE_SIZE = 100;

export interface EventQueryOptions {
	strategyId: string;
	page: number;
	pageSize: number;
	symbol?: string;
	direction?: "long" | "short";
	dateFrom?: Date;
	dateTo?: Date;
}

export interface EventRouteDeps {
	findEventById: (id: string) => Promise<StrategyEvent | null>;
	findEventsByStrategy: (
		opts: EventQueryOptions,
	) => Promise<{ items: StrategyEvent[]; total: number }>;
	getStrategyStatistics: (
		strategyId: string,
	) => Promise<PatternStatistics & { totalEvents: number; longCount: number; shortCount: number }>;
	strategyExists: (id: string) => Promise<boolean>;
}

export function eventRoutes(deps: EventRouteDeps) {
	return new Elysia()
		.get(
			"/api/v1/strategies/:strategyId/events",
			async ({ params, query }) => {
				const exists = await deps.strategyExists(params.strategyId);
				if (!exists) throw new NotFoundError(`Strategy ${params.strategyId} not found`);

				const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
				const page = query.page ?? 1;

				const opts: EventQueryOptions = {
					strategyId: params.strategyId,
					page,
					pageSize,
					symbol: query.symbol,
					direction: query.direction as "long" | "short" | undefined,
					dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
					dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
				};

				const result = await deps.findEventsByStrategy(opts);
				return paginated(result.items, result.total, page, pageSize);
			},
			{
				params: t.Object({ strategyId: t.String() }),
				query: t.Object({
					page: t.Optional(t.Numeric()),
					pageSize: t.Optional(t.Numeric()),
					symbol: t.Optional(t.String()),
					direction: t.Optional(t.Union([t.Literal("long"), t.Literal("short")])),
					dateFrom: t.Optional(t.String()),
					dateTo: t.Optional(t.String()),
				}),
			},
		)
		.get(
			"/api/v1/strategies/:strategyId/statistics",
			async ({ params }) => {
				const exists = await deps.strategyExists(params.strategyId);
				if (!exists) throw new NotFoundError(`Strategy ${params.strategyId} not found`);

				const stats = await deps.getStrategyStatistics(params.strategyId);
				return ok(stats);
			},
			{
				params: t.Object({ strategyId: t.String() }),
			},
		)
		.get(
			"/api/v1/events/:id",
			async ({ params }) => {
				const event = await deps.findEventById(params.id);
				if (!event) throw new NotFoundError(`Event ${params.id} not found`);
				return ok(event);
			},
			{
				params: t.Object({ id: t.String() }),
			},
		);
}
