/**
 * Unit tests for src/vectors/normalizer.ts
 *
 * Pure math tests — no database required.
 *
 * Normalization pipeline (per feature, per vector):
 *   1. z = (raw - median) / iqr          (Median/IQR)
 *   2. z_clamped = clamp(z, -3, 3)       (outlier clamp)
 *   3. out = (z_clamped + 3) / 6         ([0,1] scaling)
 *   Special cases:
 *     - IQR = 0           → 0.5 (center of [0,1])
 *     - NaN or ±Infinity  → 0.5 (center of [0,1])
 */

import { describe, expect, it } from "bun:test";
import { VECTOR_DIM } from "../../src/vectors/features";
import { computeNormParams, normalize } from "../../src/vectors/normalizer";
import type { NormParams } from "../../src/vectors/normalizer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a NormParams array with uniform median=0 and iqr=1 for all features. */
function identityParams(): NormParams {
  return Array.from({ length: VECTOR_DIM }, () => ({ median: 0, iqr: 1 }));
}

/** Creates a Float32Array of VECTOR_DIM filled with a constant value. */
function constantVector(value: number): Float32Array {
  return new Float32Array(VECTOR_DIM).fill(value);
}

/** Creates a Float32Array of VECTOR_DIM with sequential values starting from start. */
function sequentialVector(start = 0): Float32Array {
  return new Float32Array(Array.from({ length: VECTOR_DIM }, (_, i) => start + i));
}

// ---------------------------------------------------------------------------
// normalize() — output shape
// ---------------------------------------------------------------------------

