import type { CandleRepository } from "@combine/candle";
import type { StrategyEvent, StrategyEventRepository } from "@combine/core/strategy";
import type { CreateStrategyEventInput } from "@combine/core/strategy";
import type { Strategy } from "@combine/core/strategy";
import type { FeatureDefinition } from "@combine/core/strategy";
import type { Timeframe } from "@combine/shared";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candles } from "../../../db/schema/candles.js";
import { strategies } from "../../../db/schema/strategies.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";

type Db = PostgresJsDatabase;

/**
 * Find all active strategies that match the given symbol and timeframe.
 * strategies.symbols is a text[] array; use the @> array contains operator.
 * strategies.timeframe is a single text column.
 */
export async function findActiveStrategies(
	db: Db,
	symbol: string,
	timeframe: Timeframe,
): Promise<Strategy[]> {
	const rows = await db
		.select()
		.from(strategies)
		.where(
			and(
				eq(strategies.status, "active"),
				eq(strategies.timeframe, timeframe),
				sql`${strategies.symbols} @> ARRAY[${symbol}]::text[]`,
			),
		);

	return rows.map((row) => ({
		id: row.id,
		version: row.version,
		name: row.name,
		description: row.description,
		code: row.code,
		symbols: row.symbols,
		timeframe: row.timeframe as Strategy["timeframe"],
		direction: row.direction as Strategy["direction"],
		featuresDefinition: row.featuresDefinition as FeatureDefinition[],
		normalizationConfig: (row.normalizationConfig ?? {}) as Record<string, unknown>,
		searchConfig: (row.searchConfig ?? {}) as Record<string, unknown>,
		resultConfig: (row.resultConfig ?? {}) as Record<string, unknown>,
		decisionConfig: (row.decisionConfig ?? {}) as Record<string, unknown>,
		executionMode: row.executionMode as Strategy["executionMode"],
		apiVersion: row.apiVersion,
		status: row.status as Strategy["status"],
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt,
	}));
}

/**
 * Drizzle-based StrategyEventRepository.
 * Inserts strategy events into the strategy_events table and retrieves by strategy/symbol/timeframe.
 */
export function createStrategyEventRepository(db: Db): StrategyEventRepository {
	return {
		async insert(input: CreateStrategyEventInput): Promise<StrategyEvent> {
			const rows = await db
				.insert(strategyEvents)
				.values({
					strategyId: input.strategyId,
					strategyVersion: input.strategyVersion,
					exchange: input.exchange,
					symbol: input.symbol,
					timeframe: input.timeframe,
					openTime: input.openTime,
					direction: input.direction,
					features: input.features,
					entryPrice: input.entryPrice,
				})
				.returning();

			const row = rows[0];
			if (!row) {
				throw new Error("Failed to insert strategy event");
			}

			return {
				id: row.id,
				strategyId: row.strategyId,
				strategyVersion: row.strategyVersion,
				exchange: row.exchange,
				symbol: row.symbol,
				timeframe: row.timeframe as Timeframe,
				openTime: row.openTime,
				direction: row.direction as "long" | "short",
				features: row.features as StrategyEvent["features"],
				entryPrice: row.entryPrice,
				status: row.status as StrategyEvent["status"],
				createdAt: row.createdAt,
			};
		},

		async findByStrategy(
			strategyId: string,
			strategyVersion: number,
			symbol: string,
			timeframe: Timeframe,
		): Promise<StrategyEvent[]> {
			const rows = await db
				.select()
				.from(strategyEvents)
				.where(
					and(
						eq(strategyEvents.strategyId, strategyId),
						eq(strategyEvents.strategyVersion, strategyVersion),
						eq(strategyEvents.symbol, symbol),
						eq(strategyEvents.timeframe, timeframe),
					),
				);

			return rows.map((row) => ({
				id: row.id,
				strategyId: row.strategyId,
				strategyVersion: row.strategyVersion,
				exchange: row.exchange,
				symbol: row.symbol,
				timeframe: row.timeframe as Timeframe,
				openTime: row.openTime,
				direction: row.direction as "long" | "short",
				features: row.features as StrategyEvent["features"],
				entryPrice: row.entryPrice,
				status: row.status as StrategyEvent["status"],
				createdAt: row.createdAt,
			}));
		},

		async findByRange(strategyId: string, from: Date, to: Date): Promise<StrategyEvent[]> {
			const rows = await db
				.select()
				.from(strategyEvents)
				.where(
					and(
						eq(strategyEvents.strategyId, strategyId),
						sql`${strategyEvents.openTime} >= ${from}`,
						sql`${strategyEvents.openTime} <= ${to}`,
					),
				);

			return rows.map((row) => ({
				id: row.id,
				strategyId: row.strategyId,
				strategyVersion: row.strategyVersion,
				exchange: row.exchange,
				symbol: row.symbol,
				timeframe: row.timeframe as Timeframe,
				openTime: row.openTime,
				direction: row.direction as "long" | "short",
				features: row.features as StrategyEvent["features"],
				entryPrice: row.entryPrice,
				status: row.status as StrategyEvent["status"],
				createdAt: row.createdAt,
			}));
		},
	};
}

