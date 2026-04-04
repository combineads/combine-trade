import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { getPool } from "../../src/db/pool";
import {
  detectGaps,
  getTimeframeDurationMs,
} from "../../src/candles/gap-detection";
import {
  cleanupTables,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYMBOL = "BTCUSDT";
const EXCHANGE = "binance";
const FIVE_MIN_MS = 300_000;

/** Insert the parent symbol row required by the FK on candles. */
async function insertTestSymbol(): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${SYMBOL}, ${EXCHANGE}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;
}

/** Insert a single candle row for testing. */
async function insertCandle(
  openTime: Date,
  tf = "5M",
): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume, is_closed)
    VALUES (${SYMBOL}, ${EXCHANGE}, ${tf}, ${openTime.toISOString()}::timestamptz, '50000', '50100', '49900', '50050', '100', true)
  `;
}

// ─── Unit tests (no DB required) ─────────────────────────────────────────────

describe("getTimeframeDurationMs", () => {
  it("returns 86400000 for 1D", () => {
    expect(getTimeframeDurationMs("1D")).toBe(86_400_000);
  });

  it("returns 3600000 for 1H", () => {
    expect(getTimeframeDurationMs("1H")).toBe(3_600_000);
  });

  it("returns 300000 for 5M", () => {
    expect(getTimeframeDurationMs("5M")).toBe(300_000);
  });

  it("returns 60000 for 1M", () => {
    expect(getTimeframeDurationMs("1M")).toBe(60_000);
  });
});

// ─── Integration tests (real DB, skipIf) ─────────────────────────────────────

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("detectGaps integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
    await insertTestSymbol();
  });

  // Pool은 프로세스 종료 시 자동 정리 (병렬 테스트 파일 간 충돌 방지)

  it("returns empty array for continuous 5M data (12 candles, 1 hour)", async () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Insert 12 continuous 5M candles (00:00 through 00:55)
    for (let i = 0; i < 12; i++) {
      await insertCandle(new Date(baseTime.getTime() + i * FIVE_MIN_MS));
    }

    const gaps = await detectGaps(
      SYMBOL,
      EXCHANGE,
      "5M",
      baseTime,
      new Date(baseTime.getTime() + 11 * FIVE_MIN_MS),
    );

    expect(gaps).toHaveLength(0);
  });

  it("detects 1 gap when 1 candle is missing", async () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Insert candles at 00:00, 00:05, 00:10, [missing 00:15], 00:20, 00:25
    const times = [0, 1, 2, 4, 5];
    for (const i of times) {
      await insertCandle(new Date(baseTime.getTime() + i * FIVE_MIN_MS));
    }

    const gaps = await detectGaps(
      SYMBOL,
      EXCHANGE,
      "5M",
      baseTime,
      new Date(baseTime.getTime() + 5 * FIVE_MIN_MS),
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.expectedCount).toBe(1);
    // Gap from should be after 00:10, gap to should be before 00:20
    expect(gaps[0]!.from.getTime()).toBe(
      baseTime.getTime() + 3 * FIVE_MIN_MS, // 00:15
    );
    expect(gaps[0]!.to.getTime()).toBe(
      baseTime.getTime() + 3 * FIVE_MIN_MS, // 00:15
    );
  });

  it("detects 1 merged gap for 3 consecutive missing candles", async () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Insert candles at 00:00, 00:05, [missing 00:10, 00:15, 00:20], 00:25, 00:30
    const times = [0, 1, 5, 6];
    for (const i of times) {
      await insertCandle(new Date(baseTime.getTime() + i * FIVE_MIN_MS));
    }

    const gaps = await detectGaps(
      SYMBOL,
      EXCHANGE,
      "5M",
      baseTime,
      new Date(baseTime.getTime() + 6 * FIVE_MIN_MS),
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.expectedCount).toBe(3);
    // Gap from: 00:10 (after candle at 00:05 + 5min)
    expect(gaps[0]!.from.getTime()).toBe(
      baseTime.getTime() + 2 * FIVE_MIN_MS,
    );
    // Gap to: 00:20 (before candle at 00:25 - 5min)
    expect(gaps[0]!.to.getTime()).toBe(
      baseTime.getTime() + 4 * FIVE_MIN_MS,
    );
  });

  it("detects 2 separate gaps", async () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Insert candles at 00:00, 00:05, [missing 00:10], 00:15, 00:20, [missing 00:25], 00:30
    const times = [0, 1, 3, 4, 6];
    for (const i of times) {
      await insertCandle(new Date(baseTime.getTime() + i * FIVE_MIN_MS));
    }

    const gaps = await detectGaps(
      SYMBOL,
      EXCHANGE,
      "5M",
      baseTime,
      new Date(baseTime.getTime() + 6 * FIVE_MIN_MS),
    );

    expect(gaps).toHaveLength(2);
    expect(gaps[0]!.expectedCount).toBe(1);
    expect(gaps[1]!.expectedCount).toBe(1);
  });

  it("returns 1 gap covering entire range when DB is empty", async () => {
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date("2024-01-01T01:00:00Z");

    const gaps = await detectGaps(
      SYMBOL,
      EXCHANGE,
      "5M",
      from,
      to,
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.from.getTime()).toBe(from.getTime());
    expect(gaps[0]!.to.getTime()).toBe(to.getTime());
    // 1 hour / 5 min = 12 expected candles
    expect(gaps[0]!.expectedCount).toBe(12);
  });
});
