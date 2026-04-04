import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { Decimal } from "../../src/core/decimal";
import type { ExchangeAdapter } from "../../src/core/ports";
import type { Exchange, Timeframe } from "../../src/core/types";
import type { NewCandle } from "../../src/candles/history-loader";
import type { DbInstance } from "../../src/db/pool";
import { getDb, getPool } from "../../src/db/pool";
import { symbolTable } from "../../src/db/schema";
import {
  type SyncOptions,
  type SyncResult,
  syncCandles,
} from "../../src/candles/sync";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";
import { bulkUpsertCandles, getLatestCandleTime } from "../../src/candles/repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<NewCandle> = {}): NewCandle {
  return {
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "1D",
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

function makeAdapter(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
  return {
    fetchOHLCV: mock(() => Promise.resolve([])),
    fetchBalance: mock(() =>
      Promise.resolve({ total: new Decimal("0"), available: new Decimal("0") }),
    ),
    fetchPositions: mock(() => Promise.resolve([])),
    createOrder: mock(() => Promise.reject(new Error("not implemented"))),
    cancelOrder: mock(() => Promise.reject(new Error("not implemented"))),
    editOrder: mock(() => Promise.reject(new Error("not implemented"))),
    fetchOrder: mock(() => Promise.reject(new Error("not implemented"))),
    watchOHLCV: mock(() => Promise.reject(new Error("not implemented"))),
    getExchangeInfo: mock(() => Promise.reject(new Error("not implemented"))),
    setLeverage: mock(() => Promise.reject(new Error("not implemented"))),
    ...overrides,
  };
}

/**
 * A fixed "now" for deterministic tests: 2024-07-15 12:00:00 UTC.
 * Yesterday end = 2024-07-14 23:59:59 UTC.
 */
const FIXED_NOW = new Date(Date.UTC(2024, 6, 15, 12, 0, 0));

/** Yesterday end relative to FIXED_NOW. */
const YESTERDAY_END = new Date(Date.UTC(2024, 6, 14, 23, 59, 59));

/** 3 years before FIXED_NOW. */
const THREE_YEARS_AGO = new Date(
  Date.UTC(
    FIXED_NOW.getUTCFullYear() - 3,
    FIXED_NOW.getUTCMonth(),
    FIXED_NOW.getUTCDate(),
  ),
);

/** 6 months before FIXED_NOW. */
const SIX_MONTHS_AGO = new Date(
  Date.UTC(
    FIXED_NOW.getUTCFullYear(),
    FIXED_NOW.getUTCMonth() - 6,
    FIXED_NOW.getUTCDate(),
  ),
);

// ---------------------------------------------------------------------------
// Unit tests (all dependencies mocked)
// ---------------------------------------------------------------------------

describe("candle-sync unit", () => {
  it("calls downloadFn with 3-year-ago start for 1D when DB is empty", async () => {
    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1D"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(downloadFn).toHaveBeenCalledTimes(1);
    const [, , , from, to] = downloadFn.mock.calls[0]!;

    // from should be 3 years ago (retention start, since empty DB)
    expect(from.getTime()).toBe(THREE_YEARS_AGO.getTime());
    // to should be yesterday end
    expect(to.getTime()).toBe(YESTERDAY_END.getTime());
  });

  it("uses 6-month retention window for 1M timeframe", async () => {
    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1M"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(downloadFn).toHaveBeenCalledTimes(1);
    const [, , , from] = downloadFn.mock.calls[0]!;

    // from should be 6 months ago
    expect(from.getTime()).toBe(SIX_MONTHS_AGO.getTime());
  });

  it("downloads from (latest - 1 day) when existing data is 3 days old", async () => {
    // latest candle = 3 days before yesterday → July 11, 2024
    const latestTime = new Date(Date.UTC(2024, 6, 11, 0, 0, 0));

    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(latestTime),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1H"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(downloadFn).toHaveBeenCalledTimes(1);
    const [, , , from] = downloadFn.mock.calls[0]!;

    // from = latestTime - 1 day = July 10
    const expectedFrom = new Date(latestTime.getTime() - 24 * 60 * 60 * 1000);
    expect(from.getTime()).toBe(expectedFrom.getTime());
  });

  it("always re-downloads last day by subtracting 1 day from `from`", async () => {
    // latest candle = yesterday (July 14) — still should subtract 1 day
    const latestTime = new Date(Date.UTC(2024, 6, 14, 0, 0, 0));

    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(latestTime),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["5M"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(downloadFn).toHaveBeenCalledTimes(1);
    const [, , , from] = downloadFn.mock.calls[0]!;

    // from = July 14 - 1 day = July 13
    const expectedFrom = new Date(latestTime.getTime() - 24 * 60 * 60 * 1000);
    expect(from.getTime()).toBe(expectedFrom.getTime());
  });

  it("falls back to fetchCandlesViaREST when download fails and adapter provided", async () => {
    const restCandles: NewCandle[] = [
      makeCandle({ symbol: "BTCUSDT", exchange: "binance", timeframe: "1H" }),
    ];

    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) => {
        throw new Error("Download failed");
      },
    );
    const fetchRestFn = mock(
      (_adapter: ExchangeAdapter, _s: string, _tf: Timeframe, _since: number) =>
        Promise.resolve(restCandles),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(1),
    );

    const adapter = makeAdapter();

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1H"],
      adapter,
      downloadFn,
      fetchRestFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(fetchRestFn).toHaveBeenCalledTimes(1);
    expect(upsertFn).toHaveBeenCalledTimes(1);
    expect(results[0]!.inserted).toBe(1);
  });

  it("falls back to REST when download returns empty and adapter provided", async () => {
    const restCandles: NewCandle[] = [
      makeCandle({ symbol: "BTCUSDT", exchange: "binance", timeframe: "1D" }),
    ];

    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const fetchRestFn = mock(
      (_adapter: ExchangeAdapter, _s: string, _tf: Timeframe, _since: number) =>
        Promise.resolve(restCandles),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(1),
    );

    const adapter = makeAdapter();

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1D"],
      adapter,
      downloadFn,
      fetchRestFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(fetchRestFn).toHaveBeenCalledTimes(1);
    expect(results[0]!.inserted).toBe(1);
  });

  it("does NOT call REST fallback when no adapter is provided", async () => {
    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) => {
        throw new Error("Download failed");
      },
    );
    const fetchRestFn = mock(
      (_adapter: ExchangeAdapter, _s: string, _tf: Timeframe, _since: number) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1H"],
      // no adapter
      downloadFn,
      fetchRestFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(fetchRestFn).not.toHaveBeenCalled();
  });

  it("continues with other symbols when one fails", async () => {
    let callCount = 0;
    const downloadFn = mock(
      (s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) => {
        callCount++;
        if (s === "BTCUSDT") {
          throw new Error("BTCUSDT download exploded");
        }
        return Promise.resolve([
          makeCandle({ symbol: s, exchange: "binance" }),
        ] as NewCandle[]);
      },
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(1),
    );

    const results = await syncCandles({
      symbols: [
        { symbol: "BTCUSDT", exchange: "binance" },
        { symbol: "ETHUSDT", exchange: "binance" },
      ],
      timeframes: ["1D"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    // Both symbols should have results
    expect(results).toHaveLength(2);

    // BTCUSDT should have an error
    const btcResult = results.find((r) => r.symbol === "BTCUSDT");
    expect(btcResult).toBeDefined();
    expect(btcResult!.errors.length).toBeGreaterThan(0);

    // ETHUSDT should succeed
    const ethResult = results.find((r) => r.symbol === "ETHUSDT");
    expect(ethResult).toBeDefined();
    expect(ethResult!.inserted).toBe(1);
    expect(ethResult!.errors).toHaveLength(0);
  });

  it("returns per-symbol/timeframe counts in SyncResult", async () => {
    const downloadFn = mock(
      (s: string, _e: Exchange, tf: Timeframe, _from: Date, _to: Date) => {
        const count = tf === "1D" ? 3 : 5;
        return Promise.resolve(
          Array.from({ length: count }, (_, i) =>
            makeCandle({
              symbol: s,
              timeframe: tf,
              open_time: new Date(Date.UTC(2024, 0, 1) + i * 60_000),
            }),
          ),
        );
      },
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, candles: NewCandle[]) =>
      Promise.resolve(candles.length),
    );

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1D", "1H"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(results).toHaveLength(2);

    const dayResult = results.find((r) => r.timeframe === "1D");
    expect(dayResult).toBeDefined();
    expect(dayResult!.inserted).toBe(3);
    expect(dayResult!.skipped).toBe(0);
    expect(dayResult!.errors).toHaveLength(0);

    const hourResult = results.find((r) => r.timeframe === "1H");
    expect(hourResult).toBeDefined();
    expect(hourResult!.inserted).toBe(5);
    expect(hourResult!.skipped).toBe(0);
  });

  it("defaults to all 4 timeframes when timeframes option is omitted", async () => {
    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      // timeframes omitted — should use all 4
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(results).toHaveLength(4);
    const tfs = results.map((r) => r.timeframe).sort();
    expect(tfs).toEqual(["1D", "1H", "1M", "5M"]);
  });

  it("records skipped count when upsert returns fewer than downloaded", async () => {
    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve(
          Array.from({ length: 10 }, (_, i) =>
            makeCandle({
              open_time: new Date(Date.UTC(2024, 0, 1) + i * 60_000),
            }),
          ),
        ),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    // upsert returns 7 (3 were skipped due to is_closed conflicts)
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(7),
    );

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1D"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(results[0]!.inserted).toBe(7);
    expect(results[0]!.skipped).toBe(3);
  });

  it("records REST fallback error in SyncResult.errors", async () => {
    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) => {
        throw new Error("Primary download failed");
      },
    );
    const fetchRestFn = mock(
      (_adapter: ExchangeAdapter, _s: string, _tf: Timeframe, _since: number) => {
        throw new Error("REST also failed");
      },
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(null),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    const adapter = makeAdapter();

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1D"],
      adapter,
      downloadFn,
      fetchRestFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    expect(results[0]!.errors.length).toBeGreaterThan(0);
    expect(results[0]!.errors[0]).toContain("REST also failed");
  });

  it("clamps `from` to retention start when subtracted 1 day goes before retention", async () => {
    // latest = exactly retention start + 12 hours (less than 1 day after)
    const retentionStart1M = SIX_MONTHS_AGO;
    const latestTime = new Date(retentionStart1M.getTime() + 12 * 60 * 60 * 1000);

    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve([] as NewCandle[]),
    );
    const getLatestFn = mock(
      (_db: DbInstance, _s: string, _e: string, _tf: string) =>
        Promise.resolve(latestTime),
    );
    const upsertFn = mock((_db: DbInstance, _candles: NewCandle[]) =>
      Promise.resolve(0),
    );

    await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1M"],
      downloadFn,
      getLatestFn,
      upsertFn,
      db: {} as DbInstance,
      now: FIXED_NOW,
    });

    const [, , , from] = downloadFn.mock.calls[0]!;
    // from should be clamped to retention start, not before it
    expect(from.getTime()).toBeGreaterThanOrEqual(retentionStart1M.getTime());
  });
});

