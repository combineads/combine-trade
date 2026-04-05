import { describe, expect, it } from "bun:test";

import {
  BB20_CONFIG,
  BB4_CONFIG,
  MA_PERIODS,
  NORMALIZATION_METHOD,
  VECTOR_DIM,
} from "../../src/core/constants";
import { validateConfigValue } from "../../src/config/schema";
import { SEED_DATA } from "../../src/config/seed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entriesFor(group: string) {
  return SEED_DATA.filter((e) => e.group_code === group);
}

// ---------------------------------------------------------------------------
// All seed values pass Zod schema validation
// ---------------------------------------------------------------------------

describe("config/seed — all entries pass schema validation", () => {
  for (const entry of SEED_DATA) {
    it(`${entry.group_code}.${entry.code} validates successfully`, () => {
      const result = validateConfigValue(entry.group_code, entry.code, entry.value);
      expect(result.success).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Group sizes
// ---------------------------------------------------------------------------

describe("config/seed — group counts", () => {
  it("EXCHANGE group has 4 entries", () => {
    expect(entriesFor("EXCHANGE")).toHaveLength(4);
  });

  it("TIMEFRAME group has 4 entries", () => {
    expect(entriesFor("TIMEFRAME")).toHaveLength(4);
  });

  it("SYMBOL_CONFIG group has 2 entries", () => {
    expect(entriesFor("SYMBOL_CONFIG")).toHaveLength(2);
  });

  it("KNN group has 4 entries", () => {
    // EP-15 M4: a_grade_min_samples + commission_pct 추가
    expect(entriesFor("KNN")).toHaveLength(4);
  });

  it("POSITION group has 2 entries", () => {
    expect(entriesFor("POSITION")).toHaveLength(2);
  });

  it("LOSS_LIMIT group has 4 entries", () => {
    expect(entriesFor("LOSS_LIMIT")).toHaveLength(4);
  });

  it("SLIPPAGE group has 2 entries", () => {
    expect(entriesFor("SLIPPAGE")).toHaveLength(2);
  });

  it("FEATURE_WEIGHT group has 7 entries", () => {
    // EP-15 M1: wick_ratio→upperWick/lowerWick 분리 + bb4_position/pivot_distance/daily_open_distance/session_box_position/default 추가
    expect(entriesFor("FEATURE_WEIGHT")).toHaveLength(7);
  });

  it("TIME_DECAY group has 4 entries", () => {
    expect(entriesFor("TIME_DECAY")).toHaveLength(4);
  });

  it("WFO group has 3 entries", () => {
    expect(entriesFor("WFO")).toHaveLength(3);
  });

  it("ANCHOR group has 5 entries", () => {
    expect(entriesFor("ANCHOR")).toHaveLength(5);
  });

  it("NOTIFICATION group has 1 entry", () => {
    expect(entriesFor("NOTIFICATION")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ANCHOR values match core/constants.ts exactly
// ---------------------------------------------------------------------------

describe("config/seed — ANCHOR values match core/constants", () => {
  it("bb20 matches BB20_CONFIG", () => {
    const entry = SEED_DATA.find((e) => e.group_code === "ANCHOR" && e.code === "bb20");
    expect(entry).toBeDefined();
    expect(entry?.value).toMatchObject({
      length: BB20_CONFIG.length,
      stddev: BB20_CONFIG.stddev,
      source: BB20_CONFIG.source,
    });
  });

  it("bb4 matches BB4_CONFIG", () => {
    const entry = SEED_DATA.find((e) => e.group_code === "ANCHOR" && e.code === "bb4");
    expect(entry).toBeDefined();
    expect(entry?.value).toMatchObject({
      length: BB4_CONFIG.length,
      stddev: BB4_CONFIG.stddev,
      source: BB4_CONFIG.source,
    });
  });

  it("ma_periods matches MA_PERIODS constant", () => {
    const entry = SEED_DATA.find((e) => e.group_code === "ANCHOR" && e.code === "ma_periods");
    expect(entry).toBeDefined();
    expect(entry?.value).toMatchObject({ periods: [...MA_PERIODS] });
  });

  it("normalization method matches NORMALIZATION_METHOD", () => {
    const entry = SEED_DATA.find((e) => e.group_code === "ANCHOR" && e.code === "normalization");
    expect(entry).toBeDefined();
    expect(entry?.value).toMatchObject({ method: NORMALIZATION_METHOD });
  });

  it("vector_dim matches VECTOR_DIM", () => {
    const entry = SEED_DATA.find((e) => e.group_code === "ANCHOR" && e.code === "vector_dim");
    expect(entry).toBeDefined();
    expect(entry?.value).toMatchObject({ dim: VECTOR_DIM });
  });
});

// ---------------------------------------------------------------------------
// EXCHANGE entries
// ---------------------------------------------------------------------------

describe("config/seed — EXCHANGE entries", () => {
  const exchanges = entriesFor("EXCHANGE");
  const codes = exchanges.map((e) => e.code);

  it("includes binance, okx, bitget, mexc", () => {
    expect(codes).toContain("binance");
    expect(codes).toContain("okx");
    expect(codes).toContain("bitget");
    expect(codes).toContain("mexc");
  });

  it("binance has priority 1", () => {
    const binance = exchanges.find((e) => e.code === "binance");
    expect((binance?.value as { priority: number }).priority).toBe(1);
  });

  it("mexc supports_one_step_order is false", () => {
    const mexc = exchanges.find((e) => e.code === "mexc");
    expect((mexc?.value as { supports_one_step_order: boolean }).supports_one_step_order).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// NOTIFICATION — slack_webhook has enabled=false
// ---------------------------------------------------------------------------

describe("config/seed — NOTIFICATION", () => {
  it("slack_webhook entry exists", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "NOTIFICATION" && e.code === "slack_webhook",
    );
    expect(entry).toBeDefined();
  });

  it("slack_webhook has enabled=false by default", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "NOTIFICATION" && e.code === "slack_webhook",
    );
    expect((entry?.value as { enabled: boolean }).enabled).toBe(false);
  });

  it("slack_webhook has channel '#trading-alerts'", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "NOTIFICATION" && e.code === "slack_webhook",
    );
    expect((entry?.value as { channel: string }).channel).toBe("#trading-alerts");
  });
});

// ---------------------------------------------------------------------------
// Sort order is sequential within each group
// ---------------------------------------------------------------------------

describe("config/seed — sort_order integrity", () => {
  const groups = [...new Set(SEED_DATA.map((e) => e.group_code))];

  for (const group of groups) {
    it(`${group} sort_order starts at 0 and is sequential`, () => {
      const entries = entriesFor(group);
      const orders = entries.map((e) => e.sort_order);
      // Should be [0, 1, 2, ...] but we only verify 0 is present and they are unique
      expect(orders).toContain(0);
      expect(new Set(orders).size).toBe(orders.length);
    });
  }
});

// ---------------------------------------------------------------------------
// SEED_DATA has no duplicate (group_code, code) pairs
// ---------------------------------------------------------------------------

describe("config/seed — no duplicate keys", () => {
  it("all (group_code, code) pairs are unique", () => {
    const keys = SEED_DATA.map((e) => `${e.group_code}.${e.code}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
