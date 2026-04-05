# T-15-008 makeDecision() 시그니처 변경 + A급 분기 임계값 + pipeline 호출부 수정

## Metadata
- modules: [knn, daemon]
- primary: knn

## Goal
makeDecision()의 A-grade 3중 단절을 해소한다: (1) 시그니처를 isAGrade 기반으로 변경, (2) A급 시 완화된 임계값 적용, (3) pipeline.ts 호출부 수정.

## Why
현재 코드의 3중 단절:
1. evidence-gate가 1H BB4 터치 기반 aGrade 계산 ✅
2. pipeline.ts:747이 evidence.aGrade를 makeDecision에 전달 안 함 ❌
3. makeDecision이 signalType==="DOUBLE_B"로 자체 aGrade 결정 (PRD는 1H BB4 터치) ❌
4. aGrade가 SKIP/PASS/FAIL 임계값에 영향 없음 ❌

PRD §7.9: A급 시 winrate→50%, samples→20.

## Inputs
- `src/knn/decision.ts` (현재 코드)
- `src/daemon/pipeline.ts:747` (makeDecision 호출부)
- PRD §7.9, §7.16

## Dependencies
- T-15-007 (KNN 가중 거리 완료)

## Expected Outputs
- 변경된 `src/knn/decision.ts` — makeDecision 시그니처 + A급 분기
- 변경된 `src/daemon/pipeline.ts` — 호출부 수정
- 변경된 `src/config/seed.ts` — KNN/a_grade_min_samples 시드

## Deliverables
- `src/knn/decision.ts`:
  - `KnnDecisionConfig`에 `aGradeMinSamples: number` 추가
  - `makeDecision(neighbors, isAGrade, config?)` 시그니처
  - A급 분기: isAGrade=true → minSamples=20, winrateThreshold=0.50
  - `loadKnnDecisionConfig()`에 a_grade_min_samples 로드 추가
- `src/daemon/pipeline.ts`: `makeDecision(neighbors, evidence.aGrade)` 호출
- `src/config/seed.ts`: KNN/a_grade_min_samples: 20 시드
- 모든 makeDecision 호출부 전수 갱신
- 테스트 전면 업데이트

## Constraints
- makeDecision 호출부 전수 검색 필수 (grep "makeDecision" src/)
- backtest 코드의 makeDecision 호출도 갱신
- evidence.aGrade는 evidence-gate에서 이미 정상 계산됨 — 변경 불필요

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `grep -r "makeDecision" src/` 로 모든 호출부 식별
4. `src/knn/decision.ts` 수정:
   - KnnDecisionConfig에 aGradeMinSamples 추가 (default 20)
   - makeDecision 시그니처: `(neighbors, isAGrade, config?)`
   - signalType/safetyPassed 파라미터 제거
   - 내부 aGrade 결정 로직 (DOUBLE_B 체크) 제거
   - A급 분기: `isAGrade ? config.aGradeMinSamples : config.minSamples`
   - A급 분기: `isAGrade ? config.aGradeWinrateThreshold : config.winrateThreshold`
5. loadKnnDecisionConfig()에 a_grade_min_samples CommonCode 로드 추가
6. `src/daemon/pipeline.ts:747` 수정: `deps.makeDecision(weightedNeighbors, evidence.aGrade)`
7. 다른 모든 makeDecision 호출부 갱신 (backtest 등)
8. `src/config/seed.ts`에 KNN/a_grade_min_samples: 20 추가
9. Run tests — confirm all pass (GREEN phase)
10. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- makeDecision 시그니처: `(neighbors: WeightedNeighbor[], isAGrade: boolean, config?: KnnDecisionConfig)`
- isAGrade=true → minSamples=20, winrateThreshold=0.50 적용
- isAGrade=false → minSamples=30, winrateThreshold=0.55 유지
- pipeline.ts에서 evidence.aGrade가 makeDecision에 전달됨
- makeDecision 내부에 DOUBLE_B 체크 없음
- a_grade_min_samples가 CommonCode에서 로드됨
- `bun run typecheck` 통과
- `bun test -- --grep "knn|pipeline"` 통과

