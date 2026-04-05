# T-15-009 KNN 수수료 차감 CommonCode화

## Metadata
- modules: [knn, config]
- primary: knn

## Goal
하드코딩된 FEE_RATE=0.0008을 CommonCode KNN/commission_pct에서 로드하도록 변경한다.

## Why
현재 decision.ts:44의 `FEE_RATE = 0.0008`이 하드코딩되어 있다. PRD §7.9는 commission 0.08%를 명시하나 해석이 모호하다 (total vs per-side). CommonCode로 이동하면 운영자가 런타임에 변경 가능하다.

## Inputs
- `src/knn/decision.ts` (FEE_RATE 상수)
- PRD §7.9

## Dependencies
- T-15-008 (makeDecision 시그니처 변경 완료)

## Expected Outputs
- `src/knn/decision.ts` — FEE_RATE 하드코딩 제거, CommonCode 로드
- `src/config/seed.ts` — KNN/commission_pct 시드

## Deliverables
- `src/knn/decision.ts` — loadKnnDecisionConfig에 commissionPct 추가
- `src/config/seed.ts` — KNN/commission_pct: 0.0008 시드
- 테스트 업데이트

## Constraints
- 수수료 해석은 운영자 확인 후 확정 (초기값 0.0008 유지)
- KnnDecisionConfig에 commissionPct 필드 추가

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. KnnDecisionConfig에 `commissionPct: number` 필드 추가 (default 0.0008)
4. loadKnnDecisionConfig()에 KNN/commission_pct CommonCode 로드 추가
5. makeDecision()에서 FEE_RATE 상수 대신 config.commissionPct 사용
6. `export const FEE_RATE` 제거
7. seed.ts에 KNN/commission_pct: 0.0008 추가
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- FEE_RATE 하드코딩 제거됨
- commission_pct가 CommonCode에서 로드됨
- 기본값 0.0008 유지
- expectancy 계산에 config.commissionPct 사용
- `bun run typecheck` 통과

## Test Scenarios
- makeDecision() with commissionPct=0.0008 → expectancy = rawExpectancy - 0.0008
- makeDecision() with commissionPct=0.0016 → expectancy = rawExpectancy - 0.0016
- makeDecision() with rawExpectancy=0.001, commissionPct=0.0008 → expectancy=0.0002 > 0 → PASS eligible
- makeDecision() with rawExpectancy=0.0005, commissionPct=0.0008 → expectancy=-0.0003 < 0 → FAIL
- loadKnnDecisionConfig() → commissionPct loaded from CommonCode
- loadKnnDecisionConfig() with missing CommonCode → falls back to 0.0008

## Validation
- `bun test -- --grep "knn|commission"`
- `bun run typecheck`
- `grep -r "FEE_RATE" src/knn/` → no matches (removed)

## Out of Scope
- 수수료 해석 확정 (운영자 확인 대기)
- KNN 알고리즘 변경
