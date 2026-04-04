import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import Decimal from "decimal.js";
import type { CandleGap } from "../../src/candles/gap-detection";
import { GapRecovery } from "../../src/candles/gap-recovery";
import type { NewCandle } from "../../src/candles/history-loader";
import { bulkUpsertCandles } from "../../src/candles/repository";
import type { ExchangeAdapter } from "../../src/core/ports";
import type { Candle } from "../../src/core/types";
import { getDb, getPool } from "../../src/db/pool";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const SYMBOL = "BTCUSDT";
const EXCHANGE = "binance";
const FIVE_MIN_MS = 300_000;

function makeNewCandle(openTime: Date, overrides: Partial<NewCandle> = {}): NewCandle {
  return {
    symbol: SYMBOL,
    exchange: EXCHANGE,
    timeframe: "5M",
    open_time: openTime,
    open: new Decimal("50000"),
    high: new Decimal("50100"),
    low: new Decimal("49900"),
    close: new Decimal("50050"),
    volume: new Decimal("100"),
    is_closed: true,
    ...overrides,
  };
}

function makeCandle(openTime: Date): Candle {
  return {
    id: crypto.randomUUID(),
    symbol: SYMBOL,
    exchange: EXCHANGE,
    timeframe: "5M",
    open_time: openTime,
    open: new Decimal("50000"),
    high: new Decimal("50100"),
    low: new Decimal("49900"),
    close: new Decimal("50050"),
    volume: new Decimal("100"),
    is_closed: true,
    created_at: new Date(),
  };
}

/** Minimal mock adapter with only fetchOHLCV implemented. */
function createMockAdapter(
  fetchFn: ExchangeAdapter["fetchOHLCV"] = async () => [],
): ExchangeAdapter {
  return {
    fetchOHLCV: fetchFn,
    fetchBalance: async () => ({ total: new Decimal(0), available: new Decimal(0) }),
    fetchPositions: async () => [],
    createOrder: async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    }),
    cancelOrder: async () => {},
    editOrder: async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    }),
    fetchOrder: async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    }),
    watchOHLCV: async () => () => {},
    getExchangeInfo: async () => ({
      symbol: SYMBOL,
      tickSize: new Decimal("0.01"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 125,
      contractSize: new Decimal("1"),
    }),
    setLeverage: async () => {},
    transfer: async () => ({ id: "mock-transfer-id", status: "ok" }),
  };
}

// ─── Unit tests (mock dependencies, no DB) ──────────────────────────────────

