import { and, count, eq, gte, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { Candle } from "@combine/candle/types.js";
import type { CandleQueryOptions, CandleRouteDeps } from "../routes/candles.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapRowToCandle(row: typeof schema.candles.$inferSelect): Candle {
	return {
		exchange: row.exchange as Candle["exchange"],
		symbol: row.symbol,
		timeframe: row.timeframe as Candle["timeframe"],
		openTime: row.openTime,
		open: row.open,
		high: row.high,
		low: row.low,
		close: row.close,
		volume: row.volume,
		isClosed: row.isClosed,
	};
}

export function createCandleDeps(db: Db): CandleRouteDeps {
	return {
		findCandles: async (opts: CandleQueryOptions): Promise<{ items: Candle[]; total: number }> => {
			const offset = (opts.page - 1) * opts.pageSize;

			const conditions = [
				eq(schema.candles.symbol, opts.symbol),
				eq(schema.candles.timeframe, opts.timeframe),
			];
			if (opts.from) conditions.push(gte(schema.candles.openTime, opts.from));
			if (opts.to) conditions.push(lte(schema.candles.openTime, opts.to));

			const where = and(...conditions);

			const [rows, [countRow]] = await Promise.all([
				db.select().from(schema.candles).where(where).limit(opts.pageSize).offset(offset),
				db.select({ total: count() }).from(schema.candles).where(where),
			]);

			return {
				items: rows.map(mapRowToCandle),
				total: countRow?.total ?? 0,
			};
		},
	};
}
