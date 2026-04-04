# T-12-011 Pipeline — KNN PASS 후 daily_bias 교차 검증

## Goal
processEntry()에서 KNN PASS 판정 후, 결과 방향이 daily_bias와 불일치하면 SKIP하는 교차 검증 로직을 추가한다.

## Why
EP-10 Decision log에 "daily_bias 교차 검증은 pipeline.ts(L9)에서 수행"으로 명시했으나 코드가 없음. daily_bias=LONG_ONLY인데 SHORT 진입이 KNN을 통과하면 방향 모순 진입이 발생한다.

## Inputs
- `src/daemon/pipeline.ts` — processEntry() KNN 판정 후 (라인 672-679)
- Evidence result의 `direction` 필드
- SymbolState의 `daily_bias` 필드 (이미 로드됨, 라인 483)

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- KNN PASS 후 daily_bias 교차 검증 코드
- SKIP 시 EventLog 기록

## Deliverables
- `src/daemon/pipeline.ts` — processEntry()에 daily_bias 교차 검증 추가

## Constraints
- 레이어 규칙 준수: pipeline(L9)에서 검증 — knn/decision.ts(L4) 수정하지 않음
- 교차 검증 로직: LONG_ONLY + SHORT evidence → SKIP, SHORT_ONLY + LONG evidence → SKIP
- NEUTRAL bias → 모든 방향 허용 (bypass)
- null bias → 모든 방향 허용 (bypass)
- 위치: KNN PASS 확인 후, analysis mode 체크 전 (라인 672-681 사이)

## Steps
1. KNN PASS 판정 후 (라인 679), daily_bias 교차 검증 블록 추가
2. `symbolState.daily_bias` + `evidence.direction` 비교
3. 불일치 시 log + EventLog + return
4. 통합 테스트 작성

## Acceptance Criteria
- LONG_ONLY + SHORT evidence → SKIP + 로그
- SHORT_ONLY + LONG evidence → SKIP + 로그
- LONG_ONLY + LONG evidence → 통과
- SHORT_ONLY + SHORT evidence → 통과
- NEUTRAL/null → 항상 통과
- **통합 테스트**: pipeline mock에서 daily_bias=LONG_ONLY + SHORT evidence → SKIP 확인

## Test Scenarios
- processEntry() daily_bias=LONG_ONLY + evidence.direction=SHORT + KNN PASS → SKIP
- processEntry() daily_bias=SHORT_ONLY + evidence.direction=LONG + KNN PASS → SKIP
- processEntry() daily_bias=LONG_ONLY + evidence.direction=LONG + KNN PASS → 진행
- processEntry() daily_bias=NEUTRAL + evidence.direction=SHORT + KNN PASS → 진행
- processEntry() daily_bias=null + evidence.direction=any + KNN PASS → 진행
- EventLog에 "pipeline_daily_bias_mismatch" 기록 확인

## Validation
```bash
bun test -- tests/daemon/pipeline
bun run typecheck && bun run lint
```

## Out of Scope
- knn/decision.ts 수정 (레이어 규칙: L4에서 L5 접근 금지)
- daily_bias 자체 계산 로직 변경

## Implementation Notes (2026-04-04)
- Added step 9b block in `processEntry()` at line ~772 of `src/daemon/pipeline.ts`, immediately after the KNN PASS guard and before the analysis mode check (step 10).
- `dailyBias` is derived from `symbolState?.daily_bias ?? null` — symbolState is already loaded in step 2, so no extra DB call.
- Mismatch path: logs `pipeline_daily_bias_mismatch` at INFO level + inserts `DAILY_BIAS_MISMATCH` EventLog row, then returns early.
- Bypass conditions: `dailyBias === null` OR `dailyBias === "NEUTRAL"` — both skip the direction check.
- 8 new tests added to `tests/daemon/pipeline.test.ts` under `"daily_bias cross-validation — post-KNN PASS"` describe block covering all acceptance criteria.
- All 61 tests pass; typecheck and lint clean.
