import { describe, expect, it } from "bun:test";
import { FEATURE_CATEGORIES, FEATURE_NAMES, VECTOR_DIM } from "./features";

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
    expect(keys).toContain("time_session");
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
});
