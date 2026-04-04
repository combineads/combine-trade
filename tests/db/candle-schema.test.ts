import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import { getTableName } from "drizzle-orm";
import { candleTable, symbolTable } from "../../src/db/schema";
import { getPool } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// candle-schema — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("candle-schema — structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(candleTable)).toBe("candles");
  });

  it("has all required columns", () => {
    const cols = Object.keys(candleTable);
    expect(cols).toContain("id");
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("timeframe");
    expect(cols).toContain("open_time");
    expect(cols).toContain("open");
    expect(cols).toContain("high");
    expect(cols).toContain("low");
    expect(cols).toContain("close");
    expect(cols).toContain("volume");
    expect(cols).toContain("is_closed");
    expect(cols).toContain("created_at");
  });

  it("price columns (open, high, low, close, volume) are PgNumeric type", () => {
    expect(candleTable.open.columnType).toBe("PgNumeric");
    expect(candleTable.high.columnType).toBe("PgNumeric");
    expect(candleTable.low.columnType).toBe("PgNumeric");
    expect(candleTable.close.columnType).toBe("PgNumeric");
    expect(candleTable.volume.columnType).toBe("PgNumeric");
  });

  it("id column is PgUUID type", () => {
    expect(candleTable.id.columnType).toBe("PgUUID");
  });

  it("is_closed default is false", () => {
    expect(candleTable.is_closed.default).toBe(false);
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof candleTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "symbol",
      "exchange",
      "timeframe",
      "open_time",
      "open",
      "high",
      "low",
      "close",
      "volume",
      "is_closed",
      "created_at",
    ];
    expect(keys).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// candle-schema — integration tests (real DB required)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("candle-schema — integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // Helper: insert a parent symbol row required by the FK constraint
  async function insertParentSymbol(
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
      VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
    `;
  }

  // Helper: build a valid candle insert payload
  function validCandle(overrides: Record<string, unknown> = {}) {
    return {
      symbol: "BTC/USDT" as string,
      exchange: "binance" as string,
      timeframe: "1H" as string,
      open_time: new Date("2025-01-01T00:00:00Z"),
      open: "100.00",
      high: "110.00",
      low: "90.00",
      close: "105.00",
      volume: "1000.00",
      ...overrides,
    };
  }

  it("migration creates candles table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'candles'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("candles");
  });

  it("INSERT valid candle succeeds", async () => {
    await insertParentSymbol();
    const pool = getPool();
    const c = validCandle();

    const result = await pool`
      INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
      VALUES (${c.symbol}, ${c.exchange}, ${c.timeframe}, ${c.open_time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})
      RETURNING id
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
  });

  it("INSERT duplicate (same symbol, exchange, timeframe, open_time) fails with unique constraint error", async () => {
    await insertParentSymbol();
    const pool = getPool();
    const c = validCandle();

    // First insert
    await pool`
      INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
      VALUES (${c.symbol}, ${c.exchange}, ${c.timeframe}, ${c.open_time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})
    `;

    // Duplicate insert
    try {
      await pool`
        INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
        VALUES (${c.symbol}, ${c.exchange}, ${c.timeframe}, ${c.open_time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unique|duplicate/i);
    }
  });

  it("INSERT with invalid timeframe ('15M') fails with check constraint error", async () => {
    await insertParentSymbol();
    const pool = getPool();
    const c = validCandle({ timeframe: "15M" });

    try {
      await pool`
        INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
        VALUES (${c.symbol}, ${c.exchange}, ${c.timeframe}, ${c.open_time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|candles_timeframe_check/i);
    }
  });

  it("INSERT with non-existent symbol/exchange fails with FK violation error", async () => {
    // Do NOT insert parent symbol
    const pool = getPool();
    const c = validCandle({ symbol: "FAKE/USDT", exchange: "noexchange" });

    try {
      await pool`
        INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
        VALUES (${c.symbol}, ${c.exchange}, ${c.timeframe}, ${c.open_time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  it("INSERT without is_closed defaults to false", async () => {
    await insertParentSymbol();
    const pool = getPool();
    const c = validCandle();

    const result = await pool`
      INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
      VALUES (${c.symbol}, ${c.exchange}, ${c.timeframe}, ${c.open_time}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})
      RETURNING is_closed
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.is_closed).toBe(false);
  });
});