// ---------------------------------------------------------------------------
// Integration tests (real PostgreSQL, skipIf)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("candle-sync integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // Pool은 프로세스 종료 시 자동 정리 (병렬 테스트 파일 간 충돌 방지)

  it("full sync flow: insert some candles, run sync, verify new candles added", async () => {
    const db = getDb();

    // Insert parent symbol
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

    // Pre-insert some candles for 1D (pretend they're from 5 days ago)
    const fiveDaysAgo = new Date(Date.UTC(2024, 6, 9, 0, 0, 0));
    const preExisting: NewCandle[] = [
      makeCandle({
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "1D",
        open_time: fiveDaysAgo,
      }),
    ];
    await bulkUpsertCandles(db, preExisting);

    // Verify pre-existing candle is there
    const latestBefore = await getLatestCandleTime(db, "BTCUSDT", "binance", "1D");
    expect(latestBefore).not.toBeNull();
    expect(latestBefore!.getTime()).toBe(fiveDaysAgo.getTime());

    // Create mock download that returns candles for the last few days
    const newCandles: NewCandle[] = [
      makeCandle({
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "1D",
        open_time: new Date(Date.UTC(2024, 6, 10, 0, 0, 0)),
      }),
      makeCandle({
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "1D",
        open_time: new Date(Date.UTC(2024, 6, 11, 0, 0, 0)),
      }),
      makeCandle({
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "1D",
        open_time: new Date(Date.UTC(2024, 6, 12, 0, 0, 0)),
      }),
    ];

    const downloadFn = mock(
      (_s: string, _e: Exchange, _tf: Timeframe, _from: Date, _to: Date) =>
        Promise.resolve(newCandles),
    );

    const results = await syncCandles({
      symbols: [{ symbol: "BTCUSDT", exchange: "binance" }],
      timeframes: ["1D"],
      downloadFn,
      db,
      now: new Date(Date.UTC(2024, 6, 15, 12, 0, 0)),
    });

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.symbol).toBe("BTCUSDT");
    expect(r.exchange).toBe("binance");
    expect(r.timeframe).toBe("1D");
    expect(r.inserted).toBeGreaterThan(0);
    expect(r.errors).toHaveLength(0);

    // Verify new candles are in DB
    const latestAfter = await getLatestCandleTime(db, "BTCUSDT", "binance", "1D");
    expect(latestAfter).not.toBeNull();
    expect(latestAfter!.getTime()).toBeGreaterThan(fiveDaysAgo.getTime());

    // Count total candles: should be original 1 + 3 new = 4
    const pool = getPool();
    const countResult = await pool`
      SELECT count(*)::int AS cnt FROM candles
      WHERE symbol = 'BTCUSDT' AND exchange = 'binance' AND timeframe = '1D'
    `;
    expect(countResult[0]!.cnt).toBe(4);
  });
});
