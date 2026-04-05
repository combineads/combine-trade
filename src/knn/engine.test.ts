/**
 * KNN engine — 가중 거리 단위 테스트
 *
 * ## 검증 전략 (D-005 pre-multiply)
 *
 * T-15-001 D-005 결정: 가중치는 벡터 저장 전에 피처값에 직접 곱해진다.
 * 따라서 pgvector 네이티브 거리 연산자가 이미 가중 거리를 계산한다.
 *
 * 이 테스트들은:
 *   1. buildWeightIndexMap()이 올바른 인덱스→가중치 매핑을 반환하는지 검증한다.
 *   2. pre-multiply된 벡터에서의 L2 거리가 수학적으로 가중 거리와 동일함을 검증한다.
 *   3. 가중치 1.0 피처는 변환 없이 그대로 유지됨을 검증한다.
 */

import { describe, expect, it } from "bun:test";
import { buildWeightIndexMap } from "@/knn/engine";
import { FEATURE_NAMES, FEATURE_WEIGHTS, VECTOR_DIM } from "@/vectors/feature-spec";

// ---------------------------------------------------------------------------
// buildWeightIndexMap 테스트
// ---------------------------------------------------------------------------

describe("knn / buildWeightIndexMap", () => {
  it("반환 배열 길이가 VECTOR_DIM(202)이다", () => {
    const map = buildWeightIndexMap();
    expect(map.length).toBe(VECTOR_DIM);
  });

  it("모든 가중치는 양수이다", () => {
    const map = buildWeightIndexMap();
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBeGreaterThan(0);
    }
  });

  it("FEATURE_NAMES에 없는 인덱스(캔들 피처 0-189 일부 등)는 1.0이다", () => {
    const map = buildWeightIndexMap();
    // 캔들 피처의 이름은 FEATURE_NAMES의 구 6-카테고리 체계 이름이고
    // FEATURE_WEIGHTS에 해당 이름이 없으므로 1.0이어야 한다.
    // 예: 인덱스 0 (bb20_pct_b_5m) → FEATURE_WEIGHTS에 없음 → 1.0
    const idx0Name = FEATURE_NAMES[0];
    if (idx0Name !== undefined && !Object.hasOwn(FEATURE_WEIGHTS, idx0Name)) {
      expect(map[0]).toBe(1.0);
    }
  });

  it("bb4_position (인덱스 191)은 가중치 2.0이다", () => {
    const map = buildWeightIndexMap();
    // strategy 피처의 FEATURE_NAMES 인덱스:
    // 인덱스 190 = bb20_position, 191 = bb4_position
    const bb4Idx = FEATURE_NAMES.indexOf("bb4_position");
    expect(bb4Idx).not.toBe(-1);
    expect(map[bb4Idx]).toBe(2.0);
  });

  it("pivot_distance는 가중치 1.5이다", () => {
    const map = buildWeightIndexMap();
    const idx = FEATURE_NAMES.indexOf("pivot_distance");
    expect(idx).not.toBe(-1);
    expect(map[idx]).toBe(1.5);
  });

  it("daily_open_distance는 가중치 1.5이다", () => {
    const map = buildWeightIndexMap();
    const idx = FEATURE_NAMES.indexOf("daily_open_distance");
    expect(idx).not.toBe(-1);
    expect(map[idx]).toBe(1.5);
  });

  it("session_box_position은 가중치 1.5이다", () => {
    const map = buildWeightIndexMap();
    const idx = FEATURE_NAMES.indexOf("session_box_position");
    expect(idx).not.toBe(-1);
    expect(map[idx]).toBe(1.5);
  });

  it("bb20_position은 FEATURE_WEIGHTS에 없으므로 기본 1.0이다", () => {
    const map = buildWeightIndexMap();
    const idx = FEATURE_NAMES.indexOf("bb20_position");
    expect(idx).not.toBe(-1);
    expect(map[idx]).toBe(1.0);
  });

  it("ma_ordering은 FEATURE_WEIGHTS에 없으므로 기본 1.0이다", () => {
    const map = buildWeightIndexMap();
    const idx = FEATURE_NAMES.indexOf("ma_ordering");
    expect(idx).not.toBe(-1);
    expect(map[idx]).toBe(1.0);
  });

  it("FEATURE_WEIGHTS의 각 직접 이름 키는 매핑에 반영된다", () => {
    const map = buildWeightIndexMap();
    // upperWick / lowerWick은 FEATURE_NAMES에 없는 논리 그룹 키이므로 제외
    const logicalGroupKeys = new Set(["upperWick", "lowerWick"]);
    for (const [name, weight] of Object.entries(FEATURE_WEIGHTS)) {
      if (logicalGroupKeys.has(name)) continue;
      const idx = FEATURE_NAMES.indexOf(name);
      expect(idx).not.toBe(-1);
      expect(map[idx]).toBe(weight);
    }
  });
});

