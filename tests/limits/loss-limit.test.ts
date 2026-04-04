import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import {
  checkLossLimit,
  type LossLimitConfig,
  type LossLimitResult,
  type SymbolLossState,
  type LossViolation,
} from "@/limits/loss-limit";

// ---------------------------------------------------------------------------
// Helper -- default config matching task spec defaults
// ---------------------------------------------------------------------------

function defaultConfig(overrides: Partial<LossLimitConfig> = {}): LossLimitConfig {
  return {
    maxDailyLossPct: d("0.10"),   // 10%
    maxSessionLosses: 3,
    maxHourly5m: 2,
    maxHourly1m: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper -- build a SymbolLossState with sensible defaults
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<SymbolLossState> = {}): SymbolLossState {
  return {
    lossesToday: d("0"),
    lossesSession: 0,
    lossesThisHour5m: 0,
    lossesThisHour1m: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// checkLossLimit -- no losses (all clear)
// ---------------------------------------------------------------------------

describe("loss-limit -- checkLossLimit no losses", () => {
  it("returns allowed=true and empty violations when no losses", () => {
    const state = makeState();
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- daily loss limit
// ---------------------------------------------------------------------------

describe("loss-limit -- checkLossLimit daily loss", () => {
  it("allows when daily loss is 9.9% (below 10% threshold)", () => {
    // balance=10000, max_daily_loss_pct=0.10 -> threshold=1000
    // losses_today=990 -> 9.9% -> allowed
    const state = makeState({ lossesToday: d("990") });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("blocks when daily loss reaches exactly 10%", () => {
    // losses_today=1000 -> 10% of 10000 -> blocked
    const state = makeState({ lossesToday: d("1000") });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });

  it("blocks when daily loss exceeds 10% (e.g. 15%)", () => {
    // losses_today=1500 -> 15% of 10000 -> blocked
    const state = makeState({ lossesToday: d("1500") });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- session loss limit
// ---------------------------------------------------------------------------

describe("loss-limit -- checkLossLimit session losses", () => {
  it("allows when session losses at 2 (below 3 threshold)", () => {
    const state = makeState({ lossesSession: 2 });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("blocks when session losses reach 3", () => {
    const state = makeState({ lossesSession: 3 });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("SESSION" as LossViolation);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- hourly 5M limit
// ---------------------------------------------------------------------------

describe("loss-limit -- checkLossLimit hourly 5M", () => {
  it("allows when 5M hourly losses at 1 (below 2 threshold)", () => {
    const state = makeState({ lossesThisHour5m: 1 });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("blocks when 5M hourly losses reach 2", () => {
    const state = makeState({ lossesThisHour5m: 2 });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("HOURLY_5M" as LossViolation);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- hourly 1M limit
// ---------------------------------------------------------------------------

describe("loss-limit -- checkLossLimit hourly 1M", () => {
  it("blocks when 1M hourly losses reach 1", () => {
    const state = makeState({ lossesThisHour1m: 1 });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("HOURLY_1M" as LossViolation);
  });

  it("allows when 1M hourly losses at 0", () => {
    const state = makeState({ lossesThisHour1m: 0 });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- multiple violations
// ---------------------------------------------------------------------------

describe("loss-limit -- checkLossLimit multiple violations", () => {
  it("reports all violations when multiple limits are breached simultaneously", () => {
    const state = makeState({
      lossesToday: d("1500"),   // 15% of 10000 -> DAILY
      lossesSession: 5,         // >= 3 -> SESSION
      lossesThisHour5m: 3,      // >= 2 -> HOURLY_5M
      lossesThisHour1m: 2,      // >= 1 -> HOURLY_1M
    });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(4);
    expect(result.violations).toContain("DAILY" as LossViolation);
    expect(result.violations).toContain("SESSION" as LossViolation);
    expect(result.violations).toContain("HOURLY_5M" as LossViolation);
    expect(result.violations).toContain("HOURLY_1M" as LossViolation);
  });

  it("reports only the specific violated limits", () => {
    // Only daily and hourly 1M violated
    const state = makeState({
      lossesToday: d("2000"),    // DAILY violated
      lossesSession: 1,          // SESSION ok
      lossesThisHour5m: 0,       // HOURLY_5M ok
      lossesThisHour1m: 1,       // HOURLY_1M violated
    });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations).toContain("DAILY" as LossViolation);
    expect(result.violations).toContain("HOURLY_1M" as LossViolation);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- Decimal.js precision
// ---------------------------------------------------------------------------

describe("loss-limit -- Decimal.js precision", () => {
  it("handles precise decimal comparison for daily loss threshold", () => {
    // balance=10000, 10% = 1000.00
    // losses_today = 999.999999 -> just below -> allowed
    const state = makeState({ lossesToday: d("999.999999") });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("blocks at exact threshold with Decimal precision", () => {
    // losses_today = 1000.000000 -> exactly 10% -> blocked
    const state = makeState({ lossesToday: d("1000.000000") });
    const balance = d("10000");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });

  it("works with non-round balance values", () => {
    // balance=12345.67, 10% = 1234.567
    // losses_today = 1234.567 -> exactly 10% -> blocked
    const state = makeState({ lossesToday: d("1234.567") });
    const balance = d("12345.67");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- custom config values
// ---------------------------------------------------------------------------

describe("loss-limit -- custom config values", () => {
  it("respects custom maxDailyLossPct", () => {
    // 5% daily limit instead of 10%
    const config = defaultConfig({ maxDailyLossPct: d("0.05") });
    const balance = d("10000");
    // 500 = 5% of 10000 -> blocked at 5%
    const state = makeState({ lossesToday: d("500") });

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });

  it("respects custom maxSessionLosses", () => {
    const config = defaultConfig({ maxSessionLosses: 5 });
    // 4 losses < 5 max -> allowed
    const state = makeState({ lossesSession: 4 });

    const result = checkLossLimit(state, d("10000"), config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("respects custom maxHourly5m", () => {
    const config = defaultConfig({ maxHourly5m: 4 });
    // 3 losses < 4 max -> allowed
    const state = makeState({ lossesThisHour5m: 3 });

    const result = checkLossLimit(state, d("10000"), config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("respects custom maxHourly1m", () => {
    const config = defaultConfig({ maxHourly1m: 3 });
    // 2 losses < 3 max -> allowed
    const state = makeState({ lossesThisHour1m: 2 });

    const result = checkLossLimit(state, d("10000"), config);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkLossLimit -- edge: zero balance
// ---------------------------------------------------------------------------

describe("loss-limit -- edge cases", () => {
  it("zero balance with zero losses triggers DAILY (fail-closed: 0 >= 0)", () => {
    // balance=0, threshold = 0 * 0.10 = 0, lossesToday=0 >= 0 => DAILY
    // This is correct fail-closed behavior: zero balance means zero threshold
    const state = makeState();
    const balance = d("0");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });

  it("zero balance with any positive daily loss is blocked", () => {
    // balance=0, threshold = 0 * 0.10 = 0
    // losses_today=0.01 >= 0 -> blocked
    const state = makeState({ lossesToday: d("0.01") });
    const balance = d("0");
    const config = defaultConfig();

    const result = checkLossLimit(state, balance, config);

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("DAILY" as LossViolation);
  });
});