describe("normalizer — normalize() output shape", () => {
  it("output length equals VECTOR_DIM (202)", () => {
    const raw = constantVector(1.0);
    const params = identityParams();
    const result = normalize(raw, params);
    expect(result.length).toBe(VECTOR_DIM);
    expect(result.length).toBe(202);
  });

  it("returns Float32Array", () => {
    const raw = constantVector(1.0);
    const params = identityParams();
    const result = normalize(raw, params);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it("does not mutate the input raw vector", () => {
    const raw = sequentialVector(0);
    const original = Array.from(raw);
    const params = identityParams();
    normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(raw[i]).toBe(original[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// normalize() — [0,1] scaling pipeline
// ---------------------------------------------------------------------------

describe("normalizer — normalize() [0,1] scaling", () => {
  it("z=0 (median == raw) maps to 0.5", () => {
    // (raw - median) / iqr = 0 → clamp(0) = 0 → (0+3)/6 = 0.5
    const value = 7.5;
    const raw = new Float32Array(VECTOR_DIM).fill(value);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: value,
      iqr: 3.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(0.5, 6);
    }
  });

  it("z=3 (upper boundary) maps to 1.0", () => {
    // (9 - 0) / 3 = 3 → clamp(3) = 3 → (3+3)/6 = 1.0
    const raw = new Float32Array(VECTOR_DIM).fill(9.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 3.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(1.0, 6);
    }
  });

  it("z=-3 (lower boundary) maps to 0.0", () => {
    // (-9 - 0) / 3 = -3 → clamp(-3) = -3 → (-3+3)/6 = 0.0
    const raw = new Float32Array(VECTOR_DIM).fill(-9.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 3.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(0.0, 6);
    }
  });

  it("applies full pipeline: (raw-median)/iqr → clamp → scale", () => {
    // (10 - 5) / 2 = 2.5 → clamp(2.5) = 2.5 → (2.5+3)/6 ≈ 0.9167
    const raw = new Float32Array(VECTOR_DIM).fill(10.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 5.0,
      iqr: 2.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(5.5 / 6, 6);
    }
  });

  it("negative z within [-3,3]: (-3-2)/5 = -1.0 → (-1+3)/6 ≈ 0.333", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(-3.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 2.0,
      iqr: 5.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(2 / 6, 6);
    }
  });

  it("output is always in [0, 1]", () => {
    // Use extreme values to verify clamping keeps output bounded
    const raw = new Float32Array(VECTOR_DIM).fill(1e9);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 1.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]!).toBeGreaterThanOrEqual(0);
      expect(result[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("z > 3 is clamped to 3 → output 1.0", () => {
    // (100 - 0) / 1 = 100 → clamp(100) = 3 → (3+3)/6 = 1.0
    const raw = new Float32Array(VECTOR_DIM).fill(100.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 1.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(1.0, 6);
    }
  });

  it("z < -3 is clamped to -3 → output 0.0", () => {
    // (-100 - 0) / 1 = -100 → clamp(-100) = -3 → (-3+3)/6 = 0.0
    const raw = new Float32Array(VECTOR_DIM).fill(-100.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 1.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(0.0, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// normalize() — special cases: IQR=0 and NaN/Infinity
// ---------------------------------------------------------------------------

describe("normalizer — normalize() special cases", () => {
  it("IQR=0 → 0.5 (center of [0,1])", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(5.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 3.0,
      iqr: 0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBe(0.5);
    }
  });

  it("only feature 0 has IQR=0 → only position 0 is 0.5, others scaled normally", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(10.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, (_, i) => ({
      median: 5.0,
      iqr: i === 0 ? 0 : 2.0,
    }));
    const result = normalize(raw, params);
    // IQR=0 → 0.5
    expect(result[0]).toBe(0.5);
    // (10 - 5) / 2 = 2.5 → clamp(2.5) = 2.5 → (2.5+3)/6 ≈ 0.9167
    for (let i = 1; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(5.5 / 6, 6);
    }
  });

  it("NaN in raw input → 0.5", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(NaN);
    const params = identityParams();
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBe(0.5);
    }
  });

  it("+Infinity in raw input → 0.5 (via clamp or NaN guard)", () => {
    // (Infinity - 0) / 1 = Infinity → not finite → 0.5
    const raw = new Float32Array(VECTOR_DIM).fill(Infinity);
    const params = identityParams();
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBe(0.5);
    }
  });

  it("-Infinity in raw input → 0.5", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(-Infinity);
    const params = identityParams();
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBe(0.5);
    }
  });
});

// ---------------------------------------------------------------------------
// computeNormParams() — basic correctness
// ---------------------------------------------------------------------------

describe("normalizer — computeNormParams()", () => {
  it("throws on empty input", () => {
    expect(() => computeNormParams([])).toThrow();
  });

  it("returns array of length VECTOR_DIM (202)", () => {
    const vec = constantVector(1.0);
    const params = computeNormParams([vec]);
    expect(params.length).toBe(VECTOR_DIM);
    expect(params.length).toBe(202);
  });

  it("each element has median and iqr properties", () => {
    const vec = constantVector(1.0);
    const params = computeNormParams([vec]);
    for (const p of params) {
      expect(typeof p.median).toBe("number");
      expect(typeof p.iqr).toBe("number");
    }
  });

  it("single vector → IQR=0 for all features (only one data point)", () => {
    const vec = sequentialVector(1);
    const params = computeNormParams([vec]);
    for (const p of params) {
      expect(p.iqr).toBe(0);
    }
  });

  it("single vector → median equals the vector values", () => {
    const vec = new Float32Array(VECTOR_DIM);
    for (let i = 0; i < VECTOR_DIM; i++) vec[i] = i * 2;
    const params = computeNormParams([vec]);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(params[i]!.median).toBeCloseTo(i * 2, 5);
    }
  });

  it("two identical vectors → IQR=0, median equals the common value", () => {
    const vec1 = constantVector(5.0);
    const vec2 = constantVector(5.0);
    const params = computeNormParams([vec1, vec2]);
    for (const p of params) {
      expect(p.median).toBeCloseTo(5.0, 6);
      expect(p.iqr).toBeCloseTo(0.0, 6);
    }
  });

  it("two vectors with known values → correct median and IQR", () => {
    // feature 0: [1, 3] → median=2, q1=1.5, q3=2.5, iqr=1
    const vec1 = new Float32Array(VECTOR_DIM).fill(1.0);
    const vec2 = new Float32Array(VECTOR_DIM).fill(3.0);
    const params = computeNormParams([vec1, vec2]);
    expect(params[0]!.median).toBeCloseTo(2.0, 5);
    expect(params[0]!.iqr).toBeCloseTo(1.0, 5);
  });

  it("five uniform values → IQR=0", () => {
    const vecs = Array.from({ length: 5 }, () => constantVector(7.0));
    const params = computeNormParams(vecs);
    for (const p of params) {
      expect(p.iqr).toBe(0);
      expect(p.median).toBeCloseTo(7.0, 6);
    }
  });

  it("known distribution: [1,2,3,4,5] → median=3, IQR=2", () => {
    // [1,2,3,4,5]: q1=2, q3=4, iqr=2, median=3
    const vecs = [1, 2, 3, 4, 5].map((v) => constantVector(v));
    const params = computeNormParams(vecs);
    expect(params[0]!.median).toBeCloseTo(3.0, 5);
    expect(params[0]!.iqr).toBeCloseTo(2.0, 5);
  });

  it("handles 100 vectors without error", () => {
    const vecs: Float32Array[] = [];
    for (let i = 0; i < 100; i++) {
      vecs.push(constantVector(i));
    }
    expect(() => computeNormParams(vecs)).not.toThrow();
    const params = computeNormParams(vecs);
    expect(params.length).toBe(VECTOR_DIM);
  });

  it("IQR is always non-negative", () => {
    const vecs = Array.from({ length: 10 }, (_, i) =>
      new Float32Array(VECTOR_DIM).fill(i % 3 === 0 ? -5 : i),
    );
    const params = computeNormParams(vecs);
    for (const p of params) {
      expect(p.iqr).toBeGreaterThanOrEqual(0);
    }
  });

  it("round-trip: normalize with computed params on median vector gives 0.5", () => {
    // median vector normalizes to z=0 → scaled to 0.5
    const n = 10;
    const vecs: Float32Array[] = Array.from({ length: n }, (_, i) => {
      const v = new Float32Array(VECTOR_DIM);
      for (let d = 0; d < VECTOR_DIM; d++) v[d] = d * 2 + i;
      return v;
    });
    const params = computeNormParams(vecs);

    // Normalize the median vector (z should be 0 everywhere → 0.5 after scaling)
    const medianVec = new Float32Array(VECTOR_DIM);
    for (let d = 0; d < VECTOR_DIM; d++) medianVec[d] = params[d]!.median;
    const normalized = normalize(medianVec, params);
    for (let d = 0; d < VECTOR_DIM; d++) {
      expect(normalized[d]).toBeCloseTo(0.5, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// computeNormParams() — lookback window
// ---------------------------------------------------------------------------

describe("normalizer — computeNormParams() lookback", () => {
  it("lookback limits vectors used to last N", () => {
    // First 60 vectors all have value 0, last 1 has value 100
    // Without lookback: median ~0
    // With lookback=1: only last vector → median=100, IQR=0
    const vecs = Array.from({ length: 61 }, (_, i) =>
      constantVector(i === 60 ? 100 : 0),
    );
    const paramsAll = computeNormParams(vecs);
    const paramsLookback = computeNormParams(vecs, 1);

    expect(paramsAll[0]!.median).toBeCloseTo(0, 3);
    expect(paramsLookback[0]!.median).toBeCloseTo(100, 3);
  });

  it("lookback=60 uses only last 60 of 100 vectors", () => {
    // First 40 vectors: value 0; last 60 vectors: value 10
    // With lookback=60: median=10
    const vecs = Array.from({ length: 100 }, (_, i) =>
      constantVector(i < 40 ? 0 : 10),
    );
    const params = computeNormParams(vecs, 60);
    expect(params[0]!.median).toBeCloseTo(10, 5);
    expect(params[0]!.iqr).toBeCloseTo(0, 5);
  });

  it("lookback larger than available vectors uses all vectors", () => {
    // Only 5 vectors available, lookback=60 → uses all 5
    const vecs = [1, 2, 3, 4, 5].map((v) => constantVector(v));
    const paramsAll = computeNormParams(vecs);
    const paramsLookback = computeNormParams(vecs, 60);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(paramsLookback[i]!.median).toBeCloseTo(paramsAll[i]!.median, 5);
      expect(paramsLookback[i]!.iqr).toBeCloseTo(paramsAll[i]!.iqr, 5);
    }
  });

  it("lookback=undefined (default) uses all vectors — same as no lookback", () => {
    const vecs = Array.from({ length: 20 }, (_, i) => constantVector(i));
    const paramsDefault = computeNormParams(vecs);
    const paramsUndefined = computeNormParams(vecs, undefined);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(paramsUndefined[i]!.median).toBeCloseTo(paramsDefault[i]!.median, 5);
    }
  });

  it("default lookback is 60 when corpus > 60", () => {
    // 80 vectors: first 20 are value 99, last 60 are value 1
    // With default (lookback=60): should use last 60 → median=1
    const vecs = Array.from({ length: 80 }, (_, i) =>
      constantVector(i < 20 ? 99 : 1),
    );
    const params = computeNormParams(vecs);
    expect(params[0]!.median).toBeCloseTo(1, 5);
  });
});
