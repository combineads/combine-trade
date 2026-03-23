import { and, count, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type {
	JournalAnalytics,
	JournalAnalyticsFilter,
	JournalListQuery,
	JournalRouteDeps,
	JournalSearchFilter,
} from "../routes/journals.js";

type Db = PostgresJsDatabase<typeof schema>;

export function createJournalDeps(db: Db): JournalRouteDeps {
	return {
		listJournals: async (query: JournalListQuery): Promise<{ data: unknown[]; total: number }> => {
			const offset = (query.page - 1) * query.pageSize;

			const conditions = [];
			if (query.strategyId) {
				conditions.push(eq(schema.tradeJournals.strategyId, query.strategyId));
			}
			if (query.symbol) {
				conditions.push(eq(schema.tradeJournals.symbol, query.symbol));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [rows, [countRow]] = await Promise.all([
				db.select().from(schema.tradeJournals).where(where).limit(query.pageSize).offset(offset),
				db.select({ total: count() }).from(schema.tradeJournals).where(where),
			]);

			return {
				data: rows,
				total: countRow?.total ?? 0,
			};
		},

		getJournal: async (
			id: string,
		): Promise<{ journal: unknown; entrySnapshot: unknown } | null> => {
			const rows = await db
				.select()
				.from(schema.tradeJournals)
				.where(eq(schema.tradeJournals.id, id))
				.limit(1);

			if (!rows[0]) return null;

			return {
				journal: rows[0],
				entrySnapshot: null,
			};
		},

		searchJournals: async (
			filter: JournalSearchFilter,
		): Promise<{ data: unknown[]; total: number }> => {
			const conditions = [];
			if (filter.strategyId) {
				conditions.push(eq(schema.tradeJournals.strategyId, filter.strategyId));
			}
			if (filter.symbol) {
				conditions.push(eq(schema.tradeJournals.symbol, filter.symbol));
			}
			if (filter.direction) {
				conditions.push(eq(schema.tradeJournals.direction, filter.direction));
			}
			if (filter.dateFrom) {
				conditions.push(sql`${schema.tradeJournals.entryTime} >= ${filter.dateFrom}::timestamptz`);
			}
			if (filter.dateTo) {
				conditions.push(sql`${schema.tradeJournals.entryTime} <= ${filter.dateTo}::timestamptz`);
			}
			if (filter.tags) {
				const tagList = filter.tags.split(",").map((t) => t.trim());
				conditions.push(sql`${schema.tradeJournals.tags} && ${tagList}`);
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [rows, [countRow]] = await Promise.all([
				db.select().from(schema.tradeJournals).where(where),
				db.select({ total: count() }).from(schema.tradeJournals).where(where),
			]);

			return {
				data: rows,
				total: countRow?.total ?? 0,
			};
		},

		getJournalAnalytics: async (filter: JournalAnalyticsFilter): Promise<JournalAnalytics> => {
			const conditions = [];
			if (filter.strategyId) {
				conditions.push(eq(schema.tradeJournals.strategyId, filter.strategyId));
			}
			if (filter.symbol) {
				conditions.push(eq(schema.tradeJournals.symbol, filter.symbol));
			}
			if (filter.tags) {
				const tagList = filter.tags.split(",").map((t) => t.trim());
				conditions.push(sql`${schema.tradeJournals.tags} && ${tagList}`);
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			// Overall stats
			const [overallRow] = await db
				.select({
					total: count(),
					winCount: sql<string>`SUM(CASE WHEN CAST(${schema.tradeJournals.netPnl} AS FLOAT) > 0 THEN 1 ELSE 0 END)`,
					avgPnl: sql<string>`AVG(CAST(${schema.tradeJournals.netPnl} AS FLOAT))`,
					avgWinPnl: sql<string>`AVG(CASE WHEN CAST(${schema.tradeJournals.netPnl} AS FLOAT) > 0 THEN CAST(${schema.tradeJournals.netPnl} AS FLOAT) END)`,
					avgLossPnl: sql<string>`AVG(CASE WHEN CAST(${schema.tradeJournals.netPnl} AS FLOAT) <= 0 THEN CAST(${schema.tradeJournals.netPnl} AS FLOAT) END)`,
				})
				.from(schema.tradeJournals)
				.where(where);

			const total = overallRow?.total ?? 0;
			const winCount = Number(overallRow?.winCount ?? 0);
			const overallWinrate = total > 0 ? winCount / total : 0;
			const avgWin = Number(overallRow?.avgWinPnl ?? 0) || 0;
			const avgLoss = Number(overallRow?.avgLossPnl ?? 0) || 0;
			const overallExpectancy = overallWinrate * avgWin + (1 - overallWinrate) * avgLoss;

			// Tag stats via unnest
			const tagStatsRows = await db.execute(
				sql`
					SELECT
						tag,
						COUNT(*) AS cnt,
						SUM(CASE WHEN CAST(net_pnl AS FLOAT) > 0 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) AS winrate,
						AVG(CAST(net_pnl AS FLOAT) * CASE WHEN CAST(net_pnl AS FLOAT) > 0 THEN 1 ELSE -1 END) AS expectancy
					FROM trade_journals, unnest(tags) AS tag
					${where ? sql`WHERE ${where}` : sql``}
					GROUP BY tag
					ORDER BY cnt DESC
				`,
			);

			const tagStats = (
				tagStatsRows as unknown as Array<{
					tag: string;
					cnt: string;
					winrate: string;
					expectancy: string;
				}>
			).map((row) => ({
				tag: row.tag,
				count: Number(row.cnt),
				winrate: Number(row.winrate ?? 0),
				expectancy: Number(row.expectancy ?? 0),
			}));

			return {
				tagStats,
				overallWinrate,
				overallExpectancy,
			};
		},
	};
}
