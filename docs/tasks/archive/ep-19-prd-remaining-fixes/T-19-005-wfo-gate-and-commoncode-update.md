# T-19-005 WFO 통과/실패 게이트 + 최적값 CommonCode 반영

## Metadata
- modules: [backtest, config]
- primary: backtest
- epic: EP-19
- milestone: M3
- prd-refs: §7.25 L478-479

## Goal
WFO 완료 후 통과/실패 게이트를 적용하고, 통과 시 `bestParams`를 CommonCode에
upsert한다. PRD §7.25 L478-479: OOS expectancy > 0 AND efficiency > 0.5 → 통과.
실패 시 경고 로그만 출력하고 CommonCode를 갱신하지 않는다.

## Why
현재 `runWfo()` (wfo.ts L187-294)는 효율 계산 후 결과를 반환할 뿐이며, 통과/실패
게이트 평가도 CommonCode 갱신도 수행하지 않는다. PRD §7.25 L478-479는 명시적으로
이 두 단계를 요구한다. 게이트 없이는 성능이 검증되지 않은 파라미터 세트가 라이브
시스템에 적용될 위험이 있다. CommonCode 갱신 없이는 WFO가 분석 도구로만 남고
전략 루프가 닫히지 않는다.

## Inputs
- `src/backtest/wfo.ts` — `runWfo()`, `WfoResult`, `WfoDeps`
- `src/config/loader.ts` — `loadAllConfig()`, `getCachedValue()`
- PRD §7.25 L478: `if OOS_expectancy > 0 AND efficiency > 0.5 → PASS`
- PRD §7.25 L479: `PASS → write bestParams to CommonCode`
- PRD §7.25 L479: `FAIL → log warning, do NOT update CommonCode`
- CommonCode 구조: `group_code` = `"WFO_PARAMS"`, `code` = param 이름, `value` = 최적값

## Dependencies
- 없음 (wfo.ts와 config/loader.ts는 이미 존재)

## Expected Outputs
- 수정된 `src/backtest/wfo.ts`:
  - `WfoResult` 에 `passed: boolean`, `gateReason: string` 필드 추가
  - `runWfo()` 반환 전 게이트 평가
- 신규 `updateConfig()` 함수 (또는 `src/config/loader.ts` 확장):
  - `group_code` + `code` 기준 CommonCode 행 upsert
  - PASS 시 `runWfo()` 내부 또는 호출부에서 호출
- 신규/갱신 테스트

## Deliverables
- `WfoResult` 타입 확장:
  ```
  passed: boolean         — OOS expectancy > 0 AND overall efficiency > 0.5
  gateReason: string      — "PASS" | "FAIL:no_valid_windows" | "FAIL:oos_expectancy_lte_0" | "FAIL:efficiency_lte_0.5"
  ```
- 게이트 로직 (`runWfo()` 반환 직전):
  - 유효 윈도우 없음 → `passed = false`, reason = `"FAIL:no_valid_windows"`
  - 평균 OOS expectancy ≤ 0 → `passed = false`, reason = `"FAIL:oos_expectancy_lte_0"`
  - `overallEfficiency` ≤ 0.5 → `passed = false`, reason = `"FAIL:efficiency_lte_0.5"`
  - 그 외 → `passed = true`, reason = `"PASS"`
- `WfoDeps` 에 `updateConfig?: (params: ParamSet) => Promise<void>` 추가 (옵셔널)
- PASS + `deps.updateConfig` 존재 시 → `bestParams`로 `updateConfig()` 호출
- FAIL 시 → `log.warn("WFO gate FAIL", { gateReason })` (경고 로그), updateConfig 호출 없음
- `src/config/loader.ts` 또는 신규 `src/config/updater.ts`:
  - `updateCommonCode(db, groupCode, code, value)` 함수 — DB upsert (INSERT … ON CONFLICT DO UPDATE)
- 로거: `createLogger("wfo")` 사용

## Constraints
- `runWfo()` 시그니처 변경 없음 — `WfoDeps`에 옵셔널 필드 추가만 허용
- ANCHOR 그룹의 CommonCode는 수정하지 않음 (`AnchorModificationError` 가드)
- `updateConfig`가 undefined이면 PASS여도 CommonCode 갱신 생략 (dry-run 지원)
- Decimal.js 사용: expectancy, efficiency 비교에 `Decimal.greaterThan()` 사용
- 게이트 평가는 `runWfo()` 내부에서 수행 — 호출부 의존 없음

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/backtest/wfo.ts`: `WfoResult` 에 `passed`, `gateReason` 추가
4. `runWfo()` 반환 직전에 게이트 평가 로직 삽입
5. `WfoDeps` 에 `updateConfig` 옵셔널 추가
6. PASS 분기: `deps.updateConfig?.(bestParams)` 호출
7. FAIL 분기: `log.warn(...)` 호출
8. `src/config/loader.ts` (또는 `src/config/updater.ts`): `updateCommonCode()` 함수 추가
9. Run tests — confirm all pass (GREEN phase)
10. `bun run typecheck && bun run lint`
11. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [ ] OOS avg expectancy > 0 AND overallEfficiency > 0.5 → `result.passed === true`
- [ ] OOS avg expectancy ≤ 0 → `result.passed === false`, `gateReason` 포함 `"oos_expectancy"`
- [ ] overallEfficiency ≤ 0.5 → `result.passed === false`, `gateReason` 포함 `"efficiency"`
- [ ] 유효 윈도우 0 → `result.passed === false`, `gateReason` 포함 `"no_valid_windows"`
- [ ] PASS + `deps.updateConfig` 존재 → `updateConfig(bestParams)` 호출됨
- [ ] FAIL + `deps.updateConfig` 존재 → `updateConfig` 호출되지 않음
- [ ] `deps.updateConfig` 없음 (dry-run) → PASS여도 DB 갱신 없음, 에러 없음
- [ ] FAIL 시 `log.warn` 호출됨
- [ ] 기존 `WfoResult.windows`, `overallEfficiency`, `bestParams` 필드 유지
- [ ] `bun run typecheck` PASS

## Test Scenarios
- runWfo() with all windows having OOS expectancy>0 and efficiency>0.5 → result.passed === true
- runWfo() with all windows having OOS expectancy=0 → result.passed === false with oos_expectancy reason
- runWfo() with windows having efficiency=0.3 (≤0.5) → result.passed === false with efficiency reason
- runWfo() with no valid IS windows → result.passed === false with no_valid_windows reason
- runWfo() PASS case with updateConfig dep → updateConfig called with bestParams
- runWfo() FAIL case with updateConfig dep → updateConfig NOT called
- runWfo() PASS case without updateConfig dep → no error thrown
- runWfo() FAIL case → log.warn invoked (spy on logger)
- WfoResult has passed and gateReason fields
- updateCommonCode() upserts DB row for given groupCode, code, value
- updateCommonCode() with ANCHOR groupCode → throws AnchorModificationError

## Validation
```bash
bun test src/backtest/wfo.test.ts
bun test src/config/
bun run typecheck
bun run lint
```

## Out of Scope
- WFO CLI 연결 (`saveResult`) → T-19-006
- WFO 튜닝 파라미터 화이트리스트 → T-19-006
- CommonCode 웹 수정 API → T-19-009
- Slack 알림 (PASS/FAIL WFO 결과) — 추후 에픽
- dry-run CLI 플래그 (호출부 책임)
