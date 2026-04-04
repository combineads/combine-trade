import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import {
  isInMarketOpenWindow,
  isInFundingWindow,
  matchesRecurrenceRule,
  isTradeBlocked,
  seedTradeBlocks,
  addOneTimeBlock,
} from "@/filters/trade-block";
import { getDb, getPool } from "@/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Helper: build a UTC Date from hours + minutes
// ---------------------------------------------------------------------------

function utcTime(hours: number, minutes: number = 0): Date {
  const d = new Date(0);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// trade-block — pure unit tests (no DB required)
// ---------------------------------------------------------------------------

describe("trade-block — isInMarketOpenWindow", () => {
  it("blocks inside the window (inclusive start)", () => {
    const rule = { utc_hour: 0, duration_min: 120 };
    expect(isInMarketOpenWindow(rule, utcTime(0, 0))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(1, 0))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(1, 59))).toBe(true);
  });

  it("does not block outside the window (exclusive end)", () => {
    const rule = { utc_hour: 0, duration_min: 120 };
    expect(isInMarketOpenWindow(rule, utcTime(2, 0))).toBe(false);
    expect(isInMarketOpenWindow(rule, utcTime(3, 0))).toBe(false);
  });

  it("handles fractional utc_hour (13.5 = 13:30)", () => {
    const rule = { utc_hour: 13.5, duration_min: 120 };
    expect(isInMarketOpenWindow(rule, utcTime(13, 30))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(14, 0))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(15, 29))).toBe(true);
    // exclusive end: 13:30 + 120 min = 15:30
    expect(isInMarketOpenWindow(rule, utcTime(15, 30))).toBe(false);
    expect(isInMarketOpenWindow(rule, utcTime(13, 29))).toBe(false);
  });

  it("handles fractional utc_hour (14.5 = 14:30)", () => {
    const rule = { utc_hour: 14.5, duration_min: 120 };
    expect(isInMarketOpenWindow(rule, utcTime(14, 30))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(16, 29))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(16, 30))).toBe(false);
  });

  it("blocks Europe open 07:00-09:00", () => {
    const rule = { utc_hour: 7, duration_min: 120 };
    expect(isInMarketOpenWindow(rule, utcTime(7, 0))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(8, 59))).toBe(true);
    expect(isInMarketOpenWindow(rule, utcTime(9, 0))).toBe(false);
  });
});

describe("trade-block — isInFundingWindow", () => {
  const fundingRule = { utc_hours: [0, 8, 16], duration_min: 30 };

  it("blocks at funding time 00:00 UTC (center)", () => {
    expect(isInFundingWindow(fundingRule, utcTime(0, 0))).toBe(true);
  });

  it("blocks 15 minutes before midnight (23:45 UTC) — funding ±15min at 00:00", () => {
    expect(isInFundingWindow(fundingRule, utcTime(23, 45))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(23, 50))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(23, 59))).toBe(true);
  });

  it("does not block after the funding window ends (00:15 UTC)", () => {
    // window is [-15min, +15min) → [23:45, 00:15)
    expect(isInFundingWindow(fundingRule, utcTime(0, 15))).toBe(false);
    expect(isInFundingWindow(fundingRule, utcTime(0, 20))).toBe(false);
  });

  it("blocks at 08:00 UTC (center) funding", () => {
    expect(isInFundingWindow(fundingRule, utcTime(8, 0))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(7, 46))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(8, 14))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(8, 15))).toBe(false);
    // 7:45 is the inclusive start of the window [7:45, 8:15)
    expect(isInFundingWindow(fundingRule, utcTime(7, 45))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(7, 44))).toBe(false);
  });

  it("blocks at 16:00 UTC funding", () => {
    expect(isInFundingWindow(fundingRule, utcTime(16, 0))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(15, 46))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(16, 14))).toBe(true);
    expect(isInFundingWindow(fundingRule, utcTime(16, 15))).toBe(false);
  });

  it("does not block in a gap between funding windows", () => {
    expect(isInFundingWindow(fundingRule, utcTime(3, 0))).toBe(false);
    expect(isInFundingWindow(fundingRule, utcTime(12, 0))).toBe(false);
  });
});

describe("trade-block — matchesRecurrenceRule", () => {
  it("delegates MARKET_OPEN block type to window check", () => {
    const rule = { utc_hour: 0, duration_min: 120 };
    expect(matchesRecurrenceRule("MARKET_OPEN", rule, utcTime(1, 0))).toBe(true);
    expect(matchesRecurrenceRule("MARKET_OPEN", rule, utcTime(3, 0))).toBe(false);
  });

  it("delegates FUNDING block type to funding check", () => {
    const rule = { utc_hours: [0, 8, 16], duration_min: 30 };
    expect(matchesRecurrenceRule("FUNDING", rule, utcTime(23, 50))).toBe(true);
    expect(matchesRecurrenceRule("FUNDING", rule, utcTime(0, 20))).toBe(false);
  });

  it("returns false for unknown block types", () => {
    const rule = { utc_hour: 0, duration_min: 60 };
    expect(matchesRecurrenceRule("ECONOMIC", rule, utcTime(0, 30))).toBe(false);
    expect(matchesRecurrenceRule("MANUAL", rule, utcTime(0, 30))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// trade-block — isTradeBlocked with mocked DB (unit)
// ---------------------------------------------------------------------------

describe("trade-block — isTradeBlocked (mocked DB)", () => {
  it("returns blocked=false when no rows match", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    } as unknown as Parameters<typeof isTradeBlocked>[0];

    const result = await isTradeBlocked(mockDb, utcTime(5, 0));
    expect(result).toEqual({ blocked: false });
  });

  it("returns blocked=true with reason on DB error (fail-closed)", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.reject(new Error("connection failed")),
        }),
      }),
    } as unknown as Parameters<typeof isTradeBlocked>[0];

    const result = await isTradeBlocked(mockDb, utcTime(5, 0));
    expect(result).toEqual({ blocked: true, reason: "DB error — fail-closed" });
  });
});

