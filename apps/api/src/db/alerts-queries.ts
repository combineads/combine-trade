import { and, count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { Alert, AlertQueryOptions, AlertRouteDeps } from "../routes/alerts.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapDeliveryState(state: string): "pending" | "sent" | "failed" {
	if (state === "pending" || state === "sent" || state === "failed") return state;
	return "pending";
}

export function createAlertDeps(db: Db): AlertRouteDeps {
	return {
		findAlerts: async (opts: AlertQueryOptions): Promise<{ items: Alert[]; total: number }> => {
			const offset = (opts.page - 1) * opts.pageSize;

			const conditions = [];
			if (opts.strategyId) {
				conditions.push(eq(schema.strategyEvents.strategyId, opts.strategyId));
			}
			if (opts.status) {
				conditions.push(eq(schema.alerts.deliveryState, opts.status));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [rows, [countRow]] = await Promise.all([
				db
					.select({
						id: schema.alerts.id,
						strategyId: schema.strategyEvents.strategyId,
						symbol: schema.strategyEvents.symbol,
						direction: schema.strategyEvents.direction,
						entryPrice: schema.strategyEvents.entryPrice,
						deliveryState: schema.alerts.deliveryState,
						createdAt: schema.alerts.createdAt,
					})
					.from(schema.alerts)
					.innerJoin(schema.strategyEvents, eq(schema.alerts.eventId, schema.strategyEvents.id))
					.where(where)
					.limit(opts.pageSize)
					.offset(offset),
				db
					.select({ total: count() })
					.from(schema.alerts)
					.innerJoin(schema.strategyEvents, eq(schema.alerts.eventId, schema.strategyEvents.id))
					.where(where),
			]);

			const items: Alert[] = rows.map((row) => ({
				id: row.id,
				strategyId: row.strategyId,
				symbol: row.symbol,
				direction: row.direction as "long" | "short",
				entryPrice: row.entryPrice,
				status: mapDeliveryState(row.deliveryState),
				createdAt: row.createdAt,
			}));

			return {
				items,
				total: countRow?.total ?? 0,
			};
		},
	};
}
