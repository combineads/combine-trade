import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { getDb, getPool } from "../../src/db/pool";
import { candleTable, symbolTable } from "../../src/db/schema";
import { cleanupOldCandles } from "../../src/candles/cleanup";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date that is `months` months ago from now. */
function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Inserts the parent symbol row required by the FK on candles. */
async function insertTestSymbol(): Promise<void> {
  const db = getDb();
  await db
    .insert(symbolTable)
    .values({
      symbol: "BTCUSDT",
      exchange: "binance",
      name: "BTC/USDT",
      base_asset: "BTC",
      quote_asset: "USDT",
    })
    .onConflictDoNothing();
}

/** Inserts `count` candle rows for the given timeframe and open_time. */
async function insertCandles(
  timeframe: string,
  openTime: Date,
  count: number,
): Promise<void> {
  const db = getDb();
  const rows = Array.from({ length: count }, (_, i) => ({
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe,
    open_time: new Date(openTime.getTime() + i * 60_000),
    open: "50000",
    high: "51000",
    low: "49000",
    close: "50500",
    volume: "100",
    is_closed: true,
  }));

  // Insert in chunks of 500 to avoid overly large statements
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.insert(candleTable).values(chunk);
  }
}

/** Counts candle rows matching a given timeframe. */
async function countCandles(timeframe: string): Promise<number> {
  const pool = getPool();
  const result = await pool`
    SELECT count(*)::int AS cnt FROM candles WHERE timeframe = ${timeframe}
  `;
  return result[0]?.cnt ?? 0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("candle cleanup integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
    await insertTestSymbol();
  });

  // Pool은 프로세스 종료 시 자동 정리 (병렬 테스트 파일 간 충돌 방지)

  it("deletes 1M candles older than 6 months", async () => {
    const oldTime = monthsAgo(7);
    await insertCandles("1M", oldTime, 10);

    const results = await cleanupOldCandles();

    expect(results).toHaveLength(1);
    expect(results[0]!.timeframe).toBe("1M");
    expect(results[0]!.deleted).toBe(10);
    expect(await countCandles("1M")).toBe(0);
  });

  it("does NOT delete 1M candles within 6 months", async () => {
    const recentTime = monthsAgo(3);
    await insertCandles("1M", recentTime, 5);

    const results = await cleanupOldCandles();

    expect(results[0]!.deleted).toBe(0);
    expect(await countCandles("1M")).toBe(5);
  });

  it("does NOT delete 5M candles older than 6 months", async () => {
    const oldTime = monthsAgo(7);
    await insertCandles("5M", oldTime, 5);

    const results = await cleanupOldCandles();

    expect(results[0]!.deleted).toBe(0);
    expect(await countCandles("5M")).toBe(5);
  });

  it("does NOT delete 1H candles older than 6 months", async () => {
    const oldTime = monthsAgo(7);
    await insertCandles("1H", oldTime, 5);

    const results = await cleanupOldCandles();

    expect(results[0]!.deleted).toBe(0);
    expect(await countCandles("1H")).toBe(5);
  });

  it("does NOT delete 1D candles older than 6 months", async () => {
    const oldTime = monthsAgo(7);
    await insertCandles("1D", oldTime, 5);

    const results = await cleanupOldCandles();

    expect(results[0]!.deleted).toBe(0);
    expect(await countCandles("1D")).toBe(5);
  });

  it("returns deleted: 0 on empty table", async () => {
    const results = await cleanupOldCandles();

    expect(results).toHaveLength(1);
    expect(results[0]!.timeframe).toBe("1M");
    expect(results[0]!.deleted).toBe(0);
  });

  it("deletes 3000 old 1M candles in multiple batches", async () => {
    const oldTime = monthsAgo(8);
    await insertCandles("1M", oldTime, 3000);

    const results = await cleanupOldCandles({ batchSize: 1000 });

    expect(results[0]!.deleted).toBe(3000);
    expect(await countCandles("1M")).toBe(0);
  });

  it("cutoffDate is approximately 6 months ago", async () => {
    const results = await cleanupOldCandles();

    const sixMonthsAgo = monthsAgo(6);
    const diff = Math.abs(
      results[0]!.cutoffDate.getTime() - sixMonthsAgo.getTime(),
    );

    // Allow up to 5 seconds of drift between the two calculations
    expect(diff).toBeLessThan(5000);
  });

  it("only deletes old 1M and preserves recent 1M and other timeframes", async () => {
    const oldTime = monthsAgo(7);
    const recentTime = monthsAgo(2);

    // Insert a mix of candles
    await insertCandles("1M", oldTime, 20);
    await insertCandles("1M", recentTime, 10);
    await insertCandles("5M", oldTime, 5);
    await insertCandles("1H", oldTime, 5);
    await insertCandles("1D", oldTime, 5);

    const results = await cleanupOldCandles();

    expect(results[0]!.deleted).toBe(20);
    expect(await countCandles("1M")).toBe(10);
    expect(await countCandles("5M")).toBe(5);
    expect(await countCandles("1H")).toBe(5);
    expect(await countCandles("1D")).toBe(5);
  });
});