// ---------------------------------------------------------------------------
// trade-block — DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("trade-block — DB integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ── seedTradeBlocks ──────────────────────────────────────────────────────

  it("seedTradeBlocks inserts exactly 5 rows", async () => {
    const db = getDb();
    await seedTradeBlocks(db);

    const pool = getPool();
    const rows = await pool`SELECT COUNT(*) AS cnt FROM trade_block WHERE is_recurring = true`;
    expect(Number(rows[0]!.cnt)).toBe(5);
  });

  it("seedTradeBlocks is idempotent — running twice leaves 5 rows", async () => {
    const db = getDb();
    await seedTradeBlocks(db);
    await seedTradeBlocks(db);

    const pool = getPool();
    const rows = await pool`SELECT COUNT(*) AS cnt FROM trade_block WHERE is_recurring = true`;
    expect(Number(rows[0]!.cnt)).toBe(5);
  });

  // ── addOneTimeBlock ──────────────────────────────────────────────────────

  it("addOneTimeBlock inserts a one-time block row", async () => {
    const db = getDb();
    const start = new Date("2026-04-04T10:00:00Z");
    const end = new Date("2026-04-04T11:00:00Z");

    await addOneTimeBlock(db, {
      block_type: "ECONOMIC",
      start_time: start,
      end_time: end,
      reason: "NFP release",
    });

    const pool = getPool();
    const rows = await pool`SELECT * FROM trade_block WHERE is_recurring = false`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("NFP release");
    expect(rows[0]!.block_type).toBe("ECONOMIC");
  });

  // ── isTradeBlocked with seed data ────────────────────────────────────────

  it("isTradeBlocked returns blocked=true during 아시아장 open (01:00 UTC)", async () => {
    const db = getDb();
    await seedTradeBlocks(db);

    const now = utcTime(1, 0);
    const result = await isTradeBlocked(db, now);
    expect(result.blocked).toBe(true);
  });

  it("isTradeBlocked returns blocked=false after 아시아장 close (03:00 UTC)", async () => {
    const db = getDb();
    await seedTradeBlocks(db);

    const now = utcTime(3, 0);
    const result = await isTradeBlocked(db, now);
    expect(result.blocked).toBe(false);
  });

  it("isTradeBlocked returns blocked=true at 23:50 UTC (funding ±15min at 00:00)", async () => {
    const db = getDb();
    await seedTradeBlocks(db);

    const now = utcTime(23, 50);
    const result = await isTradeBlocked(db, now);
    expect(result.blocked).toBe(true);
  });

  it("isTradeBlocked returns blocked=true at 00:20 UTC (inside Asia open window, outside funding)", async () => {
    const db = getDb();
    await seedTradeBlocks(db);

    // 00:00 funding window: [23:45, 00:15) — 00:20 is outside funding.
    // But Asia open window is [00:00, 02:00) — 00:20 is still inside Asia open.
    // So with seed data loaded, 00:20 is still blocked by Asia open.
    const now = utcTime(0, 20);
    const result = await isTradeBlocked(db, now);
    expect(result.blocked).toBe(true);
  });

  it("isTradeBlocked returns blocked=false at 02:30 UTC (clear of all windows)", async () => {
    const db = getDb();
    await seedTradeBlocks(db);

    // 02:30 UTC: outside Asia open (00:00-02:00), outside funding (±15min at 0/8/16h)
    const now = utcTime(2, 30);
    const result = await isTradeBlocked(db, now);
    expect(result.blocked).toBe(false);
  });

  it("isTradeBlocked returns blocked=true for one-time ECONOMIC event", async () => {
    const db = getDb();
    const eventStart = new Date("2026-04-04T12:00:00Z");
    const eventEnd = new Date("2026-04-04T13:00:00Z");
    const now = new Date("2026-04-04T12:30:00Z");

    await addOneTimeBlock(db, {
      block_type: "ECONOMIC",
      start_time: eventStart,
      end_time: eventEnd,
      reason: "CPI release",
    });

    const result = await isTradeBlocked(db, now);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("CPI release");
  });

  it("isTradeBlocked returns blocked=false outside one-time ECONOMIC event window", async () => {
    const db = getDb();
    const eventStart = new Date("2026-04-04T12:00:00Z");
    const eventEnd = new Date("2026-04-04T13:00:00Z");
    const nowBefore = new Date("2026-04-04T11:59:59Z");
    const nowAfter = new Date("2026-04-04T13:00:01Z");

    await addOneTimeBlock(db, {
      block_type: "ECONOMIC",
      start_time: eventStart,
      end_time: eventEnd,
      reason: "CPI release",
    });

    const beforeResult = await isTradeBlocked(db, nowBefore);
    expect(beforeResult.blocked).toBe(false);

    const afterResult = await isTradeBlocked(db, nowAfter);
    expect(afterResult.blocked).toBe(false);
  });
});