describe("GapRecovery unit tests", () => {
  it("recover() with no gaps returns gapsFound=0 and makes no API calls", async () => {
    const detectGapsFn = mock(async () => [] as CandleGap[]);
    const fetchCandlesFn = mock(async () => [] as NewCandle[]);
    const upsertFn = mock(async () => 0);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    const result = await recovery.recover(SYMBOL, EXCHANGE, "5M", adapter);

    expect(result.gapsFound).toBe(0);
    expect(result.candlesRecovered).toBe(0);
    expect(result.errors).toBe(0);
    expect(detectGapsFn).toHaveBeenCalledTimes(1);
    expect(fetchCandlesFn).toHaveBeenCalledTimes(0);
    expect(upsertFn).toHaveBeenCalledTimes(0);
  });

  it("recover() with 1 gap fetches candles and upserts them", async () => {
    const gapFrom = new Date("2024-01-01T00:15:00Z");
    const gapTo = new Date("2024-01-01T00:25:00Z");

    const gaps: CandleGap[] = [{ from: gapFrom, to: gapTo, expectedCount: 3 }];
    const fetchedCandles = [
      makeNewCandle(new Date("2024-01-01T00:15:00Z")),
      makeNewCandle(new Date("2024-01-01T00:20:00Z")),
      makeNewCandle(new Date("2024-01-01T00:25:00Z")),
    ];

    const detectGapsFn = mock(async () => gaps);
    const fetchCandlesFn = mock(async () => fetchedCandles);
    const upsertFn = mock(async () => 3);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    const result = await recovery.recover(SYMBOL, EXCHANGE, "5M", adapter);

    expect(result.gapsFound).toBe(1);
    expect(result.candlesRecovered).toBe(3);
    expect(result.errors).toBe(0);
    expect(fetchCandlesFn).toHaveBeenCalledTimes(1);
    // Verify fetchCandlesFn was called with correct limit (expectedCount + 10)
    const fetchCall = fetchCandlesFn.mock.calls[0] as unknown[] | undefined;
    expect(fetchCall?.[4]).toBe(13); // 3 + 10
    expect(upsertFn).toHaveBeenCalledTimes(1);
  });

  it("recover() with REST failure increments errors and continues", async () => {
    const gaps: CandleGap[] = [
      { from: new Date("2024-01-01T00:15:00Z"), to: new Date("2024-01-01T00:15:00Z"), expectedCount: 1 },
      { from: new Date("2024-01-01T00:30:00Z"), to: new Date("2024-01-01T00:30:00Z"), expectedCount: 1 },
    ];

    let callCount = 0;
    const fetchCandlesFn = mock(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("REST API error");
      }
      return [makeNewCandle(new Date("2024-01-01T00:30:00Z"))];
    });

    const detectGapsFn = mock(async () => gaps);
    const upsertFn = mock(async () => 1);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    const result = await recovery.recover(SYMBOL, EXCHANGE, "5M", adapter);

    expect(result.gapsFound).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.candlesRecovered).toBe(1);
    // Both gaps attempted
    expect(fetchCandlesFn).toHaveBeenCalledTimes(2);
    // Only the second gap succeeded, so upsert was called once
    expect(upsertFn).toHaveBeenCalledTimes(1);
  });

  it("recoverAll() with 2 symbols x 2 timeframes makes 4 recover() calls", async () => {
    const detectGapsFn = mock(async () => [] as CandleGap[]);
    const fetchCandlesFn = mock(async () => [] as NewCandle[]);
    const upsertFn = mock(async () => 0);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    const symbols = [
      { symbol: "BTCUSDT", exchange: "binance" },
      { symbol: "ETHUSDT", exchange: "binance" },
    ];
    const timeframes = ["5M", "1H"] as const;

    const results = await recovery.recoverAll(symbols, [...timeframes], adapter);

    expect(results).toHaveLength(4);
    // detectGaps should be called once per symbol/timeframe combination
    expect(detectGapsFn).toHaveBeenCalledTimes(4);
    // Each result should have gapsFound=0
    for (const r of results) {
      expect(r.gapsFound).toBe(0);
    }
  });

  it("rate limit: 2 gaps have a delay between them", async () => {
    const gaps: CandleGap[] = [
      { from: new Date("2024-01-01T00:15:00Z"), to: new Date("2024-01-01T00:15:00Z"), expectedCount: 1 },
      { from: new Date("2024-01-01T00:30:00Z"), to: new Date("2024-01-01T00:30:00Z"), expectedCount: 1 },
    ];

    const fetchTimestamps: number[] = [];

    const detectGapsFn = mock(async () => gaps);
    const fetchCandlesFn = mock(async () => {
      fetchTimestamps.push(Date.now());
      return [makeNewCandle(new Date())];
    });
    const upsertFn = mock(async () => 1);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    await recovery.recover(SYMBOL, EXCHANGE, "5M", adapter);

    expect(fetchTimestamps).toHaveLength(2);
    const elapsed = (fetchTimestamps[1] as number) - (fetchTimestamps[0] as number);
    // Should be at least ~450ms (allowing for timing variance)
    expect(elapsed).toBeGreaterThanOrEqual(450);
  });

  it("recover() skips upsert when fetch returns empty candles", async () => {
    const gaps: CandleGap[] = [
      { from: new Date("2024-01-01T00:15:00Z"), to: new Date("2024-01-01T00:15:00Z"), expectedCount: 1 },
    ];

    const detectGapsFn = mock(async () => gaps);
    const fetchCandlesFn = mock(async () => [] as NewCandle[]);
    const upsertFn = mock(async () => 0);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    const result = await recovery.recover(SYMBOL, EXCHANGE, "5M", adapter);

    expect(result.gapsFound).toBe(1);
    expect(result.candlesRecovered).toBe(0);
    expect(fetchCandlesFn).toHaveBeenCalledTimes(1);
    // upsert should not be called when no candles were fetched
    expect(upsertFn).toHaveBeenCalledTimes(0);
  });

  it("recoverAll() returns results with mixed outcomes", async () => {
    let callIdx = 0;
    const detectGapsFn = mock(async () => {
      callIdx++;
      if (callIdx === 1) {
        // First call: has gaps
        return [{ from: new Date(), to: new Date(), expectedCount: 2 }] as CandleGap[];
      }
      // Other calls: no gaps
      return [] as CandleGap[];
    });
    const fetchCandlesFn = mock(async () => [
      makeNewCandle(new Date()),
      makeNewCandle(new Date(Date.now() + FIVE_MIN_MS)),
    ]);
    const upsertFn = mock(async () => 2);

    const recovery = new GapRecovery(detectGapsFn, fetchCandlesFn, upsertFn);
    const adapter = createMockAdapter();

    const results = await recovery.recoverAll(
      [{ symbol: "BTCUSDT", exchange: "binance" }, { symbol: "ETHUSDT", exchange: "binance" }],
      ["5M"],
      adapter,
    );

    expect(results).toHaveLength(2);
    // First result had gaps
    expect(results[0]!.gapsFound).toBe(1);
    expect(results[0]!.candlesRecovered).toBe(2);
    // Second result had no gaps
    expect(results[1]!.gapsFound).toBe(0);
    expect(results[1]!.candlesRecovered).toBe(0);
  });
});