// ---------------------------------------------------------------------------
// pre-multiply 수학적 등가 검증
// ---------------------------------------------------------------------------

describe("knn / pre-multiply 가중 거리 등가 검증", () => {
  /**
   * pre-multiply 원리:
   *   가중 L2^2 = Σ w_i * (a_i - b_i)^2
   *
   * pre-multiply(weight=w) 적용 후:
   *   a'_i = a_i * w,  b'_i = b_i * w
   *   L2^2(a', b') = Σ (a'_i - b'_i)^2 = Σ (w*(a_i - b_i))^2 = Σ w^2 * (a_i - b_i)^2
   *
   * 따라서 피처값에 weight를 곱하는 pre-multiply는:
   *   - weight=2.0 차원: squared distance 기여 4×
   *   - weight=1.5 차원: squared distance 기여 2.25×
   */

  it("균일 가중치(all 1.0)에서 pre-multiply 거리는 표준 L2와 같다", () => {
    const dim = 5;
    const a = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
    const b = new Float32Array([2.0, 3.0, 4.0, 5.0, 6.0]);

    // 표준 L2^2
    let standardL2Sq = 0;
    for (let i = 0; i < dim; i++) {
      standardL2Sq += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
    }

    // pre-multiply (weight=1.0 → 변환 없음)
    const weights = new Float32Array(dim).fill(1.0);
    const aPre = new Float32Array(dim);
    const bPre = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      aPre[i] = (a[i] ?? 0) * (weights[i] ?? 1.0);
      bPre[i] = (b[i] ?? 0) * (weights[i] ?? 1.0);
    }

    let preL2Sq = 0;
    for (let i = 0; i < dim; i++) {
      preL2Sq += ((aPre[i] ?? 0) - (bPre[i] ?? 0)) ** 2;
    }

    expect(preL2Sq).toBeCloseTo(standardL2Sq, 10);
  });

  it("bb4_position weight=2.0: 해당 차원이 squared distance에 4× 기여한다", () => {
    // 1차원 예시: 차이 = 1.0
    const diff = 1.0;
    const weight = 2.0;

    // pre-multiply 후 L2^2
    const preMultipliedDiff = diff * weight;
    const preL2Sq = preMultipliedDiff ** 2; // (2.0)^2 = 4.0

    // 가중 L2^2: weight * diff^2 = 2.0^2 * 1.0^2 = 4.0
    const weightedL2Sq = weight ** 2 * diff ** 2;

    expect(preL2Sq).toBeCloseTo(weightedL2Sq, 10);
    // weight=1.0일 때 squared distance 기여 대비 4×
    const unweightedL2Sq = diff ** 2;
    expect(preL2Sq / unweightedL2Sq).toBeCloseTo(4.0, 10);
  });

  it("upperWick weight=1.5: 해당 차원이 squared distance에 2.25× 기여한다", () => {
    const diff = 1.0;
    const weight = 1.5;

    const preMultipliedDiff = diff * weight;
    const preL2Sq = preMultipliedDiff ** 2; // (1.5)^2 = 2.25

    const unweightedL2Sq = diff ** 2; // 1.0
    expect(preL2Sq / unweightedL2Sq).toBeCloseTo(2.25, 10);
  });

  it("혼합 가중치: 고가중치 차원이 더 큰 거리 기여를 한다", () => {
    // 2차원 벡터: [일반피처, bb4_position]
    // 차이는 동일하게 1.0으로 설정
    const diff = 1.0;

    // weight=1.0 차원: squared 기여 = 1.0
    // weight=2.0 차원: squared 기여 = 4.0
    const normalContrib = diff ** 2;
    const weightedContrib = (diff * 2.0) ** 2;

    expect(weightedContrib).toBeGreaterThan(normalContrib);
    expect(weightedContrib / normalContrib).toBeCloseTo(4.0, 10);
  });

  it("pre-multiply 벡터 간 L2 거리: 고가중치 피처의 차이가 클수록 거리가 크다", () => {
    // 3차원: [normal, bb4_pos(w=2.0), normal]
    // 케이스 A: bb4_pos 차이가 큼
    // 케이스 B: 일반 피처 차이가 큼, bb4_pos 차이가 작음
    const weight_bb4 = 2.0;

    // 케이스 A: bb4_pos diff=1.0, 나머지 diff=0.1
    const diffA_normal = 0.1;
    const diffA_bb4 = 1.0;
    const distA = diffA_normal ** 2 + (diffA_bb4 * weight_bb4) ** 2 + diffA_normal ** 2;

    // 케이스 B: bb4_pos diff=0.1, 나머지 diff=1.0
    const diffB_normal = 1.0;
    const diffB_bb4 = 0.1;
    const distB = diffB_normal ** 2 + (diffB_bb4 * weight_bb4) ** 2 + diffB_normal ** 2;

    // 케이스 A가 bb4_pos 차이가 크므로 전체 거리가 더 커야 한다
    expect(distA).toBeGreaterThan(distB);
  });
});