/**
 * Drizzle-based CandleRepository for strategy warmup.
 * Implements only the methods needed by StrategyEvaluator (findLatest).
 * findForWarmup is a lower-level helper if direct access is needed.
 */
export function createCandleRepository(db: Db): CandleRepository {
	return {
		async insert(candle) {
			await db.insert(candles).values({
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
			});
		},

		async upsert(candle) {
			await db
				.insert(candles)
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
				})
				.onConflictDoUpdate({
					target: [candles.exchange, candles.symbol, candles.timeframe, candles.openTime],
					set: {
						open: candle.open,
						high: candle.high,
						low: candle.low,
						close: candle.close,
						volume: candle.volume,
						isClosed: candle.isClosed,
					},
				});
		},

		async findByRange(exchange, symbol, timeframe, from, to) {
			const rows = await db
				.select()
				.from(candles)
				.where(
					and(
						eq(candles.exchange, exchange),
						eq(candles.symbol, symbol),
						eq(candles.timeframe, timeframe),
						sql`${candles.openTime} >= ${from}`,
						sql`${candles.openTime} <= ${to}`,
					),
				);
			return rows.map((row) => ({
				exchange: row.exchange,
				symbol: row.symbol,
				timeframe: row.timeframe as Timeframe,
				openTime: row.openTime,
				open: row.open,
				high: row.high,
				low: row.low,
				close: row.close,
				volume: row.volume,
				isClosed: row.isClosed,
			}));
		},

		async findLatest(exchange, symbol, timeframe, limit = 300) {
			const rows = await db
				.select()
				.from(candles)
				.where(
					and(
						eq(candles.exchange, exchange),
						eq(candles.symbol, symbol),
						eq(candles.timeframe, timeframe),
					),
				)
				.orderBy(desc(candles.openTime))
				.limit(limit);

			// Return in ascending order (oldest first) for indicator computation
			return rows
				.map((row) => ({
					exchange: row.exchange,
					symbol: row.symbol,
					timeframe: row.timeframe as Timeframe,
					openTime: row.openTime,
					open: row.open,
					high: row.high,
					low: row.low,
					close: row.close,
					volume: row.volume,
					isClosed: row.isClosed,
				}))
				.reverse();
		},
	};
}

/**
 * Find warmup candles: candles ordered by open_time DESC before the given time, up to limit.
 * Used for pre-loading indicator data before strategy evaluation.
 */
export async function findCandlesForWarmup(
	db: Db,
	exchange: string,
	symbol: string,
	timeframe: Timeframe,
	before: Date,
	limit: number,
) {
	const rows = await db
		.select()
		.from(candles)
		.where(
			and(
				eq(candles.exchange, exchange),
				eq(candles.symbol, symbol),
				eq(candles.timeframe, timeframe),
				lt(candles.openTime, before),
			),
		)
		.orderBy(desc(candles.openTime))
		.limit(limit);

	return rows
		.map((row) => ({
			exchange: row.exchange,
			symbol: row.symbol,
			timeframe: row.timeframe as Timeframe,
			openTime: row.openTime,
			open: row.open,
			high: row.high,
			low: row.low,
			close: row.close,
			volume: row.volume,
			isClosed: row.isClosed,
		}))
		.reverse();
}
