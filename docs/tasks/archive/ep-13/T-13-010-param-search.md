# T-13-010 WFO 파라미터 탐색 루프 (Grid + Random 2단계)

## Goal
WFO의 IS 구간에서 최적 파라미터를 탐색하는 2단계(Grid → Random) 탐색 엔진을 구현한다.

## Why
WFO 핵심 로직. CommonCode 튜닝 파라미터의 최적 조합을 찾아 OOS에서 검증해야 전략 신뢰도 확보 가능.

## Inputs
- `docs/exec-plans/13-backtest-wfo.md` — 파라미터 탐색 전략 테이블
- `src/backtest/engine.ts` — BacktestRunner
- `src/backtest/metrics.ts` — calcFullMetrics
- `src/config/loader.ts` — CommonCode 읽기

## Dependencies
- T-13-005, T-13-006, T-13-009

## Expected Outputs
- `src/backtest/param-search.ts` — `gridSearch()`, `randomSearch()`, `runParameterSearch()` 함수
- `ParamSpace` 타입 (파라미터 범위 정의)
- `ParamResult` 타입 (조합별 결과)

## Deliverables
- `src/backtest/param-search.ts`

## Constraints
- Grid search: KNN(top_k), POSITION(max_pyramid_count), LOSS_LIMIT, SLIPPAGE, TIME_DECAY
- Random search: FEATURE_WEIGHT 그룹 (top 5 조합)
- ANCHOR 그룹은 절대 변경 금지 (애플리케이션 레벨 보호)
- 각 조합마다 BacktestRunner로 IS 구간 백테스트 → expectancy 기준 정렬
- 결과는 expectancy DESC 정렬

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `ParamSpace` 타입 정의 (paramGroup, code, min, max, step)
4. `ParamResult` 타입 정의 (params, metrics)
5. `generateGridCombinations(spaces: ParamSpace[]): ParamSet[]` — 모든 조합 생성
6. `generateRandomCombinations(spaces: ParamSpace[], n: number): ParamSet[]` — n개 랜덤 샘플
7. `gridSearch(runner, isWindow, spaces)` — Grid 탐색 → ParamResult[]
8. `randomSearch(runner, isWindow, spaces, topN)` — Random 탐색 → ParamResult[]
9. `runParameterSearch(runner, isWindow)` — 2단계 통합: Grid → 상위 N개 기반 Random
10. ANCHOR 그룹 필터 — CommonCode에서 ANCHOR 그룹 파라미터 제외 검증
11. Run tests — confirm all pass (GREEN phase)
12. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- Grid 조합 수: ~500 (에픽 추정치와 일치)
- Random 조합 수: ~100
- ANCHOR 그룹 파라미터가 탐색 대상에서 제외됨
- 결과가 expectancy DESC 정렬

## Test Scenarios
- generateGridCombinations([{min:1, max:3, step:1}]) → [{1}, {2}, {3}] (3개)
- generateGridCombinations with 2 params (3×4) → 12개 조합
- generateRandomCombinations(spaces, 5) → 정확히 5개 조합
- ANCHOR 그룹 ParamSpace 포함 시 → 에러 또는 필터링
- gridSearch(runner, window, spaces) → ParamResult 배열, expectancy DESC 정렬
- runParameterSearch() → Grid 결과 + Random 결과 통합, 최고 expectancy 조합 반환

## Validation
```bash
bun run typecheck
bun test -- --grep "paramSearch|gridSearch|randomSearch"
```

## Out of Scope
- Worker thread 병렬화 (T-13-012)
- WFO 효율성 계산 (T-13-011)
- OOS 검증 (T-13-011)
