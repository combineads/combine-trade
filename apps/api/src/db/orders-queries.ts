import { and, count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { Order, OrderQueryOptions, OrderRouteDeps } from "../routes/orders.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapOrderType(orderType: string): "market" | "limit" {
	if (orderType === "market_order" || orderType === "market") return "market";
	if (orderType === "limit_order" || orderType === "limit") return "limit";
	return "market";
}

function mapOrderStatus(status: string): "open" | "closed" | "canceled" {
	if (status === "open" || status === "closed" || status === "canceled") return status;
	return "open";
}

function mapRowToOrder(row: typeof schema.orders.$inferSelect): Order {
	return {
		id: row.id,
		strategyId: row.strategyId,
		symbol: row.symbol,
		side: row.side.toLowerCase() as "buy" | "sell",
		type: mapOrderType(row.orderType),
		price: row.price,
		amount: row.quantity,
		filled: row.filledQuantity,
		status: mapOrderStatus(row.status),
		createdAt: row.createdAt,
	};
}

export function createOrderDeps(db: Db): OrderRouteDeps {
	return {
		findOrders: async (opts: OrderQueryOptions): Promise<{ items: Order[]; total: number }> => {
			const offset = (opts.page - 1) * opts.pageSize;

			const conditions = [eq(schema.orders.userId, opts.userId)];
			if (opts.symbol) conditions.push(eq(schema.orders.symbol, opts.symbol));
			if (opts.status) conditions.push(eq(schema.orders.status, opts.status));
			if (opts.strategyId) conditions.push(eq(schema.orders.strategyId, opts.strategyId));

			const where = and(...conditions);

			const [rows, [countRow]] = await Promise.all([
				db.select().from(schema.orders).where(where).limit(opts.pageSize).offset(offset),
				db.select({ total: count() }).from(schema.orders).where(where),
			]);

			return {
				items: rows.map(mapRowToOrder),
				total: countRow?.total ?? 0,
			};
		},
	};
}
