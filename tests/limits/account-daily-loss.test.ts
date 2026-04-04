/**
 * Tests for checkAccountDailyLimit() — account-level daily loss aggregation.
 *
 * Uses a lightweight DB mock to simulate Drizzle ORM query results without
 * requiring a live PostgreSQL connection.
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import {
  checkAccountDailyLimit,
  type AccountDailyLimitResult,
  type LossLimitConfig,
} from "@/limits/loss-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultConfig(overrides: Partial<LossLimitConfig> = {}): LossLimitConfig {
  return {
    maxDailyLossPct: d("0.10"), // 10%
    maxSessionLosses: 3,
    maxHourly5m: 2,
    maxHourly1m: 1,
    ...overrides,
  };
}

/**
 * Build a mock DbInstance that returns the given SUM string from
 * the SELECT query executed inside checkAccountDailyLimit().
 *
 * The mock intercepts the fluent Drizzle chain:
 *   db.select({ total: ... }).from(symbolStateTable)
 * and returns [{ total: sumValue }].
 */
function makeDb(sumValue: string) {
  return {
    select: () => ({
      from: () => Promise.resolve([{ total: sumValue }]),
    }),
  } as unknown as import("@/db/pool").DbInstance;
}

/**
 * Build a mock DbInstance that returns an empty array (no symbol_state rows).
 */
function makeEmptyDb() {
  return {
    select: () => ({
      from: () => Promise.resolve([]),
    }),
  } as unknown as import("@/db/pool").DbInstance;
}

// ---------------------------------------------------------------------------
// Scenario 1: SUM well below threshold → allowed
// ---------------------------------------------------------------------------

describe("account-daily-loss -- allowed when sum is below threshold", () => {
  it("3 symbols × 100 losses_today = 300, balance=10000, 10% → allowed (300 < 1000)", async () => {
    // SUM = 3 × 100 = 300 (3%); threshold = 10000 × 0.10 = 1000
    const db = makeDb("300");
    const balance = d("10000");
    const config = defaultConfig();

    const result: AccountDailyLimitResult = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.toString()).toBe("300");
    expect(result.threshold.toString()).toBe("1000");
  });

  it("single symbol, losses_today=0 → SUM=0, always allowed", async () => {
    const db = makeDb("0");
    const balance = d("10000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.isZero()).toBe(true);
  });

  it("losses just below threshold (999.999999) → allowed", async () => {
    // threshold = 10000 × 0.10 = 1000; SUM = 999.999999 < 1000
    const db = makeDb("999.999999");
    const balance = d("10000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.toString()).toBe("999.999999");
    expect(result.threshold.toString()).toBe("1000");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: SUM at or above threshold → blocked
// ---------------------------------------------------------------------------

describe("account-daily-loss -- blocked when sum meets or exceeds threshold", () => {
  it("3 symbols × 400 = 1200, balance=10000, 10% → blocked (1200 >= 1000)", async () => {
    const db = makeDb("1200");
    const balance = d("10000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.totalLossesToday.toString()).toBe("1200");
    expect(result.threshold.toString()).toBe("1000");
  });

  it("boundary value: SUM exactly equals threshold (500 >= 500) → blocked", async () => {
    // losses=500, balance=5000, 10% → threshold=500; 500 >= 500 → blocked
    const db = makeDb("500");
    const balance = d("5000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.totalLossesToday.toString()).toBe("500");
    expect(result.threshold.toString()).toBe("500");
  });

  it("just above threshold (1000.000001) → blocked", async () => {
    const db = makeDb("1000.000001");
    const balance = d("10000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: No rows in symbol_state → SUM = 0, allowed
// ---------------------------------------------------------------------------

describe("account-daily-loss -- empty symbol_state table", () => {
  it("returns SUM=0 and allowed=true when no rows exist", async () => {
    const db = makeEmptyDb();
    const balance = d("10000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.isZero()).toBe(true);
    expect(result.threshold.toString()).toBe("1000");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Decimal precision
// ---------------------------------------------------------------------------

describe("account-daily-loss -- Decimal.js precision", () => {
  it("handles a non-round balance (12345.67, 10% = 1234.567)", async () => {
    // SUM = 1234.567 → exactly at threshold → blocked
    const db = makeDb("1234.567");
    const balance = d("12345.67");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.totalLossesToday.toString()).toBe("1234.567");
    expect(result.threshold.toString()).toBe("1234.567");
  });

  it("handles high-precision SUM just below threshold", async () => {
    // balance=12345.67, threshold=1234.567
    // SUM=1234.566999999 → just below → allowed
    const db = makeDb("1234.566999999");
    const balance = d("12345.67");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
  });

  it("5 symbols with varied losses_today summed precisely", async () => {
    // losses: 123.45 + 67.89 + 234.56 + 89.10 + 45.00 = 560.00
    // balance=10000, threshold=1000 → 560 < 1000 → allowed
    const sum = d("123.45").plus("67.89").plus("234.56").plus("89.10").plus("45.00").toString();
    const db = makeDb(sum);
    const balance = d("10000");
    const config = defaultConfig();

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.toString()).toBe("560");
    expect(result.threshold.toString()).toBe("1000");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Custom maxDailyLossPct
// ---------------------------------------------------------------------------

describe("account-daily-loss -- custom maxDailyLossPct", () => {
  it("5% limit: SUM=500, balance=10000, 5% → threshold=500 → blocked (>= boundary)", async () => {
    const db = makeDb("500");
    const balance = d("10000");
    const config = defaultConfig({ maxDailyLossPct: d("0.05") });

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.threshold.toString()).toBe("500");
  });

  it("5% limit: SUM=499, balance=10000 → allowed", async () => {
    const db = makeDb("499");
    const balance = d("10000");
    const config = defaultConfig({ maxDailyLossPct: d("0.05") });

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Result shape
// ---------------------------------------------------------------------------

describe("account-daily-loss -- result shape", () => {
  it("returns AccountDailyLimitResult with allowed, totalLossesToday, threshold", async () => {
    const db = makeDb("250");
    const balance = d("5000");
    const config = defaultConfig(); // 10% → threshold=500

    const result = await checkAccountDailyLimit(db, balance, config);

    expect(typeof result.allowed).toBe("boolean");
    expect(result.totalLossesToday).toBeDefined();
    expect(result.threshold).toBeDefined();
    // 250 < 500 → allowed
    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.toString()).toBe("250");
    expect(result.threshold.toString()).toBe("500");
  });
});
