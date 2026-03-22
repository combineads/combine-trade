import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { isContinuous } from "@combine/candle";
import { DrizzleCandleRepository } from "../../workers/candle-collector/src/repository.js";
import { generateCandles } from "../helpers/candle-generator.js";

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ?? "postgres://combine:combine@localhost:5432/combine_trade_test";
let sql: ReturnType<typeof postgres>;
let repo: DrizzleCandleRepository;

beforeAll(async () => {
	const adminSql = postgres("postgres://combine:combine@localhost:5432/combine_trade");
	try {
		await adminSql.unsafe("CREATE DATABASE combine_trade_test");
	} catch {
		// Already exists
	}
	await adminSql.end();

	sql = postgres(TEST_DB_URL);
	const db = drizzle(sql);
	await migrate(db, { migrationsFolder: "./db/migrations" });
	repo = new DrizzleCandleRepository(db);
});

beforeEach(async () => {
	await sql`DELETE FROM candles`;
});

afterAll(async () => {
	if (sql) {
		await sql`DELETE FROM candles`;
		await sql.end();
	}
});

describe("DrizzleCandleRepository", () => {
	test("upsert creates candle that doesn't exist", async () => {
		const candles = generateCandles({ count: 1, seed: 200 });
		await repo.upsert(candles[0]!);

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 10);
		expect(result.length).toBe(1);
		expect(result[0]!.open).toBe(candles[0]!.open);
	});

	test("upsert updates existing candle with same composite key", async () => {
		const candles = generateCandles({ count: 1, seed: 200 });
		await repo.upsert(candles[0]!);
		await repo.upsert({ ...candles[0]!, close: "99999.00" });

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 10);
		expect(result.length).toBe(1);
		expect(result[0]!.close).toBe("99999.00");
	});

	test("upsertBatch inserts 500 candles", async () => {
		const candles = generateCandles({ count: 500, seed: 300 });
		await repo.upsertBatch(candles);

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 600);
		expect(result.length).toBe(500);
		expect(isContinuous(result)).toBe(true);
	});

	test("upsertBatch is idempotent", async () => {
		const candles = generateCandles({ count: 100, seed: 400 });
		await repo.upsertBatch(candles);
		await repo.upsertBatch(candles); // Second call

		const result = await repo.findLatest("binance", "BTCUSDT", "1m", 200);
		expect(result.length).toBe(100);
	});

	test("findLatestOpenTime returns null when no candles exist", async () => {
		const result = await repo.findLatestOpenTime("binance", "BTCUSDT", "1m");
		expect(result).toBeNull();
	});

	test("findLatestOpenTime returns most recent openTime", async () => {
		const candles = generateCandles({ count: 50, seed: 500 });
		await repo.upsertBatch(candles);

		const result = await repo.findLatestOpenTime("binance", "BTCUSDT", "1m");
		expect(result).not.toBeNull();
		expect(result!.getTime()).toBe(candles[49]!.openTime.getTime());
	});

	test("source column is persisted correctly", async () => {
		const candles = generateCandles({ count: 5, seed: 600 });
		await repo.upsertBatch(candles, "rest");

		const rows = await sql`SELECT source FROM candles LIMIT 5`;
		for (const row of rows) {
			expect(row.source).toBe("rest");
		}

		// Single upsert with ws source
		await repo.upsert(candles[0]!, "ws");
		const openTimeIso = candles[0]!.openTime.toISOString();
		const updated =
			await sql`SELECT source FROM candles WHERE open_time = ${openTimeIso}::timestamptz`;
		expect(updated[0]!.source).toBe("ws");
	});
});
