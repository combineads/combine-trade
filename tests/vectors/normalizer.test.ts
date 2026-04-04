/**
 * Unit tests for src/vectors/normalizer.ts
 *
 * Pure math tests — no database required.
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
// normalize()
// ---------------------------------------------------------------------------

describe("normalizer — normalize()", () => {
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

  it("identity params (median=0, iqr=1) → output equals input", () => {
    const raw = sequentialVector(1);
    const params = identityParams();
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(raw[i]!, 6);
    }
  });

  it("applies formula: normalized[i] = (raw[i] - median) / iqr", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(10.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 5.0,
      iqr: 2.0,
    }));
    const result = normalize(raw, params);
    // (10 - 5) / 2 = 2.5
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(2.5, 6);
    }
  });

  it("IQR=0 feature → 0.0 output", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(5.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 3.0,
      iqr: 0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBe(0.0);
    }
  });

  it("only feature 0 has IQR=0 → only position 0 is 0.0", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(10.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, (_, i) => ({
      median: 5.0,
      iqr: i === 0 ? 0 : 2.0,
    }));
    const result = normalize(raw, params);
    expect(result[0]).toBe(0.0);
    // (10 - 5) / 2 = 2.5 for all other features
    for (let i = 1; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(2.5, 6);
    }
  });

  it("negative raw values are handled correctly", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(-3.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 2.0,
      iqr: 5.0,
    }));
    const result = normalize(raw, params);
    // (-3 - 2) / 5 = -1.0
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(-1.0, 6);
    }
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

  it("median equals raw value → output 0.0 (regardless of IQR)", () => {
    const value = 7.5;
    const raw = new Float32Array(VECTOR_DIM).fill(value);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: value,
      iqr: 3.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(0.0, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// computeNormParams()
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

  it("round-trip: normalize with computed params gives ~0 mean effect", () => {
    // Create vectors with known spread around a median
    const n = 10;
    const vecs: Float32Array[] = Array.from({ length: n }, (_, i) => {
      // feature[dim] = dim * 2 + i (varying per vector)
      const v = new Float32Array(VECTOR_DIM);
      for (let d = 0; d < VECTOR_DIM; d++) v[d] = d * 2 + i;
      return v;
    });
    const params = computeNormParams(vecs);

    // Normalize the median vector (vector at i=4 or i=5 ~middle)
    // The middle vector should normalize close to 0
    const medianVec = new Float32Array(VECTOR_DIM);
    for (let d = 0; d < VECTOR_DIM; d++) medianVec[d] = params[d]!.median;
    const normalized = normalize(medianVec, params);
    // All normalized values should be 0 (median normalizes to 0)
    for (let d = 0; d < VECTOR_DIM; d++) {
      expect(normalized[d]).toBeCloseTo(0.0, 5);
    }
  });
});
