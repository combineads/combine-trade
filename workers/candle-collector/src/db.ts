import type { Candle } from "@combine/candle";
import type { Exchange, Timeframe } from "@combine/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candles as candlesTable } from "../../../db/schema/candles.js";
import { strategies } from "../../../db/schema/strategies.js";

type Db = PostgresJsDatabase;

export interface SymbolTimeframePair {
	symbol: string;
	timeframe: Timeframe;
}

/**
 * Upsert a single candle into the candles table.
 * ON CONFLICT (exchange, symbol, timeframe, open_time) DO UPDATE.
 */
export async function upsertCandle(db: Db, candle: Candle, source = "ws"): Promise<void> {
	await db
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

/**
 * Find the most recent open_time for the given exchange/symbol/timeframe.
 * Returns null if no candles exist yet.
 */
export async function findLatestOpenTime(
	db: Db,
	exchange: Exchange,
	symbol: string,
	timeframe: Timeframe,
): Promise<Date | null> {
	const rows = await db
		.select({ openTime: candlesTable.openTime })
		.from(candlesTable)
		.where(
			sql`${candlesTable.exchange} = ${exchange}
				AND ${candlesTable.symbol} = ${symbol}
				AND ${candlesTable.timeframe} = ${timeframe}`,
		)
		.orderBy(desc(candlesTable.openTime))
		.limit(1);

	return rows.length > 0 ? rows[0]!.openTime : null;
}

/**
 * Return distinct (symbol, timeframe) pairs from active strategies.
 * strategies.symbols is text[] — unnest to get individual symbols.
 * strategies.timeframe is a single text column.
 */
export async function findActiveSymbolTimeframes(db: Db): Promise<SymbolTimeframePair[]> {
	const rows = await db.execute(
		sql`SELECT DISTINCT unnest(${strategies.symbols}) AS symbol, ${strategies.timeframe} AS timeframe
			FROM ${strategies}
			WHERE ${strategies.status} = 'active'`,
	);

	return (rows as Array<{ symbol: string; timeframe: string }>).map((row) => ({
		symbol: row.symbol,
		timeframe: row.timeframe as Timeframe,
	}));
}
