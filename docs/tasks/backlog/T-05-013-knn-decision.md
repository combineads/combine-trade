# T-05-013 KNN 의사결정 + A-grade 판정 + Signal 업데이트

## Goal
`src/knn/decision.ts`에 KNN 검색 결과를 종합하여 PASS/FAIL/SKIP 의사결정을 내리고, A-grade 시그널을 판정하며, Signal.knn_decision과 a_grade를 업데이트하는 로직을 구현한다.

## Why
시그널 파이프라인의 최종 판단. 유사 패턴의 승률, 기대값, 샘플 수를 기반으로 진입 여부를 결정한다. A-grade 시그널은 부스트 로직(포지션 크기 증가 등)에 사용된다.

## Inputs
- `docs/PRODUCT.md` — KNN 결정 규칙 (승률, 기대값, 샘플 수 임계치)
- `src/knn/engine.ts` — searchKnn, KnnNeighbor (T-05-011)
- `src/knn/time-decay.ts` — applyTimeDecay, WeightedNeighbor (T-05-012)
- `src/db/schema.ts` — signalTable (T-05-002)
- `src/core/types.ts` — Signal, KnnDecision, SignalType

## Dependencies
- T-05-002 (Signal 테이블 — knn_decision UPDATE)
- T-05-011 (KNN 검색 엔진)
- T-05-012 (시간 감쇠 가중치)

## Expected Outputs
- `src/knn/decision.ts` exports:
  - `KnnDecisionResult` 타입: { decision: KnnDecision, winRate, expectancy, sampleCount, aGrade }
  - `makeDecision(neighbors: WeightedNeighbor[], signalType: SignalType, safetyPassed: boolean) → KnnDecisionResult`
  - `updateSignalKnnDecision(db, signalId, result: KnnDecisionResult, vectorId: string) → void`

## Deliverables
- `src/knn/decision.ts`

## Constraints
- 결정 로직:
  - 가중 승률 = Σ(weight × isWin) / Σ(weight)
  - 가중 기대값 = Σ(weight × pnlDirection) / Σ(weight) (WIN→+1, LOSS→-1, TIME_EXIT→-0.5)
  - 샘플 수 = 이웃 개수 (labeled만)
  - PASS: 승률 ≥ threshold AND 기대값 > 0 AND 샘플 ≥ minSamples
  - FAIL: 승률 < threshold OR 기대값 ≤ 0
  - SKIP: 샘플 < minSamples (데이터 부족)
- 임계값: CommonCode.KNN에서 조회
  - winrate_threshold: 기본 0.55
  - min_samples: 기본 30
  - a_grade_winrate_threshold: 기본 0.65
- A-grade 판정: signal_type=DOUBLE_B + safety_passed=true + 승률 ≥ a_grade_winrate_threshold
- Signal 업데이트: knn_decision, a_grade, vector_id를 한 트랜잭션에서 UPDATE
- DB 통합 테스트: Signal.knn_decision 업데이트 검증

## Steps
1. PRODUCT.md에서 KNN 결정 규칙 확인
2. src/knn/decision.ts 작성
   - 가중 승률/기대값/샘플 수 계산 함수
   - makeDecision: 결정 로직
   - updateSignalKnnDecision: DB 업데이트
3. A-grade 판정 로직 추가
4. CommonCode 파라미터 조회 + 기본값 fallback
5. knn/index.ts barrel export 업데이트
6. 단위 테스트 (makeDecision 순수 함수)
7. DB 통합 테스트 (Signal 업데이트)

## Acceptance Criteria
- makeDecision() with 승률≥0.55 + 기대값>0 + 샘플≥30 → PASS
- makeDecision() with 승률<0.55 → FAIL
- makeDecision() with 샘플<30 → SKIP
- A-grade: DOUBLE_B + safety + 승률≥0.65 → aGrade=true
- Signal.knn_decision, a_grade, vector_id 업데이트 정상
- CommonCode 파라미터 조회 + 기본값 fallback

## Test Scenarios
- makeDecision() with 승률 0.60, 기대값 1.2, 샘플 50 → PASS
- makeDecision() with 승률 0.45, 기대값 -0.5, 샘플 50 → FAIL
- makeDecision() with 승률 0.70, 기대값 2.0, 샘플 10 → SKIP (샘플 부족)
- makeDecision() with 빈 이웃 배열 → SKIP
- makeDecision() with DOUBLE_B + safety + 승률 0.70 → aGrade=true
- makeDecision() with ONE_B + safety + 승률 0.70 → aGrade=false (DOUBLE_B 아님)
- makeDecision() with DOUBLE_B + safety=false + 승률 0.70 → aGrade=false
- [DB] updateSignalKnnDecision(PASS) → Signal.knn_decision='PASS'
- [DB] updateSignalKnnDecision with aGrade=true → Signal.a_grade=true
- [DB] updateSignalKnnDecision → Signal.vector_id 설정됨

## Validation
```bash
bun test -- --grep "knn-decision"
bun run typecheck
bun run lint
```

## Out of Scope
- 포지션 사이징에서의 A-grade 부스트 적용 (EP-06)
- KNN 파라미터 자동 튜닝 (EP-11 WFO)
