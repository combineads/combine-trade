import { describe, expect, it } from "bun:test";
import { Decimal } from "../../src/core/decimal";
import { getDailyProfit } from "../../src/transfer/scheduler";
import type { DbInstance } from "../../src/db/pool";

// ─── Mock DB builder ─────────────────────────────────────────────────────────

/**
 * Creates a minimal DbInstance mock that returns the given pnl rows.
 * pnlValues: string[] of pnl values for closed tickets today.
 */
function makeDb(pnlValues: string[]): DbInstance {
  const rows = pnlValues.map((v) => ({ pnl: v }));

  // Drizzle's select().from().where() chain — mock the final await
  const where = () => Promise.resolve(rows);
  const from = () => ({ where });
  const select = () => ({ from });

  return { select } as unknown as DbInstance;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getDailyProfit()", () => {
  it("sums 3 tickets with pnl +100, -30, +50 → returns 120", async () => {
    const db = makeDb(["100", "-30", "50"]);
    const result = await getDailyProfit(db, "binance");

    expect(result.equals(new Decimal("120"))).toBe(true);
  });

  it("returns 0 when no tickets today", async () => {
    const db = makeDb([]);
    const result = await getDailyProfit(db, "binance");

    expect(result.equals(new Decimal("0"))).toBe(true);
  });

  it("returns 0 for single ticket with null pnl (skips nulls)", async () => {
    // Tickets without pnl (not yet closed properly) should be ignored
    const rows = [{ pnl: null }];
    const where = () => Promise.resolve(rows);
    const from = () => ({ where });
    const select = () => ({ from });
    const db = { select } as unknown as DbInstance;

    const result = await getDailyProfit(db, "binance");

    expect(result.equals(new Decimal("0"))).toBe(true);
  });

  it("single positive ticket → returns that pnl", async () => {
    const db = makeDb(["75.50"]);
    const result = await getDailyProfit(db, "binance");

    expect(result.equals(new Decimal("75.50"))).toBe(true);
  });

  it("all negative tickets → returns negative sum", async () => {
    const db = makeDb(["-50", "-30"]);
    const result = await getDailyProfit(db, "binance");

    expect(result.equals(new Decimal("-80"))).toBe(true);
  });

  it("accepts optional date parameter (testability)", async () => {
    const db = makeDb(["100"]);
    const customDate = new Date("2026-04-05T00:00:00Z");

    // Should not throw when date is provided
    const result = await getDailyProfit(db, "binance", customDate);

    expect(result.equals(new Decimal("100"))).toBe(true);
  });
});
