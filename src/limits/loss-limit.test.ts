/**
 * Loss Limit — checkLossLimit(), checkAccountDailyLimit(), resetAllExpired() unit tests
 *
 * T-18-005: balance 인자 수정 검증
 * T-18-006: resetAllExpired() 시간 경계 검증
 *
 * Test Scenarios:
 *   checkLossLimit:
 *     - balance=10000, losses_today=900  → allowed (900 < 1000)
 *     - balance=10000, losses_today=1000 → blocked  (1000 >= 1000)
 *   checkAccountDailyLimit:
 *     - sum(losses_today)=999,  balance=10000 → allowed (999 < 1000)
 *     - sum(losses_today)=1000, balance=10000 → blocked (1000 >= 1000)
 *   shouldResetDaily / shouldResetHourly / shouldResetSession:
 *     - 경계를 넘으면 true, 같은 구간이면 false
 *   resetAllExpired():
 *     - UTC 날짜 변경 시 dailyReset=true
 *     - UTC 시간 변경 시 hourlyReset=true
 *     - sessionStartTime 설정 시 sessionReset=true
 *     - 같은 시간대 → 리셋 없음
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { DbInstance } from "@/db/pool";
import {
  checkAccountDailyLimit,
  checkLossLimit,
  type LastResets,
  type LossLimitConfig,
  resetAllExpired,
  type SymbolLossState,
  shouldResetDaily,
  shouldResetHourly,
  shouldResetSession,
} from "@/limits/loss-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(maxDailyLossPct = "0.10"): LossLimitConfig {
  return {
    maxDailyLossPct: d(maxDailyLossPct),
    maxSessionLosses: 3,
    maxHourly5m: 2,
    maxHourly1m: 1,
  };
}

function makeLossState(lossesToday: string, opts?: Partial<SymbolLossState>): SymbolLossState {
  return {
    lossesToday: d(lossesToday),
    lossesSession: 0,
    lossesThisHour5m: 0,
    lossesThisHour1m: 0,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// checkLossLimit — per-symbol daily check with real balance
// ---------------------------------------------------------------------------

describe("checkLossLimit / daily — balance 기반 한도", () => {
  it("balance=10000, losses_today=900 → allowed (900 < 1000)", () => {
    const state = makeLossState("900");
    const config = makeConfig("0.10");
    const result = checkLossLimit(state, d("10000"), config);
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("balance=10000, losses_today=1000 → DAILY violation (1000 >= 1000)", () => {
    const state = makeLossState("1000");
    const config = makeConfig("0.10");
    const result = checkLossLimit(state, d("10000"), config);
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY");
  });

  it("balance=10000, losses_today=1001 → DAILY violation (exceeds threshold)", () => {
    const state = makeLossState("1001");
    const config = makeConfig("0.10");
    const result = checkLossLimit(state, d("10000"), config);
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY");
  });

  it("balance=10000, losses_today=999.99 → allowed (below threshold)", () => {
    const state = makeLossState("999.99");
    const config = makeConfig("0.10");
    const result = checkLossLimit(state, d("10000"), config);
    expect(result.allowed).toBe(true);
  });

  it("old bug repro: passing losses_today as balance → threshold becomes 90 not 1000", () => {
    // The old bug: balance arg = losses_today = 900
    // threshold = 900 * 0.10 = 90, so losses_today=900 >= 90 → BLOCKED (wrong)
    const state = makeLossState("900");
    const config = makeConfig("0.10");

    // Demonstrate the bug: wrong balance = losses_today
    const bugResult = checkLossLimit(state, d("900"), config);
    expect(bugResult.allowed).toBe(false); // Bug: incorrectly blocked

    // Correct: real balance = 10000
    const fixResult = checkLossLimit(state, d("10000"), config);
    expect(fixResult.allowed).toBe(true); // Fix: correctly allowed
  });
});

// ---------------------------------------------------------------------------
// checkAccountDailyLimit — account-level sum across all symbols
// ---------------------------------------------------------------------------

/**
 * Minimal DB stub that returns a fixed SUM(losses_today) for the test.
 */
function makeDbStub(totalLossesToday: string): DbInstance {
  return {
    select: () => ({
      from: () => Promise.resolve([{ total: totalLossesToday }]),
    }),
  } as unknown as DbInstance;
}

