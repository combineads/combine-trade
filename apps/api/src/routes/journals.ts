import { Elysia, t } from "elysia";
import { NotFoundError } from "../lib/errors.js";
import { ok, paginated } from "../lib/response.js";
import { type JournalNoteTagDeps, journalNoteTagRoutes } from "./journals/notes-tags.js";

const MAX_PAGE_SIZE = 100;

export interface JournalListQuery {
	page: number;
	pageSize: number;
	strategyId?: string;
	symbol?: string;
}

export interface JournalSearchFilter {
	strategyId?: string;
	symbol?: string;
	direction?: "long" | "short";
	dateFrom?: string;
	dateTo?: string;
	tags?: string;
}

export interface JournalAnalyticsFilter {
	strategyId?: string;
	symbol?: string;
	tags?: string;
}

export interface JournalAnalytics {
	tagStats: { tag: string; count: number; winrate: number; expectancy: number }[];
	overallWinrate: number;
	overallExpectancy: number;
}

export interface JournalRouteDeps {
	listJournals: (query: JournalListQuery) => Promise<{ data: unknown[]; total: number }>;
	getJournal: (id: string) => Promise<{ journal: unknown; entrySnapshot: unknown } | null>;
	searchJournals: (filter: JournalSearchFilter) => Promise<{ data: unknown[]; total: number }>;
	getJournalAnalytics: (filter: JournalAnalyticsFilter) => Promise<JournalAnalytics>;
	noteTagDeps: JournalNoteTagDeps;
}

export function journalRoutes(deps: JournalRouteDeps) {
	return new Elysia()
		.get(
			"/api/v1/journals",
			async ({ query }) => {
				const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
				const page = query.page ?? 1;
				const result = await deps.listJournals({
					page,
					pageSize,
					strategyId: query.strategyId,
					symbol: query.symbol,
				});
				return paginated(result.data, result.total, page, pageSize);
			},
			{
				query: t.Object({
					page: t.Optional(t.Numeric()),
					pageSize: t.Optional(t.Numeric()),
					strategyId: t.Optional(t.String()),
					symbol: t.Optional(t.String()),
				}),
			},
		)
		.get(
			"/api/v1/journals/search",
			async ({ query }) => {
				const result = await deps.searchJournals({
					strategyId: query.strategyId,
					symbol: query.symbol,
					direction: query.direction as "long" | "short" | undefined,
					dateFrom: query.dateFrom,
					dateTo: query.dateTo,
					tags: query.tags,
				});
				return ok(result.data);
			},
			{
				query: t.Object({
					strategyId: t.Optional(t.String()),
					symbol: t.Optional(t.String()),
					direction: t.Optional(t.Union([t.Literal("long"), t.Literal("short")])),
					dateFrom: t.Optional(t.String()),
					dateTo: t.Optional(t.String()),
					tags: t.Optional(t.String()),
				}),
			},
		)
		.get(
			"/api/v1/journals/analytics",
			async ({ query }) => {
				const analytics = await deps.getJournalAnalytics({
					strategyId: query.strategyId,
					symbol: query.symbol,
					tags: query.tags,
				});
				return ok(analytics);
			},
			{
				query: t.Object({
					strategyId: t.Optional(t.String()),
					symbol: t.Optional(t.String()),
					tags: t.Optional(t.String()),
				}),
			},
		)
		.get(
			"/api/v1/journals/:id",
			async ({ params }) => {
				const result = await deps.getJournal(params.id);
				if (!result) throw new NotFoundError(`Journal ${params.id} not found`);
				return ok(result);
			},
			{
				params: t.Object({ id: t.String() }),
			},
		)
		.use(journalNoteTagRoutes(deps.noteTagDeps));
}
