import { describe, expect, it } from "bun:test";
import { FEATURE_CATEGORIES, FEATURE_NAMES, FEATURE_WEIGHTS, VECTOR_DIM } from "./features";

describe("features", () => {
  it("VECTOR_DIM equals 202", () => {
    expect(VECTOR_DIM).toBe(202);
  });

  it("FEATURE_NAMES length equals 202", () => {
    expect(FEATURE_NAMES.length).toBe(202);
  });

  it("FEATURE_NAMES has no duplicate names", () => {
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_NAMES.length);
  });

  it("FEATURE_NAMES all elements are non-empty strings", () => {
    expect(FEATURE_NAMES.every((name) => typeof name === "string" && name.length > 0)).toBe(true);
  });

  it("FEATURE_CATEGORIES flat values sum to 202", () => {
    const total = Object.values(FEATURE_CATEGORIES).flat().length;
    expect(total).toBe(202);
  });

  it("FEATURE_CATEGORIES contains all expected category keys", () => {
    const keys = Object.keys(FEATURE_CATEGORIES);
    expect(keys).toContain("price_position");
    expect(keys).toContain("momentum");
    expect(keys).toContain("volatility");
    expect(keys).toContain("trend");
    expect(keys).toContain("time_series");
    expect(keys).toContain("strategy");
  });

  it("FEATURE_CATEGORIES does not contain time_session", () => {
    const keys = Object.keys(FEATURE_CATEGORIES);
    expect(keys).not.toContain("time_session");
  });

  it("FEATURE_CATEGORIES feature names match FEATURE_NAMES", () => {
    const allFromCategories = Object.values(FEATURE_CATEGORIES).flat();
    const setFromNames = new Set(FEATURE_NAMES);
    const setFromCategories = new Set(allFromCategories);
    // Every category name must be in FEATURE_NAMES
    for (const name of allFromCategories) {
      expect(setFromNames.has(name)).toBe(true);
    }
    // Every FEATURE_NAMES entry must be in a category
    for (const name of FEATURE_NAMES) {
      expect(setFromCategories.has(name)).toBe(true);
    }
  });

  it("FEATURE_CATEGORIES strategy category has exactly 12 features", () => {
    expect(FEATURE_CATEGORIES.strategy?.length).toBe(12);
  });

  it("FEATURE_CATEGORIES strategy contains all expected strategy feature names", () => {
    const strategy = FEATURE_CATEGORIES.strategy ?? [];
    expect(strategy).toContain("bb20_position");
    expect(strategy).toContain("bb4_position");
    expect(strategy).toContain("ma_ordering");
    expect(strategy).toContain("ma20_slope");
    expect(strategy).toContain("atr_separation");
    expect(strategy).toContain("pivot_distance");
    expect(strategy).toContain("rsi_normalized");
    expect(strategy).toContain("rsi_extreme_count");
    expect(strategy).toContain("breakout_intensity");
    expect(strategy).toContain("disparity_divergence");
    expect(strategy).toContain("daily_open_distance");
    expect(strategy).toContain("session_box_position");
  });

  describe("FEATURE_WEIGHTS", () => {
    it("bb4_position has weight 2.0", () => {
      expect(FEATURE_WEIGHTS.bb4_position).toBe(2.0);
    });

    it("pivot_distance has weight 1.5", () => {
      expect(FEATURE_WEIGHTS.pivot_distance).toBe(1.5);
    });

    it("daily_open_distance has weight 1.5", () => {
      expect(FEATURE_WEIGHTS.daily_open_distance).toBe(1.5);
    });

    it("session_box_position has weight 1.5", () => {
      expect(FEATURE_WEIGHTS.session_box_position).toBe(1.5);
    });

    it("all FEATURE_WEIGHTS keys are valid FEATURE_NAMES", () => {
      const nameSet = new Set(FEATURE_NAMES);
      for (const key of Object.keys(FEATURE_WEIGHTS)) {
        expect(nameSet.has(key)).toBe(true);
      }
    });

    it("all FEATURE_WEIGHTS values are positive numbers", () => {
      for (const value of Object.values(FEATURE_WEIGHTS)) {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      }
    });
  });
});