// ─── Integration tests (real DB, skipIf) ────────────────────────────────────

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("GapRecovery integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
    await insertTestSymbol();
  });

  // Pool cleanup is handled by process exit (no closeTestDb in afterAll)

  it("recovers a gap by filling missing candles in the DB", async () => {
    const db = getDb();
    const baseTime = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago

    // Insert candles: 0, 1, 2, [missing 3, 4], 5, 6
    const times = [0, 1, 2, 5, 6];
    const existingCandles = times.map((i) =>
      makeNewCandle(new Date(baseTime.getTime() + i * FIVE_MIN_MS)),
    );
    await bulkUpsertCandles(db, existingCandles);

    // The adapter will return candles for the gap
    const missingCandles: Candle[] = [
      makeCandle(new Date(baseTime.getTime() + 3 * FIVE_MIN_MS)),
      makeCandle(new Date(baseTime.getTime() + 4 * FIVE_MIN_MS)),
    ];

    const mockAdapter = createMockAdapter(async () => missingCandles);

    // Use real detectGaps and bulkUpsertCandles, only mock fetchCandlesViaREST
    const recovery = new GapRecovery(
      undefined, // real detectGaps
      async (_adapter, _symbol, _timeframe, _since, _limit) => {
        const result = await mockAdapter.fetchOHLCV(_symbol, _timeframe, _since, _limit);
        return result.map((c) => ({
          symbol: c.symbol,
          exchange: c.exchange,
          timeframe: c.timeframe,
          open_time: c.open_time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          is_closed: c.is_closed,
        }));
      },
      undefined, // real bulkUpsertCandles
    );

    const result = await recovery.recover(SYMBOL, EXCHANGE, "5M", mockAdapter);

    expect(result.gapsFound).toBeGreaterThanOrEqual(1);
    expect(result.candlesRecovered).toBeGreaterThanOrEqual(2);
    expect(result.errors).toBe(0);

    // Verify the gap is now filled in DB
    const pool = getPool();
    const t3 = new Date(baseTime.getTime() + 3 * FIVE_MIN_MS);
    const t4 = new Date(baseTime.getTime() + 4 * FIVE_MIN_MS);

    const rows = await pool`
      SELECT open_time FROM candles
      WHERE symbol = ${SYMBOL}
        AND exchange = ${EXCHANGE}
        AND timeframe = '5M'
        AND open_time IN (${t3.toISOString()}::timestamptz, ${t4.toISOString()}::timestamptz)
      ORDER BY open_time ASC
    `;

    expect(rows).toHaveLength(2);
  });

  it("recovered candles have correct OHLCV values", async () => {
    const db = getDb();
    const baseTime = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // Insert candles: 0, 1, [missing 2], 3
    const existing = [0, 1, 3].map((i) =>
      makeNewCandle(new Date(baseTime.getTime() + i * FIVE_MIN_MS)),
    );
    await bulkUpsertCandles(db, existing);

    const missingTime = new Date(baseTime.getTime() + 2 * FIVE_MIN_MS);
    const missingCandle: Candle = {
      ...makeCandle(missingTime),
      open: new Decimal("51000"),
      high: new Decimal("51500"),
      low: new Decimal("50500"),
      close: new Decimal("51200"),
      volume: new Decimal("999"),
    };

    const mockAdapter = createMockAdapter(async () => [missingCandle]);

    const recovery = new GapRecovery(
      undefined,
      async (_adapter, _symbol, _timeframe, _since, _limit) => {
        const result = await mockAdapter.fetchOHLCV(_symbol, _timeframe, _since, _limit);
        return result.map((c) => ({
          symbol: c.symbol,
          exchange: c.exchange,
          timeframe: c.timeframe,
          open_time: c.open_time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          is_closed: c.is_closed,
        }));
      },
      undefined,
    );

    await recovery.recover(SYMBOL, EXCHANGE, "5M", mockAdapter);

    const pool = getPool();
    const rows = await pool`
      SELECT open, high, low, close, volume FROM candles
      WHERE symbol = ${SYMBOL}
        AND exchange = ${EXCHANGE}
        AND timeframe = '5M'
        AND open_time = ${missingTime.toISOString()}::timestamptz
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.open).toBe("51000");
    expect(rows[0]!.high).toBe("51500");
    expect(rows[0]!.low).toBe("50500");
    expect(rows[0]!.close).toBe("51200");
    expect(rows[0]!.volume).toBe("999");
  });
});

// ─── Helper for integration tests ───────────────────────────────────────────

async function insertTestSymbol(): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${SYMBOL}, ${EXCHANGE}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;
}
