import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import Decimal from "decimal.js";
import { getDb, getPool } from "../../src/db/pool";
import type { NewCandle } from "../../src/candles/history-loader";
import {
  bulkUpsertCandles,
  getCandles,
  getLatestCandleTime,
} from "../../src/candles/repository";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<NewCandle> = {}): NewCandle {
  return {
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: new Decimal("50000"),
    high: new Decimal("50100"),
    low: new Decimal("49900"),
    close: new Decimal("50050"),
    volume: new Decimal("100.5"),
    is_closed: true,
    ...overrides,
  };
}

async function insertParentSymbol(
  symbol = "BTCUSDT",
  exchange = "binance",
): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
  `;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("candle repository integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // Pool은 프로세스 종료 시 자동 정리 (병렬 테스트 파일 간 충돌 방지)

  // -----------------------------------------------------------------------
  // bulkUpsertCandles
  // -----------------------------------------------------------------------

  describe("bulkUpsertCandles", () => {
    it("inserts 3000 candles in 3 batches and returns 3000", async () => {
      await insertParentSymbol();
      const db = getDb();

      const candles: NewCandle[] = [];
      for (let i = 0; i < 3000; i++) {
        candles.push(
          makeCandle({
            open_time: new Date(
              Date.UTC(2024, 0, 1) + i * 5 * 60 * 1000,
            ),
          }),
        );
      }

      const count = await bulkUpsertCandles(db, candles);
      expect(count).toBe(3000);

      // Verify all rows are in the DB
      const pool = getPool();
      const result = await pool`
        SELECT count(*)::int AS cnt FROM candles
        WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
      `;
      expect(result[0]!.cnt).toBe(3000);
    });

    it("updates duplicate candles when existing is_closed = false", async () => {
      await insertParentSymbol();
      const db = getDb();

      // Insert initial candle with is_closed = false
      const initial = makeCandle({ is_closed: false });
      await bulkUpsertCandles(db, [initial]);

      // Upsert with updated price and is_closed = true
      const updated = makeCandle({
        close: new Decimal("51000"),
        is_closed: true,
      });
      await bulkUpsertCandles(db, [updated]);

      // Verify the close price was updated
      const pool = getPool();
      const openTimeStr = initial.open_time.toISOString();
      const rows = await pool`
        SELECT close, is_closed FROM candles
        WHERE symbol = 'BTCUSDT'
          AND exchange = 'binance'
          AND timeframe = '5M'
          AND open_time = ${openTimeStr}::timestamptz
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.close).toBe("51000");
      expect(rows[0]!.is_closed).toBe(true);
    });

    it("skips duplicate candles when existing is_closed = true", async () => {
      await insertParentSymbol();
      const db = getDb();

      // Insert initial candle with is_closed = true
      const initial = makeCandle({ is_closed: true });
      await bulkUpsertCandles(db, [initial]);

      // Attempt to upsert with different close price
      const attempted = makeCandle({
        close: new Decimal("99999"),
        is_closed: true,
      });
      await bulkUpsertCandles(db, [attempted]);

      // Verify the close price was NOT updated
      const pool = getPool();
      const openTimeStr = initial.open_time.toISOString();
      const rows = await pool`
        SELECT close FROM candles
        WHERE symbol = 'BTCUSDT'
          AND exchange = 'binance'
          AND timeframe = '5M'
          AND open_time = ${openTimeStr}::timestamptz
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.close).toBe("50050");
    });

    it("returns 0 for empty array without error", async () => {
      const db = getDb();
      const count = await bulkUpsertCandles(db, []);
      expect(count).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getLatestCandleTime
  // -----------------------------------------------------------------------

  describe("getLatestCandleTime", () => {
    it("returns null on empty table", async () => {
      const db = getDb();
      const result = await getLatestCandleTime(
        db,
        "BTCUSDT",
        "binance",
        "5M",
      );
      expect(result).toBeNull();
    });

    it("returns the latest open_time when data exists", async () => {
      await insertParentSymbol();
      const db = getDb();

      const t1 = new Date("2024-01-01T00:00:00Z");
      const t2 = new Date("2024-01-01T00:05:00Z");
      const t3 = new Date("2024-01-01T00:10:00Z");

      await bulkUpsertCandles(db, [
        makeCandle({ open_time: t1 }),
        makeCandle({ open_time: t2 }),
        makeCandle({ open_time: t3 }),
      ]);

      const result = await getLatestCandleTime(
        db,
        "BTCUSDT",
        "binance",
        "5M",
      );
      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(t3.getTime());
    });
  });

  // -----------------------------------------------------------------------
  // getCandles
  // -----------------------------------------------------------------------

  describe("getCandles", () => {
    it("returns candles in range ordered by open_time DESC", async () => {
      await insertParentSymbol();
      const db = getDb();

      const t1 = new Date("2024-01-01T00:00:00Z");
      const t2 = new Date("2024-01-01T00:05:00Z");
      const t3 = new Date("2024-01-01T00:10:00Z");
      const t4 = new Date("2024-01-01T00:15:00Z");
      const t5 = new Date("2024-01-01T00:20:00Z");

      await bulkUpsertCandles(db, [
        makeCandle({ open_time: t1 }),
        makeCandle({ open_time: t2 }),
        makeCandle({ open_time: t3 }),
        makeCandle({ open_time: t4 }),
        makeCandle({ open_time: t5 }),
      ]);

      // Query range [t2, t4] — should include t2, t3, t4
      const results = await getCandles(
        db,
        "BTCUSDT",
        "binance",
        "5M",
        t2,
        t4,
      );

      expect(results).toHaveLength(3);

      // Verify DESC order
      expect(results[0]!.open_time.getTime()).toBe(t4.getTime());
      expect(results[1]!.open_time.getTime()).toBe(t3.getTime());
      expect(results[2]!.open_time.getTime()).toBe(t2.getTime());
    });

    it("respects the limit parameter", async () => {
      await insertParentSymbol();
      const db = getDb();

      const candles = Array.from({ length: 10 }, (_, i) =>
        makeCandle({
          open_time: new Date(Date.UTC(2024, 0, 1) + i * 5 * 60 * 1000),
        }),
      );

      await bulkUpsertCandles(db, candles);

      const results = await getCandles(
        db,
        "BTCUSDT",
        "binance",
        "5M",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T01:00:00Z"),
        3,
      );

      expect(results).toHaveLength(3);
    });

    it("returns empty array when no candles match", async () => {
      const db = getDb();
      const results = await getCandles(
        db,
        "BTCUSDT",
        "binance",
        "5M",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T01:00:00Z"),
      );

      expect(results).toHaveLength(0);
    });
  });
});
