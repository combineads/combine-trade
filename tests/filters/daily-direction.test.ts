import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import Decimal from "decimal.js";
import { determineDailyBias, updateDailyBias } from "@/filters/daily-direction";
import { getDb, getPool } from "@/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// daily-direction — pure function unit tests (no DB required)
// ---------------------------------------------------------------------------

describe("daily-direction — determineDailyBias", () => {
  it("returns LONG_ONLY when MA20 slope positive and close > open", () => {
    const todayClose = new Decimal("105");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("52");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("LONG_ONLY");
  });

  it("returns SHORT_ONLY when MA20 slope negative and close < open", () => {
    const todayClose = new Decimal("95");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("48");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("SHORT_ONLY");
  });

  it("returns NEUTRAL when MA20 slope positive but close < open (disagreement)", () => {
    const todayClose = new Decimal("95");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("52");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("NEUTRAL");
  });

  it("returns NEUTRAL when MA20 slope negative but close > open (disagreement)", () => {
    const todayClose = new Decimal("105");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("48");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("NEUTRAL");
  });

  it("returns NEUTRAL when MA20 slope is zero (no change)", () => {
    const todayClose = new Decimal("105");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("50");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("NEUTRAL");
  });

  it("returns NEUTRAL when MA20 slope is zero even if close < open", () => {
    const todayClose = new Decimal("95");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("50");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("NEUTRAL");
  });

  it("returns NEUTRAL when close equals open (no bullish/bearish bias)", () => {
    const todayClose = new Decimal("100");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("52");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("NEUTRAL");
  });

  it("uses Decimal comparison correctly for very small differences", () => {
    // slope: 50.000000001 - 50 = 0.000000001 (positive, but tiny)
    const todayClose = new Decimal("100.000000001");
    const dailyOpen = new Decimal("100");
    const ma20Today = new Decimal("50.000000001");
    const ma20Yesterday = new Decimal("50");

    const result = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);

    expect(result).toBe("LONG_ONLY");
  });
});

// ---------------------------------------------------------------------------
// daily-direction — DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("daily-direction — updateDailyBias integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function insertParentSymbol(
    symbol = "BTCUSDT",
    exchange = "binance",
  ): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
      VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
      ON CONFLICT DO NOTHING
    `;
  }

  async function insertSymbolState(
    symbol = "BTCUSDT",
    exchange = "binance",
  ): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol_state (symbol, exchange)
      VALUES (${symbol}, ${exchange})
      ON CONFLICT DO NOTHING
    `;
  }

  it("updateDailyBias updates daily_bias in symbol_state", async () => {
    await insertParentSymbol();
    await insertSymbolState();

    const db = getDb();
    const pool = getPool();

    await updateDailyBias(db, "BTCUSDT", "binance", "LONG_ONLY", new Decimal("50000"));

    const result = await pool`
      SELECT daily_bias FROM symbol_state
      WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.daily_bias).toBe("LONG_ONLY");
  });

  it("updateDailyBias updates daily_open in symbol_state", async () => {
    await insertParentSymbol();
    await insertSymbolState();

    const db = getDb();
    const pool = getPool();

    const dailyOpen = new Decimal("48234.56789");
    await updateDailyBias(db, "BTCUSDT", "binance", "SHORT_ONLY", dailyOpen);

    const result = await pool`
      SELECT daily_open FROM symbol_state
      WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.daily_open).toBe("48234.56789");
  });

  it("updateDailyBias updates both daily_bias and daily_open together", async () => {
    await insertParentSymbol();
    await insertSymbolState();

    const db = getDb();
    const pool = getPool();

    const dailyOpen = new Decimal("95000");
    await updateDailyBias(db, "BTCUSDT", "binance", "NEUTRAL", dailyOpen);

    const result = await pool`
      SELECT daily_bias, daily_open FROM symbol_state
      WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.daily_bias).toBe("NEUTRAL");
    expect(result[0]!.daily_open).toBe("95000");
  });

  it("updateDailyBias can overwrite existing daily_bias", async () => {
    await insertParentSymbol();
    await insertSymbolState();

    const db = getDb();
    const pool = getPool();

    // First update
    await updateDailyBias(db, "BTCUSDT", "binance", "LONG_ONLY", new Decimal("50000"));
    // Second update overwriting
    await updateDailyBias(db, "BTCUSDT", "binance", "SHORT_ONLY", new Decimal("51000"));

    const result = await pool`
      SELECT daily_bias, daily_open FROM symbol_state
      WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.daily_bias).toBe("SHORT_ONLY");
    expect(result[0]!.daily_open).toBe("51000");
  });

  it("updateDailyBias also updates updated_at timestamp", async () => {
    await insertParentSymbol();

    const pool = getPool();
    // Insert with a fixed updated_at in the past
    await pool`
      INSERT INTO symbol_state (symbol, exchange, updated_at)
      VALUES ('BTCUSDT', 'binance', '2020-01-01T00:00:00Z')
    `;

    const db = getDb();
    await updateDailyBias(db, "BTCUSDT", "binance", "LONG_ONLY", new Decimal("50000"));

    const result = await pool`
      SELECT updated_at FROM symbol_state
      WHERE symbol = 'BTCUSDT' AND exchange = 'binance'
    `;

    expect(result).toHaveLength(1);
    // updated_at should be more recent than 2020
    const updatedAt = new Date(result[0]!.updated_at as Date);
    expect(updatedAt.getFullYear()).toBeGreaterThan(2020);
  });
});
