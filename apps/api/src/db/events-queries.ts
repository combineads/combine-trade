import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { StrategyEvent } from "../../../../packages/core/strategy/event-types.js";
import type { PatternStatistics } from "../../../../packages/core/vector/types.js";
import type { EventQueryOptions, EventRouteDeps } from "../routes/events.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapRowToEvent(row: typeof schema.strategyEvents.$inferSelect): StrategyEvent {
	return {
		id: row.id,
		strategyId: row.strategyId,
		strategyVersion: row.strategyVersion,
		exchange: row.exchange as StrategyEvent["exchange"],
		symbol: row.symbol,
		timeframe: row.timeframe as StrategyEvent["timeframe"],
		openTime: row.openTime,
		direction: row.direction as "long" | "short",
		features: row.features as StrategyEvent["features"],
		entryPrice: row.entryPrice,
		status: row.status as StrategyEvent["status"],
		createdAt: row.createdAt,
	};
}

export function createEventDeps(db: Db): EventRouteDeps {
	return {
		strategyExists: async (id: string): Promise<boolean> => {
			const rows = await db
				.select({ id: schema.strategies.id })
				.from(schema.strategies)
				.where(eq(schema.strategies.id, id))
				.limit(1);
			return rows.length > 0;
		},

		findEventById: async (id: string): Promise<StrategyEvent | null> => {
			const rows = await db
				.select()
				.from(schema.strategyEvents)
				.where(eq(schema.strategyEvents.id, id))
				.limit(1);
			return rows[0] ? mapRowToEvent(rows[0]) : null;
		},

		findEventsByStrategy: async (
			opts: EventQueryOptions,
		): Promise<{ items: StrategyEvent[]; total: number }> => {
			const offset = (opts.page - 1) * opts.pageSize;

			const conditions = [eq(schema.strategyEvents.strategyId, opts.id)];
			if (opts.symbol) conditions.push(eq(schema.strategyEvents.symbol, opts.symbol));
			if (opts.direction) conditions.push(eq(schema.strategyEvents.direction, opts.direction));
			if (opts.dateFrom) conditions.push(gte(schema.strategyEvents.openTime, opts.dateFrom));
			if (opts.dateTo) conditions.push(lte(schema.strategyEvents.openTime, opts.dateTo));

			const where = and(...conditions);

			const [rows, [countRow]] = await Promise.all([
				db.select().from(schema.strategyEvents).where(where).limit(opts.pageSize).offset(offset),
				db.select({ total: count() }).from(schema.strategyEvents).where(where),
			]);

			return {
				items: rows.map(mapRowToEvent),
				total: countRow?.total ?? 0,
			};
		},

		getStrategyStatistics: async (
			id: string,
		): Promise<
			PatternStatistics & { totalEvents: number; longCount: number; shortCount: number }
		> => {
			// Count total events
			const [totalRow] = await db
				.select({ total: count() })
				.from(schema.strategyEvents)
				.where(eq(schema.strategyEvents.strategyId, id));

			const totalEvents = totalRow?.total ?? 0;

			if (totalEvents === 0) {
				return {
					winrate: 0,
					avgWin: 0,
					avgLoss: 0,
					expectancy: 0,
					sampleCount: 0,
					status: "INSUFFICIENT",
					totalEvents: 0,
					longCount: 0,
					shortCount: 0,
				};
			}

			// Count by direction
			const [longRow] = await db
				.select({ total: count() })
				.from(schema.strategyEvents)
				.where(
					and(
						eq(schema.strategyEvents.strategyId, id),
						eq(schema.strategyEvents.direction, "long"),
					),
				);
			const [shortRow] = await db
				.select({ total: count() })
				.from(schema.strategyEvents)
				.where(
					and(
						eq(schema.strategyEvents.strategyId, id),
						eq(schema.strategyEvents.direction, "short"),
					),
				);

			// Get labeled event statistics via join with event_labels
			const labelStats = await db
				.select({
					sampleCount: count(),
					avgPnl: sql<string>`AVG(CAST(${schema.eventLabels.pnlPct} AS FLOAT))`,
					avgWinPnl: sql<string>`AVG(CASE WHEN CAST(${schema.eventLabels.pnlPct} AS FLOAT) > 0 THEN CAST(${schema.eventLabels.pnlPct} AS FLOAT) END)`,
					avgLossPnl: sql<string>`AVG(CASE WHEN CAST(${schema.eventLabels.pnlPct} AS FLOAT) <= 0 THEN CAST(${schema.eventLabels.pnlPct} AS FLOAT) END)`,
					winCount: sql<string>`SUM(CASE WHEN CAST(${schema.eventLabels.pnlPct} AS FLOAT) > 0 THEN 1 ELSE 0 END)`,
				})
				.from(schema.eventLabels)
				.innerJoin(schema.strategyEvents, eq(schema.eventLabels.eventId, schema.strategyEvents.id))
				.where(eq(schema.strategyEvents.strategyId, id));

			const stats = labelStats[0];
			const sampleCount = stats?.sampleCount ?? 0;
			const winCount = Number(stats?.winCount ?? 0);
			const winrate = sampleCount > 0 ? winCount / sampleCount : 0;
			const avgWin = Number(stats?.avgWinPnl ?? 0) || 0;
			const avgLoss = Number(stats?.avgLossPnl ?? 0) || 0;
			const expectancy = winrate * avgWin + (1 - winrate) * avgLoss;

			return {
				winrate,
				avgWin,
				avgLoss,
				expectancy,
				sampleCount,
				status: sampleCount >= 30 ? "SUFFICIENT" : "INSUFFICIENT",
				totalEvents,
				longCount: longRow?.total ?? 0,
				shortCount: shortRow?.total ?? 0,
			};
		},
	};
}
