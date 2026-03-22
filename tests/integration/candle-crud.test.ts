import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import type { Candle, CandleRepository } from "@combine/candle";
import { isContinuous, validateContinuity } from "@combine/candle";
import type { Exchange, Timeframe } from "@combine/shared";
import { candles as candlesTable } from "../../db/schema/candles.js";
import { generateCandles } from "../helpers/candle-generator.js";

// --- Drizzle CandleRepository implementation ---
type Db = ReturnType<typeof drizzle>;

class DrizzleCandleRepository implements CandleRepository {
	constructor(private readonly db: Db) {}

	async insert(candle: Candle): Promise<void> {
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
		});
	}

	async upsert(candle: Candle): Promise<void> {
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

		return rows.map(this.toCandle);
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

		return rows.map(this.toCandle);
	}

	private toCandle(row: typeof candlesTable.$inferSelect): Candle {
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
}

// --- Test setup ---
const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ?? "postgres://combine:combine@localhost:5432/combine_trade_test";
let sql: ReturnType<typeof postgres>;
let db: Db;
let repo: DrizzleCandleRepository;

beforeAll(async () => {
	// Create test database if it doesn't exist
	const adminSql = postgres("postgres://combine:combine@localhost:5432/combine_trade");
	try {
		await adminSql.unsafe("CREATE DATABASE combine_trade_test");
	} catch {
		// Database may already exist
	}
	await adminSql.end();

	// Connect to test database
	sql = postgres(TEST_DB_URL);
	db = drizzle(sql);

	// Apply migrations
	await migrate(db, { migrationsFolder: "./db/migrations" });

	// Clean up candles table for isolated test
	await sql`DELETE FROM candles`;

	repo = new DrizzleCandleRepository(db);
});

afterAll(async () => {
	if (sql) {
		await sql`DELETE FROM candles`;
		await sql.end();
	}
});

describe("Candle CRUD integration", () => {
	test("insert and read back candles", async () => {
		const candles = generateCandles({ count: 50, seed: 100 });

		for (const candle of candles) {
			await repo.insert(candle);
		}

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 100);
		expect(result.length).toBe(50);
	});

	test("findByRange returns correct subset", async () => {
		const candles = generateCandles({ count: 50, seed: 100 });
		const from = candles[10]!.openTime;
		const to = candles[19]!.openTime;

		const result = await repo.findByRange("binance", "BTCUSDT", "1m", from, to);
		expect(result.length).toBe(10);
		expect(result[0]!.openTime.getTime()).toBe(from.getTime());
		expect(result[9]!.openTime.getTime()).toBe(to.getTime());
	});

	test("read-back candles pass continuity validation", async () => {
		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 100);
		expect(isContinuous(result)).toBe(true);
		expect(validateContinuity(result)).toEqual([]);
	});

	test("upsert updates existing candle", async () => {
		const candles = generateCandles({ count: 1, seed: 100 });
		const original = candles[0]!;

		// Update the close price
		const updated: Candle = { ...original, close: "99999.99" };
		await repo.upsert(updated);

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 1);
		expect(result[0]!.close).toBe("99999.99");
	});

	test("gap detection works on DB data", async () => {
		// Clean and insert candles with a gap
		await sql`DELETE FROM candles`;

		const base = Date.UTC(2024, 6, 1, 0, 0, 0);
		const minute = 60_000;

		// Insert candles 0, 1, 3 (skip 2)
		const withGap = [
			makeTestCandle(base),
			makeTestCandle(base + minute),
			makeTestCandle(base + 3 * minute), // gap at index 2
		];

		for (const c of withGap) {
			await repo.insert(c);
		}

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 100);
		expect(isContinuous(result)).toBe(false);

		const gaps = validateContinuity(result);
		expect(gaps.length).toBe(1);
		expect(gaps[0]!.expectedTime.getTime()).toBe(base + 2 * minute);
	});
});

function makeTestCandle(openTimeMs: number): Candle {
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime: new Date(openTimeMs),
		open: "50000",
		high: "50100",
		low: "49900",
		close: "50050",
		volume: "100",
		isClosed: true,
	};
}
