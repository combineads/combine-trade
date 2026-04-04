# T-10-009 KNN 수수료 차감 + A급 임계값 교정

## Goal
`src/knn/decision.ts`의 expectancy 계산에 수수료 0.08%를 차감하고, A급 신호 임계값을 PRD 명세(min_winrate 50%, min_samples 20)로 교정한다.

## Why
현재 expectancy는 수수료를 반영하지 않아 실제보다 높게 산출된다. 0.08% 수수료(왕복 기준)를 차감하면 경계선 신호가 FAIL로 전환되어 과진입을 방지한다. A급 임계값(현재 winrate 65%, samples 30)은 너무 보수적이어서 A급 진입이 거의 발생하지 않으므로, PRD 명세(50%, 20)로 완화하여 적절한 포지션 사이즈 부스트가 이루어지도록 한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M2 KNN decision 교정 명세
- `src/knn/decision.ts` — 현재 makeDecision() 구현, DEFAULT 상수
- `src/core/types.ts` — KnnDecision 타입

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/knn/decision.ts` — 수수료 차감 로직 추가, 상수 교정
- `tests/knn/decision.test.ts` — 수수료 차감/임계값 교정 검증 테스트

## Deliverables
- `src/knn/decision.ts`
- `tests/knn/decision.test.ts`

## Constraints
- 수수료 차감:
  - 상수: `FEE_RATE = 0.0008` (0.08%, 왕복 수수료)
  - 로직: `net_expectancy = raw_expectancy - FEE_RATE`
  - PASS 판정 시 expectancy > 0 조건은 net_expectancy 기준으로 적용
  - KnnDecisionResult.expectancy는 net_expectancy를 반환 (수수료 차감 후)
- A급 임계값 교정:
  - `DEFAULT_A_GRADE_WINRATE_THRESHOLD`: 0.65 → 0.50
  - `DEFAULT_MIN_SAMPLES`: 30 → 20
- DEFAULT_WINRATE_THRESHOLD (0.55)는 변경하지 않음
- loadKnnDecisionConfig()의 DB 기반 오버라이드 구조는 유지
- FEE_RATE은 하드코딩 상수 (DB 설정 불필요 — 거래소 수수료는 구조적으로 고정)

## Steps
1. `FEE_RATE = 0.0008` 상수 추가
2. `DEFAULT_MIN_SAMPLES`를 30 → 20으로 변경
3. `DEFAULT_A_GRADE_WINRATE_THRESHOLD`를 0.65 → 0.50으로 변경
4. makeDecision()에서 weighted expectancy 계산 후 FEE_RATE 차감
5. PASS/FAIL 판정에서 net_expectancy > 0 조건 적용
6. KnnDecisionResult.expectancy에 net_expectancy 반환
7. 기존 테스트 업데이트 + 수수료/임계값 교정 테스트 추가
8. typecheck + lint 통과 확인

## Acceptance Criteria
- makeDecision()에서 expectancy가 수수료 차감된 값으로 반환
- raw expectancy > 0이지만 net expectancy <= 0인 경우 FAIL 반환
- DEFAULT_MIN_SAMPLES === 20
- DEFAULT_A_GRADE_WINRATE_THRESHOLD === 0.50
- A급: winrate 55% + 25 samples + DOUBLE_B + safety → aGrade=true
- A급: winrate 45% → aGrade=false (50% 미만)
- FEE_RATE === 0.0008
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- makeDecision with raw expectancy 0.002 → net = 0.002 - 0.0008 = 0.0012 > 0 → PASS (winrate 충족 시)
- makeDecision with raw expectancy 0.0005 → net = 0.0005 - 0.0008 = -0.0003 < 0 → FAIL
- makeDecision with raw expectancy exactly 0.0008 → net = 0.0 → FAIL (> 0이 아님)
- makeDecision with 15 samples → SKIP (20 미만)
- makeDecision with 20 samples → 정상 판정 (PASS 또는 FAIL)
- A-grade: winrate=0.55, samples=25, DOUBLE_B, safety=true → aGrade=true (0.55 >= 0.50)
- A-grade: winrate=0.45, samples=25, DOUBLE_B, safety=true → aGrade=false (0.45 < 0.50)

## Validation
```bash
bun test -- --grep "decision"
bun run typecheck
bun run lint
```

## Out of Scope
- Time Decay 교정 (T-10-010)
- 벡터 피처/정규화 교정 (T-10-006~008)
- CommonCode DB seed 값 변경 (런타임 오버라이드는 기존 구조 유지)