describe("checkAccountDailyLimit / 전 심볼 합산", () => {
  it("sum=999, balance=10000 → allowed (999 < 1000)", async () => {
    const db = makeDbStub("999");
    const result = await checkAccountDailyLimit(db, d("10000"), makeConfig("0.10"));
    expect(result.allowed).toBe(true);
    expect(result.totalLossesToday.toString()).toBe("999");
    expect(result.threshold.toString()).toBe("1000");
  });

  it("sum=1000, balance=10000 → blocked (1000 >= 1000)", async () => {
    const db = makeDbStub("1000");
    const result = await checkAccountDailyLimit(db, d("10000"), makeConfig("0.10"));
    expect(result.allowed).toBe(false);
    expect(result.totalLossesToday.toString()).toBe("1000");
    expect(result.threshold.toString()).toBe("1000");
  });

  it("sum=950+50=1000 (combined symbols) → blocked", async () => {
    // DB returns pre-aggregated sum = 1000
    const db = makeDbStub("1000");
    const result = await checkAccountDailyLimit(db, d("10000"), makeConfig("0.10"));
    expect(result.allowed).toBe(false);
  });

  it("sum=500+400=900 → allowed", async () => {
    const db = makeDbStub("900");
    const result = await checkAccountDailyLimit(db, d("10000"), makeConfig("0.10"));
    expect(result.allowed).toBe(true);
  });

  it("empty table (sum=0) → allowed (fail-open on no data)", async () => {
    const db = makeDbStub("0");
    const result = await checkAccountDailyLimit(db, d("10000"), makeConfig("0.10"));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-18-006: shouldResetDaily — UTC day boundary
// ---------------------------------------------------------------------------

describe("shouldResetDaily / UTC 날짜 경계", () => {
  it("같은 UTC 날 → false", () => {
    const last = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-15T23:59:59Z");
    expect(shouldResetDaily(now, last)).toBe(false);
  });

  it("UTC 00:00 경계 넘음 → true", () => {
    const last = new Date("2024-01-15T23:59:59Z");
    const now = new Date("2024-01-16T00:00:01Z");
    expect(shouldResetDaily(now, last)).toBe(true);
  });

  it("정확히 00:00:00 UTC → true (날짜가 다름)", () => {
    const last = new Date("2024-01-15T12:00:00Z");
    const now = new Date("2024-01-16T00:00:00Z");
    expect(shouldResetDaily(now, last)).toBe(true);
  });

  it("이틀 차이 → true", () => {
    const last = new Date("2024-01-10T00:00:00Z");
    const now = new Date("2024-01-12T00:00:00Z");
    expect(shouldResetDaily(now, last)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-18-006: shouldResetHourly — UTC hour boundary
// ---------------------------------------------------------------------------

describe("shouldResetHourly / UTC 시간 경계", () => {
  it("같은 UTC 시간대 → false", () => {
    const last = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-15T10:59:59Z");
    expect(shouldResetHourly(now, last)).toBe(false);
  });

  it("정시 경계 넘음 → true", () => {
    const last = new Date("2024-01-15T10:59:59Z");
    const now = new Date("2024-01-15T11:00:01Z");
    expect(shouldResetHourly(now, last)).toBe(true);
  });

  it("정확히 HH:00:00 → true (시간이 다름)", () => {
    const last = new Date("2024-01-15T10:30:00Z");
    const now = new Date("2024-01-15T11:00:00Z");
    expect(shouldResetHourly(now, last)).toBe(true);
  });

  it("날짜 변경 시 시간도 다름 → true", () => {
    const last = new Date("2024-01-15T23:30:00Z");
    const now = new Date("2024-01-16T00:00:01Z");
    expect(shouldResetHourly(now, last)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-18-006: shouldResetSession — session boundary
// ---------------------------------------------------------------------------

describe("shouldResetSession / 세션 시작 경계", () => {
  it("now >= sessionStartTime → true", () => {
    const sessionStart = new Date("2024-01-15T09:00:00Z");
    const now = new Date("2024-01-15T09:00:00Z");
    expect(shouldResetSession(now, sessionStart)).toBe(true);
  });

  it("now > sessionStartTime → true", () => {
    const sessionStart = new Date("2024-01-15T09:00:00Z");
    const now = new Date("2024-01-15T09:30:00Z");
    expect(shouldResetSession(now, sessionStart)).toBe(true);
  });

  it("now < sessionStartTime → false (세션 아직 시작 안 됨)", () => {
    const sessionStart = new Date("2024-01-15T10:00:00Z");
    const now = new Date("2024-01-15T09:00:00Z");
    expect(shouldResetSession(now, sessionStart)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-18-006: resetAllExpired — DB-level orchestration
// ---------------------------------------------------------------------------

/**
 * Builds a minimal DB stub that records UPDATE calls to symbol_state.
 * Tracks which columns were set to detect which reset was performed.
 */
function makeResetDbStub(): {
  db: DbInstance;
  updatedColumns: string[][];
} {
  const updatedColumns: string[][] = [];

  // Minimal chainable drizzle-style stub for .update().set().where()
  function makeWhereStub() {
    return Promise.resolve([]);
  }
  function makeSetStub(setObj: Record<string, unknown>) {
    updatedColumns.push(Object.keys(setObj));
    return { where: makeWhereStub };
  }
  function makeUpdateStub() {
    return { set: makeSetStub };
  }

  const db = { update: makeUpdateStub } as unknown as DbInstance;
  return { db, updatedColumns };
}

describe("resetAllExpired / 만료된 카운터 리셋", () => {
  it("UTC 날짜 변경 시 dailyReset=true, resetDailyLosses 호출", async () => {
    const { db, updatedColumns } = makeResetDbStub();
    const lastResets: LastResets = {
      lastDailyReset: new Date("2024-01-15T23:59:59Z"),
      lastHourlyReset: new Date("2024-01-16T00:00:00Z"), // same hour as now
    };
    const now = new Date("2024-01-16T00:01:00Z");

    const result = await resetAllExpired(db, "BTC/USDT", "binance", now, lastResets);

    expect(result.dailyReset).toBe(true);
    expect(result.hourlyReset).toBe(false);
    expect(result.sessionReset).toBe(false);
    // Verify losses_today was reset
    expect(updatedColumns.some((cols) => cols.includes("losses_today"))).toBe(true);
  });

  it("UTC 시간 변경 시 hourlyReset=true, resetHourlyLosses 호출", async () => {
    const { db, updatedColumns } = makeResetDbStub();
    const lastResets: LastResets = {
      lastDailyReset: new Date("2024-01-16T00:00:00Z"), // same day as now
      lastHourlyReset: new Date("2024-01-16T09:59:59Z"),
    };
    const now = new Date("2024-01-16T10:01:00Z");

    const result = await resetAllExpired(db, "BTC/USDT", "binance", now, lastResets);

    expect(result.dailyReset).toBe(false);
    expect(result.hourlyReset).toBe(true);
    expect(result.sessionReset).toBe(false);
    // Verify hourly counters were reset
    expect(
      updatedColumns.some(
        (cols) => cols.includes("losses_this_1h_5m") && cols.includes("losses_this_1h_1m"),
      ),
    ).toBe(true);
  });

  it("UTC 00:00 경계 — daily + hourly 동시 리셋", async () => {
    const { db, updatedColumns } = makeResetDbStub();
    const lastResets: LastResets = {
      lastDailyReset: new Date("2024-01-15T23:00:00Z"),
      lastHourlyReset: new Date("2024-01-15T23:30:00Z"),
    };
    const now = new Date("2024-01-16T00:01:00Z");

    const result = await resetAllExpired(db, "BTC/USDT", "binance", now, lastResets);

    expect(result.dailyReset).toBe(true);
    expect(result.hourlyReset).toBe(true);
    // Two separate UPDATE calls (daily + hourly are independent)
    expect(updatedColumns.length).toBeGreaterThanOrEqual(2);
  });

  it("같은 시간대 → 리셋 없음", async () => {
    const { db, updatedColumns } = makeResetDbStub();
    const lastResets: LastResets = {
      lastDailyReset: new Date("2024-01-16T09:00:00Z"),
      lastHourlyReset: new Date("2024-01-16T09:30:00Z"),
    };
    const now = new Date("2024-01-16T09:45:00Z");

    const result = await resetAllExpired(db, "BTC/USDT", "binance", now, lastResets);

    expect(result.dailyReset).toBe(false);
    expect(result.hourlyReset).toBe(false);
    expect(result.sessionReset).toBe(false);
    expect(updatedColumns.length).toBe(0);
  });

  it("sessionStartTime 설정 시 sessionReset=true", async () => {
    const { db, updatedColumns } = makeResetDbStub();
    const lastResets: LastResets = {
      lastDailyReset: new Date("2024-01-16T09:00:00Z"),
      lastHourlyReset: new Date("2024-01-16T09:00:00Z"),
      sessionStartTime: new Date("2024-01-16T09:00:00Z"), // session started at 09:00
    };
    const now = new Date("2024-01-16T09:30:00Z"); // now > sessionStartTime

    const result = await resetAllExpired(db, "BTC/USDT", "binance", now, lastResets);

    expect(result.sessionReset).toBe(true);
    // Verify losses_session was reset
    expect(updatedColumns.some((cols) => cols.includes("losses_session"))).toBe(true);
  });

  it("sessionStartTime 미설정 → sessionReset=false", async () => {
    const { db } = makeResetDbStub();
    const lastResets: LastResets = {
      lastDailyReset: new Date("2024-01-16T09:00:00Z"),
      lastHourlyReset: new Date("2024-01-16T09:00:00Z"),
      // sessionStartTime: undefined
    };
    const now = new Date("2024-01-16T09:30:00Z");

    const result = await resetAllExpired(db, "BTC/USDT", "binance", now, lastResets);

    expect(result.sessionReset).toBe(false);
  });
});