## Test Scenarios
- makeDecision(neighbors, isAGrade=true) with 25 samples, winrate=0.52 → PASS (relaxed: min_samples=20, winrate=0.50)
- makeDecision(neighbors, isAGrade=false) with 25 samples, winrate=0.52 → SKIP (strict: min_samples=30)
- makeDecision(neighbors, isAGrade=false) with 35 samples, winrate=0.52 → FAIL (strict: winrate < 0.55)
- makeDecision(neighbors, isAGrade=true) with 35 samples, winrate=0.52 → PASS (relaxed: winrate >= 0.50)
- makeDecision(neighbors, isAGrade=false) with 35 samples, winrate=0.60, expectancy>0 → PASS
- makeDecision(neighbors, isAGrade=true) with 15 samples → SKIP (below even relaxed min_samples=20)
- loadKnnDecisionConfig() → includes aGradeMinSamples from CommonCode
- pipeline calls makeDecision with evidence.aGrade (not signalType)

## Validation
- `bun test -- --grep "knn|pipeline|makeDecision"`
- `bun run typecheck`
- `grep -r "signalType.*makeDecision\|makeDecision.*signalType" src/` → no matches (removed)

## Out of Scope
- evidence-gate 변경 (이미 정상)
- 수수료 CommonCode화 (T-15-009)
- 가중 거리 (T-15-007에서 완료)

## Implementation Notes

### 설계 결정

1. **aGrade pass-through 방식**: `makeDecision()`은 isAGrade를 외부(evidence-gate)에서 수신하여 내부 재결정 없이 pass-through한다. SKIP 시에는 aGrade=false를 반환(샘플 부족으로 A급 처리 불가), FAIL/PASS 시에는 isAGrade를 그대로 반환한다.

2. **PipelineDeps 확장**: `loadKnnDecisionConfig`를 PipelineDeps에 추가하여 pipeline.ts가 config를 주입받아 makeDecision에 전달한다. backtest/pipeline-adapter.ts에도 동일하게 주입.

3. **호출부 전수 갱신**: `makeDecision` 호출부 6개 파일 모두 갱신
   - `src/knn/decision.ts` — 함수 정의
   - `src/daemon/pipeline.ts` — 운영 호출부 (evidence.aGrade 전달)
   - `src/backtest/pipeline-adapter.ts` — 백테스트 어댑터
   - `tests/daemon/pipeline.test.ts` — 목 PipelineDeps에 loadKnnDecisionConfig 추가
   - `tests/daemon/daemon-e2e.test.ts` — 동일
   - `tests/signals/pipeline-e2e.test.ts` — 3개 호출부
   - `tests/strategy-alignment/strategy-alignment-e2e.test.ts` — 2개 호출부
   - `tests/knn/knn-decision.test.ts` — 전면 재작성

### Acceptance Criteria 검증

- [x] makeDecision 시그니처: `(neighbors, isAGrade, config?)`
- [x] isAGrade=true → minSamples=20, winrateThreshold=0.50 적용
- [x] isAGrade=false → minSamples=30, winrateThreshold=0.55 유지
- [x] pipeline.ts에서 evidence.aGrade가 makeDecision에 전달됨
- [x] makeDecision 내부에 DOUBLE_B 체크 없음
- [x] a_grade_min_samples가 CommonCode에서 로드됨
- [x] `bun run typecheck` 통과
- [x] 테스트 309개 통과 (src/knn + tests/knn + tests/daemon 범위)

## Outputs

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `src/knn/decision.ts` | 수정 | makeDecision 시그니처 변경, aGradeMinSamples 추가, 내부 DOUBLE_B 체크 제거, loadKnnDecisionConfig 업데이트 |
| `src/daemon/pipeline.ts` | 수정 | PipelineDeps에 loadKnnDecisionConfig 추가, makeDecision 호출부 evidence.aGrade 전달 |
| `src/backtest/pipeline-adapter.ts` | 수정 | loadKnnDecisionConfig import + PipelineDeps 충족 |
| `src/config/seed.ts` | 수정 | KNN/a_grade_min_samples: 20 시드 추가 |
| `src/knn/decision.test.ts` | 신규 | A급 분기 단위 테스트 17개 |
| `tests/knn/knn-decision.test.ts` | 수정 | 새 시그니처로 전면 재작성, aGradeMinSamples 관련 테스트 추가 |
| `tests/daemon/pipeline.test.ts` | 수정 | loadKnnDecisionConfig 목 추가 |
| `tests/daemon/daemon-e2e.test.ts` | 수정 | 동일 |
| `tests/signals/pipeline-e2e.test.ts` | 수정 | makeDecision 호출 3곳 시그니처 갱신 |
| `tests/strategy-alignment/strategy-alignment-e2e.test.ts` | 수정 | makeDecision 호출 2곳 시그니처 갱신 |
