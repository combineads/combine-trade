import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import { detectSqueeze } from "../../src/indicators/squeeze";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Decimal[] from a plain number[]. */
function bws(values: number[]) {
  return values.map((v) => d(v.toString()));
}

// ---------------------------------------------------------------------------
// indicators/squeeze
// ---------------------------------------------------------------------------

describe("indicators/squeeze", () => {
  it("returns 'normal' for empty array", () => {
    expect(detectSqueeze([])).toBe("normal");
  });

  it("returns 'normal' for single value", () => {
    expect(detectSqueeze(bws([0.05]))).toBe("normal");
  });

  it("returns 'normal' for stable (all-same) bandwidths", () => {
    // avg === current, well within [50%, 150%] band
    const stable = bws([0.05, 0.05, 0.05, 0.05, 0.05]);
    expect(detectSqueeze(stable)).toBe("normal");
  });

  it("returns 'squeeze' when current bandwidth is well below 50% of average", () => {
    // Previous 4 values average to 0.10; current is 0.04 (<50% of 0.10)
    const squeezing = bws([0.10, 0.10, 0.10, 0.10, 0.04]);
    expect(detectSqueeze(squeezing)).toBe("squeeze");
  });

  it("returns 'squeeze' for steadily decreasing bandwidths", () => {
    // Values decrease; final is far below the lookback average
    const decreasing = bws([0.20, 0.18, 0.16, 0.14, 0.12, 0.10, 0.08, 0.04]);
    expect(detectSqueeze(decreasing)).toBe("squeeze");
  });

  it("returns 'expansion' when current bandwidth is well above 150% of average", () => {
    // Previous 4 values average to 0.10; current is 0.20 (>150% of 0.10)
    const expanding = bws([0.10, 0.10, 0.10, 0.10, 0.20]);
    expect(detectSqueeze(expanding)).toBe("expansion");
  });

  it("returns 'expansion' when last value is much larger than all preceding", () => {
    const explosive = bws([0.05, 0.05, 0.05, 0.05, 0.30]);
    expect(detectSqueeze(explosive)).toBe("expansion");
  });

  it("returns 'normal' for value exactly at squeeze boundary (not below)", () => {
    // avg = 0.10; threshold = 0.05; current = 0.05 → not less than → normal
    const atBoundary = bws([0.10, 0.10, 0.10, 0.10, 0.05]);
    expect(detectSqueeze(atBoundary)).toBe("normal");
  });

  it("returns 'normal' for value exactly at expansion boundary (not above)", () => {
    // avg = 0.10; threshold = 0.15; current = 0.15 → not greater than → normal
    const atBoundary = bws([0.10, 0.10, 0.10, 0.10, 0.15]);
    expect(detectSqueeze(atBoundary)).toBe("normal");
  });

  it("returns 'normal' when all preceding bandwidths are zero (sum is zero)", () => {
    // Sum of window = 0 → guard returns "normal"
    const zeroPreceding = bws([0, 0, 0, 0, 0.05]);
    expect(detectSqueeze(zeroPreceding)).toBe("normal");
  });

  it("transition: squeeze followed by expansion is detected correctly", () => {
    // First call — value just below squeeze threshold
    const squeezeSeries = bws([0.10, 0.10, 0.10, 0.10, 0.04]);
    expect(detectSqueeze(squeezeSeries)).toBe("squeeze");

    // Second call — append a large expansion value
    const expansionSeries = bws([0.10, 0.10, 0.10, 0.10, 0.04, 0.40]);
    expect(detectSqueeze(expansionSeries)).toBe("expansion");
  });

  it("respects custom lookback parameter", () => {
    // With lookback=2 the window is only the 2 values before current.
    // Values: [0.10, 0.10, 0.10, 0.10, 0.04]
    // lookback=2 → window = [0.10, 0.10], avg = 0.10, threshold = 0.05
    // current 0.04 < 0.05 → squeeze
    const series = bws([0.10, 0.10, 0.10, 0.10, 0.04]);
    expect(detectSqueeze(series, 2)).toBe("squeeze");
  });
});
