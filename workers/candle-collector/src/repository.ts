import type { Candle, CandleRepository } from "@combine/candle";
import type { Exchange, Timeframe } from "@combine/shared";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candles as candlesTable } from "../../../db/schema/candles.js";

type Db = PostgresJsDatabase;

function toCandle(row: typeof candlesTable.$inferSelect): Candle {
	return {
		exchange: row.exchange as Exchange,
		symbol: row.symbol,
		timeframe: row.timeframe as Timeframe,
		openTime: row.openTime,
		open: row.open,
		high: row.high,
		low: row.low,
		close: row.close,
		volume: row.volume,
		isClosed: row.isClosed,
	};
}

/**
 * DrizzleORM-based CandleRepository implementation.
 * Lives in workers layer (allowed to import db/schema/).
 */
export class DrizzleCandleRepository implements CandleRepository {
	constructor(private readonly db: Db) {}

	async insert(candle: Candle, source = "ws"): Promise<void> {
		await this.db.insert(candlesTable).values({
			exchange: candle.exchange,
			symbol: candle.symbol,
			timeframe: candle.timeframe,
			openTime: candle.openTime,
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close,
			volume: candle.volume,
			isClosed: candle.isClosed,
			source,
		});
	}

	async upsert(candle: Candle, source = "ws"): Promise<void> {
		await this.db
			.insert(candlesTable)
			.values({
				exchange: candle.exchange,
				symbol: candle.symbol,
				timeframe: candle.timeframe,
				openTime: candle.openTime,
				open: candle.open,
				high: candle.high,
				low: candle.low,
				close: candle.close,
				volume: candle.volume,
				isClosed: candle.isClosed,
				source,
			})
			.onConflictDoUpdate({
				target: [
					candlesTable.exchange,
					candlesTable.symbol,
					candlesTable.timeframe,
					candlesTable.openTime,
				],
				set: {
					open: candle.open,
					high: candle.high,
					low: candle.low,
					close: candle.close,
					volume: candle.volume,
					isClosed: candle.isClosed,
					source,
				},
			});
	}

	/** Bulk upsert for backfill — transactionally atomic */
	async upsertBatch(candles: Candle[], source = "rest"): Promise<void> {
		if (candles.length === 0) return;

		await this.db
			.insert(candlesTable)
			.values(
				candles.map((c) => ({
					exchange: c.exchange,
					symbol: c.symbol,
					timeframe: c.timeframe,
					openTime: c.openTime,
					open: c.open,
					high: c.high,
					low: c.low,
					close: c.close,
					volume: c.volume,
					isClosed: c.isClosed,
					source,
				})),
			)
			.onConflictDoUpdate({
				target: [
					candlesTable.exchange,
					candlesTable.symbol,
					candlesTable.timeframe,
					candlesTable.openTime,
				],
				set: {
					open: candlesTable.open,
					high: candlesTable.high,
					low: candlesTable.low,
					close: candlesTable.close,
					volume: candlesTable.volume,
					isClosed: candlesTable.isClosed,
					source,
				},
			});
	}

	async findByRange(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
	): Promise<Candle[]> {
		const rows = await this.db
			.select()
			.from(candlesTable)
			.where(
				and(
					eq(candlesTable.exchange, exchange),
					eq(candlesTable.symbol, symbol),
					eq(candlesTable.timeframe, timeframe),
					gte(candlesTable.openTime, from),
					lte(candlesTable.openTime, to),
				),
			)
			.orderBy(asc(candlesTable.openTime));

		return rows.map(toCandle);
	}

	async findLatest(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		limit = 100,
	): Promise<Candle[]> {
		const rows = await this.db
			.select()
			.from(candlesTable)
			.where(
				and(
					eq(candlesTable.exchange, exchange),
					eq(candlesTable.symbol, symbol),
					eq(candlesTable.timeframe, timeframe),
				),
			)
			.orderBy(asc(candlesTable.openTime))
			.limit(limit);

		return rows.map(toCandle);
	}

	/** Find the most recent openTime for gap calculation at startup */
	async findLatestOpenTime(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
	): Promise<Date | null> {
		const rows = await this.db
			.select({ openTime: candlesTable.openTime })
			.from(candlesTable)
			.where(
				and(
					eq(candlesTable.exchange, exchange),
					eq(candlesTable.symbol, symbol),
					eq(candlesTable.timeframe, timeframe),
				),
			)
			.orderBy(desc(candlesTable.openTime))
			.limit(1);

		return rows.length > 0 ? rows[0]!.openTime : null;
	}
}
