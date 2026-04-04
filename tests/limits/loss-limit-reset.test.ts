import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "@/db/pool";
import { symbolStateTable, symbolTable } from "@/db/schema";
import {
  type LastResets,
  type ResetResult,
  resetAllExpired,
  resetDailyLosses,
  resetHourlyLosses,
  resetSessionLosses,
  shouldResetDaily,
  shouldResetHourly,
  shouldResetSession,
} from "@/limits/loss-limit";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Pure function tests: shouldResetDaily
// ---------------------------------------------------------------------------

describe("loss-counter-reset -- shouldResetDaily", () => {
  it("returns false when now is same UTC day as lastReset (23:59)", () => {
    // lastReset: 2024-01-15 10:00 UTC, now: 2024-01-15 23:59 UTC
    const lastReset = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-15T23:59:59Z");

    expect(shouldResetDaily(now, lastReset)).toBe(false);
  });

  it("returns true when now crosses midnight into next UTC day (00:01)", () => {
    // lastReset: 2024-01-15 10:00 UTC, now: 2024-01-16 00:01 UTC
    const lastReset = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-16T00:01:00Z");

    expect(shouldResetDaily(now, lastReset)).toBe(true);
  });

  it("returns true at exactly midnight UTC", () => {
    // lastReset: 2024-01-15 23:00 UTC, now: 2024-01-16 00:00:00 UTC
    const lastReset = new Date("2024-01-15T23:00:00Z");
    const now = new Date("2024-01-16T00:00:00Z");

    expect(shouldResetDaily(now, lastReset)).toBe(true);
  });

  it("returns false when same day, different hour", () => {
    // lastReset: 2024-01-15 08:00 UTC, now: 2024-01-15 20:00 UTC
    const lastReset = new Date("2024-01-15T08:00:00Z");
    const now = new Date("2024-01-15T20:00:00Z");

    expect(shouldResetDaily(now, lastReset)).toBe(false);
  });

  it("returns true when multiple days have passed", () => {
    // lastReset: 2024-01-13 10:00 UTC, now: 2024-01-15 05:00 UTC
    const lastReset = new Date("2024-01-13T10:00:00Z");
    const now = new Date("2024-01-15T05:00:00Z");

    expect(shouldResetDaily(now, lastReset)).toBe(true);
  });

  it("returns false when now equals lastReset exactly", () => {
    const t = new Date("2024-01-15T12:00:00Z");
    expect(shouldResetDaily(t, t)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pure function tests: shouldResetSession
// ---------------------------------------------------------------------------

describe("loss-counter-reset -- shouldResetSession", () => {
  it("returns true when now is at or after sessionStartTime", () => {
    // sessionStart: 2024-01-15 09:30 UTC, now: 2024-01-15 09:30:00 UTC (exact)
    const sessionStart = new Date("2024-01-15T09:30:00Z");
    const now = new Date("2024-01-15T09:30:00Z");

    expect(shouldResetSession(now, sessionStart)).toBe(true);
  });

  it("returns true when now is after sessionStartTime", () => {
    const sessionStart = new Date("2024-01-15T09:30:00Z");
    const now = new Date("2024-01-15T09:35:00Z");

    expect(shouldResetSession(now, sessionStart)).toBe(true);
  });

  it("returns false when now is before sessionStartTime", () => {
    // sessionStart: 2024-01-15 09:30 UTC, now: 2024-01-15 09:29:59 UTC
    const sessionStart = new Date("2024-01-15T09:30:00Z");
    const now = new Date("2024-01-15T09:29:59Z");

    expect(shouldResetSession(now, sessionStart)).toBe(false);
  });

  it("returns false when sessionStartTime is far in the future", () => {
    const sessionStart = new Date("2024-01-16T09:30:00Z");
    const now = new Date("2024-01-15T15:00:00Z");

    expect(shouldResetSession(now, sessionStart)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pure function tests: shouldResetHourly
// ---------------------------------------------------------------------------

describe("loss-counter-reset -- shouldResetHourly", () => {
  it("returns false when now is same hour as lastReset (13:59)", () => {
    // lastReset: 2024-01-15 13:05 UTC, now: 2024-01-15 13:59 UTC
    const lastReset = new Date("2024-01-15T13:05:00Z");
    const now = new Date("2024-01-15T13:59:59Z");

    expect(shouldResetHourly(now, lastReset)).toBe(false);
  });

  it("returns true when now crosses hour boundary (14:01)", () => {
    // lastReset: 2024-01-15 13:05 UTC, now: 2024-01-15 14:01 UTC
    const lastReset = new Date("2024-01-15T13:05:00Z");
    const now = new Date("2024-01-15T14:01:00Z");

    expect(shouldResetHourly(now, lastReset)).toBe(true);
  });

  it("returns true at exactly the next hour boundary", () => {
    // lastReset: 2024-01-15 13:30 UTC, now: 2024-01-15 14:00:00 UTC
    const lastReset = new Date("2024-01-15T13:30:00Z");
    const now = new Date("2024-01-15T14:00:00Z");

    expect(shouldResetHourly(now, lastReset)).toBe(true);
  });

  it("returns false within the same hour", () => {
    // lastReset: 2024-01-15 14:10 UTC, now: 2024-01-15 14:50 UTC
    const lastReset = new Date("2024-01-15T14:10:00Z");
    const now = new Date("2024-01-15T14:50:00Z");

    expect(shouldResetHourly(now, lastReset)).toBe(false);
  });

  it("returns true when multiple hours have passed", () => {
    // lastReset: 2024-01-15 10:00 UTC, now: 2024-01-15 13:00 UTC
    const lastReset = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-15T13:00:00Z");

    expect(shouldResetHourly(now, lastReset)).toBe(true);
  });

  it("returns false when now equals lastReset exactly", () => {
    const t = new Date("2024-01-15T14:00:00Z");
    expect(shouldResetHourly(t, t)).toBe(false);
  });

  it("returns true across day boundary (23:30 -> 00:05 next day)", () => {
    const lastReset = new Date("2024-01-15T23:30:00Z");
    const now = new Date("2024-01-16T00:05:00Z");

    expect(shouldResetHourly(now, lastReset)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DB function tests (require real PostgreSQL)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("loss-counter-reset -- DB reset functions", () => {
  const TEST_SYMBOL = "BTC/USDT:USDT";
  const TEST_EXCHANGE = "binance";

  let db: NodePgDatabase;

  beforeAll(async () => {
    await initTestDb();
    db = getDb() as unknown as NodePgDatabase;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  /** Seed symbol + symbol_state rows for tests. */
  async function seedTestState(overrides: {
    losses_today?: string;
    losses_session?: number;
    losses_this_1h_5m?: number;
    losses_this_1h_1m?: number;
  } = {}): Promise<void> {
    await db.insert(symbolTable).values({
      symbol: TEST_SYMBOL,
      exchange: TEST_EXCHANGE,
      name: "Bitcoin Perpetual",
      base_asset: "BTC",
      quote_asset: "USDT",
    });
    await db.insert(symbolStateTable).values({
      symbol: TEST_SYMBOL,
      exchange: TEST_EXCHANGE,
      losses_today: overrides.losses_today ?? "150.50",
      losses_session: overrides.losses_session ?? 3,
      losses_this_1h_5m: overrides.losses_this_1h_5m ?? 2,
      losses_this_1h_1m: overrides.losses_this_1h_1m ?? 1,
    });
  }

  /** Read current symbol_state row. */
  async function readState() {
    const rows = await db
      .select()
      .from(symbolStateTable)
      .where(
        and(
          eq(symbolStateTable.symbol, TEST_SYMBOL),
          eq(symbolStateTable.exchange, TEST_EXCHANGE),
        ),
      );
    return rows[0];
  }

  // -------------------------------------------------------------------------
  // resetDailyLosses
  // -------------------------------------------------------------------------

  describe("resetDailyLosses", () => {
    it("sets losses_today to '0'", async () => {
      await seedTestState({ losses_today: "500.25" });

      await resetDailyLosses(db, TEST_SYMBOL, TEST_EXCHANGE);

      const state = await readState();
      expect(state?.losses_today).toBe("0");
    });

    it("preserves other counters when resetting daily", async () => {
      await seedTestState({
        losses_today: "100",
        losses_session: 2,
        losses_this_1h_5m: 1,
        losses_this_1h_1m: 1,
      });

      await resetDailyLosses(db, TEST_SYMBOL, TEST_EXCHANGE);

      const state = await readState();
      expect(state?.losses_today).toBe("0");
      expect(state?.losses_session).toBe(2);
      expect(state?.losses_this_1h_5m).toBe(1);
      expect(state?.losses_this_1h_1m).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // resetSessionLosses
  // -------------------------------------------------------------------------

  describe("resetSessionLosses", () => {
    it("sets losses_session to 0", async () => {
      await seedTestState({ losses_session: 5 });

      await resetSessionLosses(db, TEST_SYMBOL, TEST_EXCHANGE);

      const state = await readState();
      expect(state?.losses_session).toBe(0);
    });

    it("preserves other counters when resetting session", async () => {
      await seedTestState({
        losses_today: "200",
        losses_session: 4,
        losses_this_1h_5m: 2,
        losses_this_1h_1m: 1,
      });

      await resetSessionLosses(db, TEST_SYMBOL, TEST_EXCHANGE);

      const state = await readState();
      expect(state?.losses_today).toBe("200");
      expect(state?.losses_session).toBe(0);
      expect(state?.losses_this_1h_5m).toBe(2);
      expect(state?.losses_this_1h_1m).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // resetHourlyLosses
  // -------------------------------------------------------------------------

  describe("resetHourlyLosses", () => {
    it("sets losses_this_1h_5m and losses_this_1h_1m to 0", async () => {
      await seedTestState({
        losses_this_1h_5m: 3,
        losses_this_1h_1m: 2,
      });

      await resetHourlyLosses(db, TEST_SYMBOL, TEST_EXCHANGE);

      const state = await readState();
      expect(state?.losses_this_1h_5m).toBe(0);
      expect(state?.losses_this_1h_1m).toBe(0);
    });

    it("preserves other counters when resetting hourly", async () => {
      await seedTestState({
        losses_today: "300",
        losses_session: 2,
        losses_this_1h_5m: 2,
        losses_this_1h_1m: 1,
      });

      await resetHourlyLosses(db, TEST_SYMBOL, TEST_EXCHANGE);

      const state = await readState();
      expect(state?.losses_today).toBe("300");
      expect(state?.losses_session).toBe(2);
      expect(state?.losses_this_1h_5m).toBe(0);
      expect(state?.losses_this_1h_1m).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // resetAllExpired -- orchestrator
  // -------------------------------------------------------------------------

  describe("resetAllExpired", () => {
    it("resets daily + hourly at midnight (simultaneous triggers)", async () => {
      await seedTestState({
        losses_today: "500",
        losses_session: 2,
        losses_this_1h_5m: 2,
        losses_this_1h_1m: 1,
      });

      // lastResets were at 23:30 on previous day
      // now is 00:05 on the next day -> daily + hourly triggers
      const lastResets: LastResets = {
        lastDailyReset: new Date("2024-01-15T23:30:00Z"),
        lastHourlyReset: new Date("2024-01-15T23:30:00Z"),
      };
      const now = new Date("2024-01-16T00:05:00Z");

      const result = await resetAllExpired(
        db,
        TEST_SYMBOL,
        TEST_EXCHANGE,
        now,
        lastResets,
      );

      expect(result.dailyReset).toBe(true);
      expect(result.sessionReset).toBe(false);
      expect(result.hourlyReset).toBe(true);

      const state = await readState();
      expect(state?.losses_today).toBe("0");
      expect(state?.losses_session).toBe(2); // unchanged
      expect(state?.losses_this_1h_5m).toBe(0);
      expect(state?.losses_this_1h_1m).toBe(0);
    });

    it("resets session + hourly at session start + hour boundary", async () => {
      await seedTestState({
        losses_today: "100",
        losses_session: 3,
        losses_this_1h_5m: 2,
        losses_this_1h_1m: 1,
      });

      const lastResets: LastResets = {
        lastDailyReset: new Date("2024-01-15T00:00:00Z"), // same day
        lastHourlyReset: new Date("2024-01-15T13:30:00Z"),
        sessionStartTime: new Date("2024-01-15T14:00:00Z"),
      };
      const now = new Date("2024-01-15T14:05:00Z");

      const result = await resetAllExpired(
        db,
        TEST_SYMBOL,
        TEST_EXCHANGE,
        now,
        lastResets,
      );

      expect(result.dailyReset).toBe(false);
      expect(result.sessionReset).toBe(true);
      expect(result.hourlyReset).toBe(true);

      const state = await readState();
      expect(state?.losses_today).toBe("100"); // unchanged
      expect(state?.losses_session).toBe(0);
      expect(state?.losses_this_1h_5m).toBe(0);
      expect(state?.losses_this_1h_1m).toBe(0);
    });

    it("returns no resets when mid-period (no boundaries crossed)", async () => {
      await seedTestState({
        losses_today: "100",
        losses_session: 2,
        losses_this_1h_5m: 1,
        losses_this_1h_1m: 1,
      });

      // Same day, same hour, no session start
      const lastResets: LastResets = {
        lastDailyReset: new Date("2024-01-15T00:00:00Z"),
        lastHourlyReset: new Date("2024-01-15T14:05:00Z"),
      };
      const now = new Date("2024-01-15T14:30:00Z");

      const result = await resetAllExpired(
        db,
        TEST_SYMBOL,
        TEST_EXCHANGE,
        now,
        lastResets,
      );

      expect(result.dailyReset).toBe(false);
      expect(result.sessionReset).toBe(false);
      expect(result.hourlyReset).toBe(false);

      // All counters preserved
      const state = await readState();
      expect(state?.losses_today).toBe("100");
      expect(state?.losses_session).toBe(2);
      expect(state?.losses_this_1h_5m).toBe(1);
      expect(state?.losses_this_1h_1m).toBe(1);
    });

    it("resets all three at midnight + session start", async () => {
      await seedTestState({
        losses_today: "500",
        losses_session: 5,
        losses_this_1h_5m: 2,
        losses_this_1h_1m: 1,
      });

      const lastResets: LastResets = {
        lastDailyReset: new Date("2024-01-14T23:30:00Z"),
        lastHourlyReset: new Date("2024-01-14T23:30:00Z"),
        sessionStartTime: new Date("2024-01-15T00:00:00Z"),
      };
      const now = new Date("2024-01-15T00:05:00Z");

      const result = await resetAllExpired(
        db,
        TEST_SYMBOL,
        TEST_EXCHANGE,
        now,
        lastResets,
      );

      expect(result.dailyReset).toBe(true);
      expect(result.sessionReset).toBe(true);
      expect(result.hourlyReset).toBe(true);

      const state = await readState();
      expect(state?.losses_today).toBe("0");
      expect(state?.losses_session).toBe(0);
      expect(state?.losses_this_1h_5m).toBe(0);
      expect(state?.losses_this_1h_1m).toBe(0);
    });

    it("does not reset session when sessionStartTime is undefined", async () => {
      await seedTestState({ losses_session: 3 });

      const lastResets: LastResets = {
        lastDailyReset: new Date("2024-01-15T00:00:00Z"),
        lastHourlyReset: new Date("2024-01-15T14:00:00Z"),
        // sessionStartTime intentionally omitted
      };
      const now = new Date("2024-01-15T14:30:00Z");

      const result = await resetAllExpired(
        db,
        TEST_SYMBOL,
        TEST_EXCHANGE,
        now,
        lastResets,
      );

      expect(result.sessionReset).toBe(false);

      const state = await readState();
      expect(state?.losses_session).toBe(3); // unchanged
    });
  });
});
