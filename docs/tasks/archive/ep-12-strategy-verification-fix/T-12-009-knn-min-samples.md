# T-12-009 KNN Decision — min_samples 기본값 30으로 변경

## Goal
`DEFAULT_MIN_SAMPLES`를 20에서 30으로 변경하여 PRD 명세에 맞춘다.

## Why
PRD는 KNN 최소 샘플 수를 30으로 명세. 현재 20이면 통계적 유의성이 부족한 상태에서 PASS 판정이 발생할 수 있다.

## Inputs
- `src/knn/decision.ts` — `DEFAULT_MIN_SAMPLES = 20` (라인 40)

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- DEFAULT_MIN_SAMPLES가 30으로 변경됨

## Deliverables
- `src/knn/decision.ts` — 상수값 변경

## Constraints
- CommonCode에서 override 가능한 값이므로 기본값만 변경
- A급 임계값(aGradeWinrateThreshold=0.5)과 일반 임계값(winrateThreshold=0.55)은 변경하지 않음

## Steps
1. `DEFAULT_MIN_SAMPLES`: `20` → `30` 변경
2. 기존 테스트 기대값 갱신 (20~29 neighbor → SKIP)
3. 검증

## Acceptance Criteria
- neighbor 29개 → decision="SKIP"
- neighbor 30개 이상 → winRate/expectancy 기반 PASS/FAIL 판정
- config override 시 config.minSamples 사용 (기본값은 30)

## Test Scenarios
- makeDecision() neighbors=29개 → decision="SKIP" (sampleCount 부족)
- makeDecision() neighbors=30개 + 높은 winRate → decision="PASS"
- makeDecision() neighbors=30개 + 낮은 winRate → decision="FAIL"
- makeDecision() config.minSamples=10 override + neighbors=15 → decision 정상 판정 (override 동작)

## Validation
```bash
bun test -- tests/knn/
bun run typecheck && bun run lint
```

## Out of Scope
- winrateThreshold, aGradeWinrateThreshold 변경
- 수수료 계산 변경
- time-decay 로직 변경

## Implementation Notes
- `DEFAULT_MIN_SAMPLES` changed from 20 → 30 at line 40 of `src/knn/decision.ts`
- JSDoc comment in `loadKnnDecisionConfig` updated to reflect new default (line 168)
- `DEFAULT_CONFIG` fixture in test updated from `minSamples: 20` → `30`
- "exactly 20 samples → not SKIP" test replaced with two new tests:
  - "exactly 29 samples → SKIP (below new DEFAULT_MIN_SAMPLES=30)"
  - "exactly 30 samples → not SKIP (proceeds to PASS or FAIL)"
- A-grade calibration tests had sample count raised from 25 → 30 (25 < 30 would have been SKIP)
- DB integration default-fallback tests updated: expected `minSamples` default 20 → 30
- All 93 tests pass; typecheck and lint clean
