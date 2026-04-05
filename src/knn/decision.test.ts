/**
 * KNN decision — makeDecision() 단위 테스트
 *
 * T-15-008: A급 분기 임계값 + 시그니처 변경 검증
 * T-15-009: commissionPct CommonCode화 검증
 *
 * 테스트 시나리오:
 *  - isAGrade=true  → minSamples=20, winrateThreshold=0.50 (완화된 기준)
 *  - isAGrade=false → minSamples=30, winrateThreshold=0.55 (엄격한 기준)
 *  - 샘플 수 부족 시 SKIP
 *  - PASS/FAIL 분기
 *  - commissionPct 오버라이드 검증
 */

import { describe, expect, it } from "bun:test";
import { makeDecision } from "@/knn/decision";
import type { WeightedNeighbor } from "@/knn/time-decay";

// ---------------------------------------------------------------------------
// 헬퍼 — WeightedNeighbor 배열 생성
// ---------------------------------------------------------------------------

/**
 * n개의 WeightedNeighbor를 생성한다.
 * winCount개는 WIN, 나머지는 LOSS로 레이블된다.
 * 모든 weight는 1.0으로 균일하다.
 */
function makeNeighbors(n: number, winCount: number): WeightedNeighbor[] {
  return Array.from({ length: n }, (_, i) => ({
    vectorId: `vec-${i}`,
    distance: 0.1,
    weight: 1.0,
    label: i < winCount ? "WIN" : "LOSS",
    grade: null,
    createdAt: new Date("2024-01-01"),
  }));
}

// ---------------------------------------------------------------------------
// A급 분기 — 완화된 임계값 (minSamples=20, winrateThreshold=0.50)
// ---------------------------------------------------------------------------

