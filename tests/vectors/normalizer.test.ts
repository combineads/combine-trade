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
import { VECTOR_DIM } from "../../src/vectors/feature-spec";
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

// ---------------------------------------------------------------------------
// PRD §3.1 상수 검증 (T-15-005)
// ---------------------------------------------------------------------------

describe("normalizer — PRD §3.1 상수 검증", () => {
  it("CLAMP_MIN=-3: z=-3 → output exactly 0.0", () => {
    // clamp boundary at -3: (-3 - (-3)) / 6 = 0/6 = 0.0
    const raw = new Float32Array(VECTOR_DIM).fill(-3.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 1.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(0.0, 8);
    }
  });

  it("CLAMP_MAX=3: z=3 → output exactly 1.0", () => {
    // clamp boundary at 3: (3 - (-3)) / 6 = 6/6 = 1.0
    const raw = new Float32Array(VECTOR_DIM).fill(3.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 1.0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeCloseTo(1.0, 8);
    }
  });

  it("CENTER=0.5: IQR=0 피처 → 정확히 0.5", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(999.0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.0,
      iqr: 0,
    }));
    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBe(0.5);
    }
  });

  it("DEFAULT_LOOKBACK=60: 100개 벡터 중 마지막 60개만 사용", () => {
    // 첫 40개: 값=0, 마지막 60개: 값=42 → default lookback → median=42
    const vecs = Array.from({ length: 100 }, (_, i) =>
      constantVector(i < 40 ? 0.0 : 42.0),
    );
    const params = computeNormParams(vecs); // lookback 생략 → DEFAULT_LOOKBACK=60
    expect(params[0]!.median).toBeCloseTo(42.0, 5);
    expect(params[0]!.iqr).toBeCloseTo(0.0, 5);
  });

  it("VECTOR_DIM=202: computeNormParams 출력 길이 정확히 202", () => {
    const vecs = Array.from({ length: 5 }, () => constantVector(1.0));
    const params = computeNormParams(vecs);
    expect(params.length).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// 38봉 candle-features 분포 대응 검증 (T-15-005)
// ---------------------------------------------------------------------------

describe("normalizer — 38봉 candle-features 분포 대응", () => {
  /**
   * 실제 BTC 캔들 피처 스케일 시뮬레이션:
   *   body   ≈ 0.001  (|close-open|/close ≈ 0.1%)
   *   range  ≈ 0.005  (high-low/close ≈ 0.5%)
   *   ret    ≈ 0.002  (수익률 ±0.2%)
   *   wick   ≈ 0.002  (가중치 1.5 적용 전)
   */

  /**
   * 202차원 Float32Array 생성 헬퍼.
   * 각 피처에 캔들 스케일 값을 반복 패딩.
   */
  function makeCandleLikeVector(
    body: number,
    range: number,
    ret: number,
    upperWick: number,
    lowerWick: number,
  ): Float32Array {
    // 5개 피처 패턴을 VECTOR_DIM까지 반복
    const pattern = [body, upperWick, lowerWick, range, ret];
    return new Float32Array(
      Array.from({ length: VECTOR_DIM }, (_, i) => pattern[i % 5]!),
    );
  }

  it("캔들 스케일 입력(body~0.001)에서 모든 출력값이 [0,1] 범위", () => {
    // 60개 랜덤-ish 캔들 스케일 벡터로 NormParams 계산
    const vecs: Float32Array[] = Array.from({ length: 60 }, (_, idx) => {
      const jitter = (idx - 30) / 30; // [-1, 1]
      return makeCandleLikeVector(
        0.001 + jitter * 0.0005, // body: 0.0005 ~ 0.0015
        0.005 + jitter * 0.002, // range: 0.003 ~ 0.007
        jitter * 0.002, // ret: -0.002 ~ 0.002
        0.002 + Math.abs(jitter) * 0.001, // upperWick: 0.002 ~ 0.003
        0.002 + Math.abs(jitter) * 0.001, // lowerWick: 0.002 ~ 0.003
      );
    });
    const params = computeNormParams(vecs, 60);

    // 새 입력 벡터 (중간 스케일값)
    const rawVec = makeCandleLikeVector(0.001, 0.005, 0.0, 0.002, 0.002);
    const normalized = normalize(rawVec, params);

    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(normalized[i]!).toBeGreaterThanOrEqual(0.0);
      expect(normalized[i]!).toBeLessThanOrEqual(1.0);
    }
  });

  it("캔들 스케일 100배 극단값 → clamp되어 0 또는 1", () => {
    // 정상 분포로 params 계산
    const vecs: Float32Array[] = Array.from({ length: 60 }, (_, idx) => {
      const jitter = (idx - 30) / 30;
      return makeCandleLikeVector(
        0.001 + jitter * 0.0005,
        0.005 + jitter * 0.002,
        jitter * 0.002,
        0.002 + Math.abs(jitter) * 0.001,
        0.002 + Math.abs(jitter) * 0.001,
      );
    });
    const params = computeNormParams(vecs, 60);

    // 100배 극단값 입력 (z >> 3 → clamp to 1.0)
    const extremeVec = makeCandleLikeVector(0.1, 0.5, 0.2, 0.2, 0.2);
    const normalized = normalize(extremeVec, params);

    for (let i = 0; i < VECTOR_DIM; i++) {
      // clamp 덕분에 항상 [0,1]
      expect(normalized[i]!).toBeGreaterThanOrEqual(0.0);
      expect(normalized[i]!).toBeLessThanOrEqual(1.0);
      // 100배 극단값은 clamp 상한에 걸려 1.0에 근접
      expect(normalized[i]!).toBeCloseTo(1.0, 5);
    }
  });

  it("all-zero 202차원 벡터 + IQR>0 params → 출력이 [0,1] 범위", () => {
    // params: median=0.001, iqr=0.001 (캔들 스케일 대표값)
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({
      median: 0.001,
      iqr: 0.001,
    }));
    const raw = new Float32Array(VECTOR_DIM).fill(0.0);
    const result = normalize(raw, params);

    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]!).toBeGreaterThanOrEqual(0.0);
      expect(result[i]!).toBeLessThanOrEqual(1.0);
    }
    // z = (0 - 0.001) / 0.001 = -1 → (−1+3)/6 ≈ 0.333
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]!).toBeCloseTo(2 / 6, 5);
    }
  });

  it("모든 피처가 같은 값(상수 피처) → IQR=0 → normalize 출력 0.5", () => {
    // 60개 벡터 전부 동일값 → IQR=0
    const vecs = Array.from({ length: 60 }, () =>
      makeCandleLikeVector(0.001, 0.005, 0.0, 0.002, 0.002),
    );
    const params = computeNormParams(vecs, 60);

    // IQR=0이므로 모든 출력이 0.5
    const rawVec = makeCandleLikeVector(0.001, 0.005, 0.0, 0.002, 0.002);
    const result = normalize(rawVec, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]!).toBe(0.5);
    }
  });

  it("60개 벡터로 computeNormParams → 202쌍의 {median, iqr} 반환", () => {
    const vecs: Float32Array[] = Array.from({ length: 60 }, (_, idx) => {
      const jitter = (idx - 30) / 30;
      return makeCandleLikeVector(
        0.001 + jitter * 0.0005,
        0.005 + jitter * 0.002,
        jitter * 0.002,
        0.002 + Math.abs(jitter) * 0.001,
        0.002 + Math.abs(jitter) * 0.001,
      );
    });
    const params = computeNormParams(vecs, 60);

    expect(params).toHaveLength(202);
    for (const p of params) {
      expect(typeof p.median).toBe("number");
      expect(typeof p.iqr).toBe("number");
      expect(Number.isFinite(p.median)).toBe(true);
      expect(Number.isFinite(p.iqr)).toBe(true);
      expect(p.iqr).toBeGreaterThanOrEqual(0);
    }
  });

  it("60개 미만 벡터 → 가용 전체 사용, 오류 없음", () => {
    // 20개만 제공 (lookback=60보다 작음)
    const vecs: Float32Array[] = Array.from({ length: 20 }, (_, idx) => {
      const jitter = (idx - 10) / 10;
      return makeCandleLikeVector(
        0.001 + jitter * 0.0005,
        0.005 + jitter * 0.002,
        jitter * 0.002,
        0.002 + Math.abs(jitter) * 0.001,
        0.002 + Math.abs(jitter) * 0.001,
      );
    });
    expect(() => computeNormParams(vecs, 60)).not.toThrow();
    const params = computeNormParams(vecs, 60);
    expect(params).toHaveLength(202);
  });

  it("중앙값 근처 캔들 벡터 → normalize 출력이 0.4~0.6 근방", () => {
    // 분포 중앙(median) 값을 입력 → z≈0 → output≈0.5
    const vecs: Float32Array[] = Array.from({ length: 60 }, (_, idx) => {
      const jitter = (idx - 30) / 30;
      return makeCandleLikeVector(
        0.001 + jitter * 0.0005,
        0.005 + jitter * 0.002,
        jitter * 0.002,
        0.002 + Math.abs(jitter) * 0.001,
        0.002 + Math.abs(jitter) * 0.001,
      );
    });
    const params = computeNormParams(vecs, 60);

    // 중앙값과 근사한 벡터 (idx=30 ≈ median)
    const medianVec = new Float32Array(VECTOR_DIM);
    for (let i = 0; i < VECTOR_DIM; i++) {
      medianVec[i] = params[i]!.median;
    }
    const result = normalize(medianVec, params);

    for (let i = 0; i < VECTOR_DIM; i++) {
      // IQR>0인 피처는 0.5에 근접
      if (params[i]!.iqr > 0) {
        expect(result[i]!).toBeCloseTo(0.5, 5);
      } else {
        // IQR=0인 경우 CENTER=0.5
        expect(result[i]!).toBe(0.5);
      }
    }
  });
});
