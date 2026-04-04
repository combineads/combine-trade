import { describe, expect, it } from "bun:test";

import { validateConfigValue } from "../../src/config/schema";
import { SEED_DATA } from "../../src/config/seed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entriesFor(group: string) {
  return SEED_DATA.filter((e) => e.group_code === group);
}

// ---------------------------------------------------------------------------
// TRANSFER — validateConfigValue
// ---------------------------------------------------------------------------

describe("transfer-config — validateConfigValue", () => {
  it("transfer_enabled: false → success", () => {
    const result = validateConfigValue("TRANSFER", "transfer_enabled", false);
    expect(result.success).toBe(true);
  });

  it("transfer_enabled: true → success", () => {
    const result = validateConfigValue("TRANSFER", "transfer_enabled", true);
    expect(result.success).toBe(true);
  });

  it("transfer_enabled: 'not_boolean' → failure", () => {
    const result = validateConfigValue("TRANSFER", "transfer_enabled", "not_boolean");
    expect(result.success).toBe(false);
  });

  it("transfer_schedule: 'daily' → success", () => {
    const result = validateConfigValue("TRANSFER", "transfer_schedule", "daily");
    expect(result.success).toBe(true);
  });

  it("transfer_time_utc: '00:30' → success", () => {
    const result = validateConfigValue("TRANSFER", "transfer_time_utc", "00:30");
    expect(result.success).toBe(true);
  });

  it("transfer_pct: 50 → success", () => {
    const result = validateConfigValue("TRANSFER", "transfer_pct", 50);
    expect(result.success).toBe(true);
  });

  it("min_transfer_usdt: '10' → success", () => {
    const result = validateConfigValue("TRANSFER", "min_transfer_usdt", "10");
    expect(result.success).toBe(true);
  });

  it("reserve_multiplier: 10 → success", () => {
    const result = validateConfigValue("TRANSFER", "reserve_multiplier", 10);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TRANSFER — SEED_DATA entries
// ---------------------------------------------------------------------------

describe("transfer-config — SEED_DATA", () => {
  it("TRANSFER group has 6 entries", () => {
    expect(entriesFor("TRANSFER")).toHaveLength(6);
  });

  it("includes transfer_enabled entry", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "transfer_enabled",
    );
    expect(entry).toBeDefined();
  });

  it("transfer_enabled defaults to false", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "transfer_enabled",
    );
    expect(entry?.value).toBe(false);
  });

  it("includes transfer_schedule entry with value 'daily'", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "transfer_schedule",
    );
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("daily");
  });

  it("includes transfer_time_utc entry with value '00:30'", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "transfer_time_utc",
    );
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("00:30");
  });

  it("includes transfer_pct entry with value 50", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "transfer_pct",
    );
    expect(entry).toBeDefined();
    expect(entry?.value).toBe(50);
  });

  it("includes min_transfer_usdt entry with value '10' (Decimal-compatible string)", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "min_transfer_usdt",
    );
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("10");
  });

  it("includes reserve_multiplier entry with value 10", () => {
    const entry = SEED_DATA.find(
      (e) => e.group_code === "TRANSFER" && e.code === "reserve_multiplier",
    );
    expect(entry).toBeDefined();
    expect(entry?.value).toBe(10);
  });

  it("all TRANSFER entries pass schema validation", () => {
    const entries = entriesFor("TRANSFER");
    for (const entry of entries) {
      const result = validateConfigValue(entry.group_code, entry.code, entry.value);
      expect(result.success).toBe(true);
    }
  });

  it("TRANSFER sort_order starts at 0 and is sequential within group", () => {
    const entries = entriesFor("TRANSFER");
    const orders = entries.map((e) => e.sort_order);
    expect(orders).toContain(0);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