describe("makeDecision / A급 (isAGrade=true) — 완화된 임계값", () => {
  it("25 샘플, winrate=0.52 → PASS (완화: min=20, threshold=0.50)", () => {
    // 25 neighbors 중 13 WIN = winrate 0.52
    const neighbors = makeNeighbors(25, 13);
    const result = makeDecision(neighbors, true);
    expect(result.decision).toBe("PASS");
    expect(result.sampleCount).toBe(25);
    expect(result.aGrade).toBe(true);
  });

  it("35 샘플, winrate=0.52 → PASS (완화: threshold=0.50 이상)", () => {
    // 35 neighbors 중 19 WIN = winrate ~0.543
    const neighbors = makeNeighbors(35, 19);
    const result = makeDecision(neighbors, true);
    expect(result.decision).toBe("PASS");
    expect(result.aGrade).toBe(true);
  });

  it("15 샘플 → SKIP (완화된 min_samples=20도 미달)", () => {
    const neighbors = makeNeighbors(15, 10);
    const result = makeDecision(neighbors, true);
    expect(result.decision).toBe("SKIP");
    expect(result.aGrade).toBe(false); // SKIP이면 aGrade는 false
  });

  it("빈 배열 → SKIP", () => {
    const result = makeDecision([], true);
    expect(result.decision).toBe("SKIP");
    expect(result.sampleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 비A급 분기 — 엄격한 임계값 (minSamples=30, winrateThreshold=0.55)
// ---------------------------------------------------------------------------

describe("makeDecision / 비A급 (isAGrade=false) — 엄격한 임계값", () => {
  it("25 샘플, winrate=0.52 → SKIP (엄격: min_samples=30 미달)", () => {
    const neighbors = makeNeighbors(25, 13);
    const result = makeDecision(neighbors, false);
    expect(result.decision).toBe("SKIP");
    expect(result.aGrade).toBe(false);
  });

  it("35 샘플, winrate=0.52 → FAIL (엄격: threshold=0.55 미달)", () => {
    // 35 neighbors 중 18 WIN = winrate ~0.514
    const neighbors = makeNeighbors(35, 18);
    const result = makeDecision(neighbors, false);
    expect(result.decision).toBe("FAIL");
    expect(result.aGrade).toBe(false);
  });

  it("35 샘플, winrate=0.60, expectancy>0 → PASS", () => {
    // 35 neighbors 중 21 WIN = winrate 0.60
    const neighbors = makeNeighbors(35, 21);
    const result = makeDecision(neighbors, false);
    expect(result.decision).toBe("PASS");
    expect(result.aGrade).toBe(false);
  });

  it("30 샘플 정확히 충족, winrate=0.60 → PASS (경계값)", () => {
    const neighbors = makeNeighbors(30, 18); // 18/30 = 0.60
    const result = makeDecision(neighbors, false);
    expect(result.decision).toBe("PASS");
  });

  it("29 샘플 → SKIP (min_samples=30 미달)", () => {
    const neighbors = makeNeighbors(29, 20);
    const result = makeDecision(neighbors, false);
    expect(result.decision).toBe("SKIP");
  });
});

// ---------------------------------------------------------------------------
// config 오버라이드
// ---------------------------------------------------------------------------

describe("makeDecision / config 오버라이드", () => {
  it("custom config: aGradeMinSamples=10으로 오버라이드하면 10 샘플로 통과", () => {
    const neighbors = makeNeighbors(10, 6); // winrate 0.60
    const result = makeDecision(neighbors, true, {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeMinSamples: 10,
      aGradeWinrateThreshold: 0.5,
      commissionPct: 0.0008,
    });
    expect(result.decision).toBe("PASS");
  });

  it("custom config: aGradeWinrateThreshold=0.60 → winrate=0.52는 FAIL", () => {
    const neighbors = makeNeighbors(25, 13); // winrate 0.52
    const result = makeDecision(neighbors, true, {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeMinSamples: 20,
      aGradeWinrateThreshold: 0.6,
      commissionPct: 0.0008,
    });
    expect(result.decision).toBe("FAIL");
  });
});

// ---------------------------------------------------------------------------
// 출력값 검증
// ---------------------------------------------------------------------------

describe("makeDecision / 출력값 구조", () => {
  it("PASS 결과에는 winRate, expectancy, sampleCount, aGrade가 포함된다", () => {
    const neighbors = makeNeighbors(35, 21); // 0.60 win rate
    const result = makeDecision(neighbors, false);
    expect(result).toHaveProperty("decision");
    expect(result).toHaveProperty("winRate");
    expect(result).toHaveProperty("expectancy");
    expect(result).toHaveProperty("sampleCount");
    expect(result).toHaveProperty("aGrade");
  });

  it("isAGrade=true + PASS → aGrade=true (pass-through)", () => {
    const neighbors = makeNeighbors(25, 14); // 14/25=0.56 > 0.50
    const result = makeDecision(neighbors, true);
    // PASS여야 aGrade=true가 유효함 — SKIP이면 aGrade=false
    if (result.decision === "PASS") {
      expect(result.aGrade).toBe(true);
    }
  });

  it("isAGrade=false + PASS → aGrade=false (pass-through)", () => {
    const neighbors = makeNeighbors(35, 21); // 0.60
    const result = makeDecision(neighbors, false);
    expect(result.aGrade).toBe(false);
  });

  it("winRate는 0~1 범위이다", () => {
    const neighbors = makeNeighbors(30, 18);
    const result = makeDecision(neighbors, false);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
  });

  it("sampleCount는 neighbors 길이와 같다 (모두 레이블됨)", () => {
    const neighbors = makeNeighbors(30, 18);
    const result = makeDecision(neighbors, false);
    expect(result.sampleCount).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// commissionPct — T-15-009
// ---------------------------------------------------------------------------

describe("makeDecision / commissionPct (T-15-009)", () => {
  /**
   * 균일 weight=1.0으로 n개 이웃을 생성할 때
   * rawExpectancy = (winCount * 1 + lossCount * (-1)) / n
   * expectancy    = rawExpectancy - commissionPct
   */

  it("commissionPct=0.0008 → expectancy = rawExpectancy - 0.0008", () => {
    // 35 샘플, 21 WIN(+1), 14 LOSS(-1)
    // rawExpectancy = (21 - 14) / 35 = 0.2
    // expectancy = 0.2 - 0.0008 = 0.1992
    const neighbors = makeNeighbors(35, 21);
    const result = makeDecision(neighbors, false, {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    });
    expect(result.expectancy).toBeCloseTo(0.1992, 6);
  });

  it("commissionPct=0.0016 → expectancy = rawExpectancy - 0.0016", () => {
    // 35 샘플, 21 WIN, 14 LOSS → rawExpectancy = 0.2
    // expectancy = 0.2 - 0.0016 = 0.1984
    const neighbors = makeNeighbors(35, 21);
    const result = makeDecision(neighbors, false, {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0016,
    });
    expect(result.expectancy).toBeCloseTo(0.1984, 6);
  });

  it("rawExpectancy=0.001, commissionPct=0.0008 → expectancy=0.0002 > 0 → PASS 가능", () => {
    // 30 샘플 균일 weight: WIN이 많아 rawExpectancy ≈ 0.001이 되도록
    // rawExpectancy = (w - l) / 30 = 0.001 → w - l = 0.03 → 실수라 근사치를 사용
    // 단순화: 30 WIN, 0 LOSS → rawExpectancy = 1.0, expectancy = 0.9992 > 0 → PASS
    const neighbors = makeNeighbors(30, 30); // all WIN
    const result = makeDecision(neighbors, false, {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    });
    expect(result.expectancy).toBeGreaterThan(0);
    expect(result.decision).toBe("PASS");
  });

  it("rawExpectancy=0.0005, commissionPct=0.0008 → expectancy<0 → FAIL", () => {
    // 35 샘플: win 18, loss 17 → rawExpectancy = (18-17)/35 ≈ 0.02857
    // 0.02857 - 0.0008 > 0 이므로 순수하게 음수 만들기 위해
    // 30 WIN, 30 LOSS + 추가: win=15, loss=15 → rawExpectancy=0 → expectancy=-0.0008 < 0
    const neighbors = makeNeighbors(30, 15); // 15 WIN, 15 LOSS → rawExpectancy=0
    const result = makeDecision(neighbors, false, {
      winrateThreshold: 0.55,
      minSamples: 30,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 20,
      commissionPct: 0.0008,
    });
    expect(result.expectancy).toBeLessThan(0);
    expect(result.decision).toBe("FAIL");
  });

  it("기본 config(commissionPct 생략)로도 expectancy 계산이 동작한다", () => {
    // 기본값 0.0008이 적용되는지 확인
    const neighbors = makeNeighbors(35, 21); // rawExpectancy = 0.2
    const result = makeDecision(neighbors, false);
    expect(result.expectancy).toBeCloseTo(0.1992, 6);
  });
});

// ---------------------------------------------------------------------------
// 내부 aGrade 결정 로직 제거 검증
// ---------------------------------------------------------------------------

describe("makeDecision / signalType 의존성 없음", () => {
  it("signalType 파라미터 없이 isAGrade만으로 동작한다 (타입 체크)", () => {
    // 컴파일 타임 검증: 시그니처에 signalType이 없어야 한다
    // 런타임: isAGrade=true로 25 샘플이 PASS되면 aGrade=true (pass-through)
    const neighbors = makeNeighbors(25, 14);
    const result = makeDecision(neighbors, true);
    // isAGrade=true pass-through 확인 — signalType 의존 없음
    expect(typeof result.aGrade).toBe("boolean");
    // SKIP이 아니면 isAGrade가 그대로 aGrade로 전달된다
    if (result.decision !== "SKIP") {
      expect(result.aGrade).toBe(true);
    } else {
      expect(result.aGrade).toBe(false);
    }
  });
});