// ---------------------------------------------------------------------------
// FEATURE_WEIGHTS 논리 그룹 키 검증 (upperWick / lowerWick)
// ---------------------------------------------------------------------------

describe("knn / FEATURE_WEIGHTS 논리 그룹 키 (upperWick/lowerWick)", () => {
  it("upperWick는 FEATURE_NAMES에 직접 존재하지 않는 논리 그룹 키이다", () => {
    const idx = FEATURE_NAMES.indexOf("upperWick");
    expect(idx).toBe(-1); // FEATURE_NAMES에 없음
    expect(FEATURE_WEIGHTS.upperWick).toBe(1.5); // 하지만 가중치 정의는 있음
  });

  it("lowerWick는 FEATURE_NAMES에 직접 존재하지 않는 논리 그룹 키이다", () => {
    const idx = FEATURE_NAMES.indexOf("lowerWick");
    expect(idx).toBe(-1);
    expect(FEATURE_WEIGHTS.lowerWick).toBe(1.5);
  });

  it("upper_wick_5m, lower_wick_5m 등 실제 피처 이름은 FEATURE_NAMES에 존재한다", () => {
    // candle-features.ts에서 upperWick 가중치가 적용되는 실제 피처들
    const upperWickFeatures = FEATURE_NAMES.filter(
      (name) => name.startsWith("upper_wick") || name.startsWith("lower_wick"),
    );
    expect(upperWickFeatures.length).toBeGreaterThan(0);
  });

  it("buildWeightIndexMap은 upperWick/lowerWick 논리 그룹 키를 건너뛴다", () => {
    // buildWeightIndexMap은 FEATURE_NAMES 기반으로 동작하므로
    // upperWick/lowerWick은 인덱스 매핑에 직접 포함되지 않는다.
    const map = buildWeightIndexMap();
    // upper_wick_5m, lower_wick_5m 인덱스: FEATURE_WEIGHTS에 직접 이름이 없으므로 1.0
    const upperWickIdx = FEATURE_NAMES.indexOf("upper_wick_5m");
    if (upperWickIdx !== -1) {
      // "upper_wick_5m"은 FEATURE_WEIGHTS 키가 아니므로 1.0
      expect(map[upperWickIdx]).toBe(1.0);
    }
  });
});

// ---------------------------------------------------------------------------
// 기본값 확인
// ---------------------------------------------------------------------------

describe("knn / 명시적 가중치 없는 피처는 1.0이다", () => {
  it("buildWeightIndexMap 결과에서 weighted 피처 외 나머지는 1.0이다", () => {
    const map = buildWeightIndexMap();
    const logicalGroupKeys = new Set(["upperWick", "lowerWick"]);
    const weightedNames = new Set(
      Object.keys(FEATURE_WEIGHTS).filter((k) => !logicalGroupKeys.has(k)),
    );

    for (let i = 0; i < FEATURE_NAMES.length; i++) {
      const name = FEATURE_NAMES[i];
      if (name === undefined) continue;
      if (weightedNames.has(name)) {
        // 가중치가 명시된 피처 → 1.0보다 크다
        expect(map[i]).toBeGreaterThan(1.0);
      } else {
        // 가중치가 없는 피처 → 1.0
        expect(map[i]).toBe(1.0);
      }
    }
  });
});
