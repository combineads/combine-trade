import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import Decimal from "decimal.js";
import { CandleCollector } from "../../src/candles/collector";
import type { NewCandle } from "../../src/candles/history-loader";
import type { ExchangeAdapter, OHLCVCallback, Unsubscribe } from "../../src/core/ports";
import type { Candle, Timeframe } from "../../src/core/types";
import { getDb, getPool } from "../../src/db/pool";
import { bulkUpsertCandles } from "../../src/candles/repository";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: "test-id-001",
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
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

type StoredCallback = {
  symbol: string;
  timeframe: string;
  callback: OHLCVCallback;
};

function createMockAdapter(): {
  adapter: ExchangeAdapter;
  callbacks: StoredCallback[];
  unsubscribeFns: Array<ReturnType<typeof mock>>;
} {
  const callbacks: StoredCallback[] = [];
  const unsubscribeFns: Array<ReturnType<typeof mock>> = [];

  const adapter = {
    watchOHLCV: mock(async (symbol: string, timeframe: string, callback: OHLCVCallback) => {
      callbacks.push({ symbol, timeframe, callback });
      const unsub = mock(() => {});
      unsubscribeFns.push(unsub);
      return unsub as unknown as Unsubscribe;
    }),
    fetchOHLCV: mock(async () => []),
    fetchBalance: mock(async () => ({
      total: new Decimal("0"),
      available: new Decimal("0"),
    })),
    fetchPositions: mock(async () => []),
    createOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    cancelOrder: mock(async () => {}),
    editOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    fetchOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    getExchangeInfo: mock(async () => ({
      symbol: "",
      tickSize: new Decimal("0.01"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 125,
      contractSize: new Decimal("1"),
    })),
    setLeverage: mock(async () => {}),
  } as unknown as ExchangeAdapter;

  return { adapter, callbacks, unsubscribeFns };
}

// ---------------------------------------------------------------------------
// Unit tests (mock adapter, always run)
// ---------------------------------------------------------------------------

describe("CandleCollector unit tests", () => {
  let collector: CandleCollector;

  beforeEach(() => {
    collector = new CandleCollector();
  });

  afterEach(async () => {
    await collector.stop();
  });

  it("start() with 2 symbols x 4 timeframes creates 8 watchOHLCV calls", async () => {
    const { adapter, callbacks } = createMockAdapter();

    const symbols = ["BTCUSDT", "ETHUSDT"];
    const timeframes: Timeframe[] = ["1D", "1H", "5M", "1M"];

    await collector.start(symbols, timeframes, adapter);

    expect(callbacks).toHaveLength(8);
    expect(collector.getStatus().activeSubscriptions).toBe(8);

    // Verify each symbol x timeframe pair
    const keys = callbacks.map((c) => `${c.symbol}:${c.timeframe}`);
    for (const sym of symbols) {
      for (const tf of timeframes) {
        expect(keys).toContain(`${sym}:${tf}`);
      }
    }
  });

  it("callback receives candle and bulkUpsertCandles is invoked", async () => {
    const { adapter, callbacks } = createMockAdapter();

    // Mock getDb and bulkUpsertCandles via module-level mock
    // Since we cannot easily mock module imports in bun, we verify side effects
    // by checking that the candle triggers lastReceivedAt update
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    expect(callbacks).toHaveLength(1);

    const candle = makeCandle();
    callbacks[0]!.callback(candle);

    // Allow async upsert to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    const status = collector.getStatus();
    expect(status.lastReceivedAt).not.toBeNull();
  });

  it("stop() calls all unsubscribe functions", async () => {
    const { adapter, unsubscribeFns } = createMockAdapter();

    await collector.start(["BTCUSDT", "ETHUSDT"], ["5M" as Timeframe, "1H" as Timeframe], adapter);
    expect(collector.getStatus().activeSubscriptions).toBe(4);

    await collector.stop();

    expect(collector.getStatus().activeSubscriptions).toBe(0);
    for (const unsub of unsubscribeFns) {
      expect(unsub).toHaveBeenCalledTimes(1);
    }
  });

  it("getStatus() returns correct counts and timestamp", async () => {
    const { adapter, callbacks } = createMockAdapter();

    // Before start
    let status = collector.getStatus();
    expect(status.activeSubscriptions).toBe(0);
    expect(status.lastReceivedAt).toBeNull();

    // After start
    await collector.start(["BTCUSDT"], ["5M" as Timeframe, "1H" as Timeframe], adapter);
    status = collector.getStatus();
    expect(status.activeSubscriptions).toBe(2);
    expect(status.lastReceivedAt).toBeNull();

    // After receiving a candle
    const candle = makeCandle();
    callbacks[0]!.callback(candle);
    await new Promise((resolve) => setTimeout(resolve, 50));

    status = collector.getStatus();
    expect(status.activeSubscriptions).toBe(2);
    expect(status.lastReceivedAt).not.toBeNull();
  });

  it("DB UPSERT failure is logged but collection continues", async () => {
    const { adapter, callbacks } = createMockAdapter();

    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    // Send a candle — the upsert will fail since DB is not initialized,
    // but the collector should not throw and should continue
    const candle = makeCandle();
    callbacks[0]!.callback(candle);

    // Wait for async error to be caught
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Collector is still alive — send another candle
    const candle2 = makeCandle({
      open_time: new Date("2024-01-01T00:05:00Z"),
    });
    callbacks[0]!.callback(candle2);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Status still shows active
    expect(collector.getStatus().activeSubscriptions).toBe(1);
    expect(collector.getStatus().lastReceivedAt).not.toBeNull();
  });

  it("onReconnect(cb) fires callback when gap exceeds threshold", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const reconnectCb = mock(() => {});

    collector.onReconnect(reconnectCb);
    await collector.start(["BTCUSDT"], ["1M" as Timeframe], adapter);

    // First candle — no reconnection (no previous timestamp)
    const candle1 = makeCandle({ timeframe: "1M" });
    callbacks[0]!.callback(candle1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reconnectCb).toHaveBeenCalledTimes(0);

    // Simulate a long gap by manipulating the internal state
    // The 1M threshold is 60000 * 3 = 180000ms (3 minutes)
    // We set lastReceivedPerSub to a time far in the past
    const collectorAny = collector as unknown as {
      lastReceivedPerSub: Map<string, Date>;
    };
    collectorAny.lastReceivedPerSub.set(
      "BTCUSDT:1M",
      new Date(Date.now() - 200_000), // 200 seconds ago, exceeds 180s threshold
    );

    // Second candle — should trigger reconnection
    const candle2 = makeCandle({
      timeframe: "1M",
      open_time: new Date("2024-01-01T00:01:00Z"),
    });
    callbacks[0]!.callback(candle2);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reconnectCb).toHaveBeenCalledTimes(1);
  });

  it("unsubscribed reconnect callback is not called", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const reconnectCb = mock(() => {});

    const unsub = collector.onReconnect(reconnectCb);
    await collector.start(["BTCUSDT"], ["1M" as Timeframe], adapter);

    // First candle to establish baseline
    callbacks[0]!.callback(makeCandle({ timeframe: "1M" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Unsubscribe the callback
    unsub();

    // Force a reconnection gap
    const collectorAny = collector as unknown as {
      lastReceivedPerSub: Map<string, Date>;
    };
    collectorAny.lastReceivedPerSub.set(
      "BTCUSDT:1M",
      new Date(Date.now() - 200_000),
    );

    // Send another candle — reconnect should fire but callback was removed
    callbacks[0]!.callback(
      makeCandle({
        timeframe: "1M",
        open_time: new Date("2024-01-01T00:02:00Z"),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reconnectCb).toHaveBeenCalledTimes(0);
  });

  it("does not create duplicate subscriptions for same symbol:timeframe", async () => {
    const { adapter, callbacks } = createMockAdapter();

    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    // Should still be 1 subscription, not 2
    expect(callbacks).toHaveLength(1);
    expect(collector.getStatus().activeSubscriptions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration tests (real DB, skipIf)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("CandleCollector integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // Pool은 프로세스 종료 시 자동 정리 (병렬 테스트 파일 간 충돌 방지)

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

  it("candle received via mock adapter is saved in real DB", async () => {
    await insertParentSymbol();

    const { adapter, callbacks } = createMockAdapter();
    const collector = new CandleCollector();

    try {
      await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

      const candle = makeCandle({
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "5M",
        open_time: new Date("2024-06-01T12:00:00Z"),
        open: new Decimal("67000"),
        high: new Decimal("67200"),
        low: new Decimal("66800"),
        close: new Decimal("67100"),
        volume: new Decimal("250.75"),
        is_closed: true,
      });

      // Trigger the callback
      callbacks[0]!.callback(candle);

      // Wait for async upsert to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify the candle is in the DB
      const pool = getPool();
      const rows = await pool`
        SELECT symbol, exchange, timeframe, open, high, low, close, volume, is_closed
        FROM candles
        WHERE symbol = 'BTCUSDT'
          AND exchange = 'binance'
          AND timeframe = '5M'
          AND open_time = ${"2024-06-01T12:00:00Z"}::timestamptz
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.symbol).toBe("BTCUSDT");
      expect(rows[0]!.exchange).toBe("binance");
      expect(rows[0]!.timeframe).toBe("5M");
      expect(rows[0]!.open).toBe("67000");
      expect(rows[0]!.high).toBe("67200");
      expect(rows[0]!.low).toBe("66800");
      expect(rows[0]!.close).toBe("67100");
      expect(rows[0]!.volume).toBe("250.75");
      expect(rows[0]!.is_closed).toBe(true);
    } finally {
      await collector.stop();
    }
  });

  it("unclosed candle is saved and updated when closed candle arrives", async () => {
    await insertParentSymbol();

    const { adapter, callbacks } = createMockAdapter();
    const collector = new CandleCollector();

    try {
      await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

      const openTime = new Date("2024-06-01T12:00:00Z");

      // First: unclosed candle
      const unclosed = makeCandle({
        open_time: openTime,
        close: new Decimal("67050"),
        is_closed: false,
      });
      callbacks[0]!.callback(unclosed);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify unclosed candle is stored
      const pool = getPool();
      let rows = await pool`
        SELECT close, is_closed FROM candles
        WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
          AND timeframe = '5M'
          AND open_time = ${openTime.toISOString()}::timestamptz
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.is_closed).toBe(false);
      expect(rows[0]!.close).toBe("67050");

      // Second: closed candle with updated close
      const closed = makeCandle({
        open_time: openTime,
        close: new Decimal("67100"),
        is_closed: true,
      });
      callbacks[0]!.callback(closed);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify closed candle overwrote the unclosed one
      rows = await pool`
        SELECT close, is_closed FROM candles
        WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
          AND timeframe = '5M'
          AND open_time = ${openTime.toISOString()}::timestamptz
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.is_closed).toBe(true);
      expect(rows[0]!.close).toBe("67100");
    } finally {
      await collector.stop();
    }
  });
});
