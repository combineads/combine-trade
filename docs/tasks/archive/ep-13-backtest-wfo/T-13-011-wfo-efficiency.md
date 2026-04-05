# T-13-011 WFO 효율성 검증 & 보고

## Goal
IS에서 찾은 최적 파라미터를 OOS 구간에서 검증하고 WFO 효율성(OOS expectancy / IS expectancy)을 계산하여 보고한다.

## Why
WFO의 목적은 과적합 방지. IS 최적 파라미터가 OOS에서도 유효한지 확인하는 것이 전략 신뢰도의 핵심. PRODUCT.md: "WFO efficiency > 0.5".

## Inputs
- `src/backtest/wfo.ts` — WfoWindow
- `src/backtest/param-search.ts` — runParameterSearch, ParamResult
- `src/backtest/engine.ts` — BacktestRunner
- `src/backtest/metrics.ts` — calcFullMetrics
- `src/backtest/reporter.ts` — saveReport

## Dependencies
- T-13-008, T-13-009, T-13-010

## Expected Outputs
- `src/backtest/wfo.ts` 업데이트 — `runWfo()` 함수
- `WfoResult` 타입 (windows, overallEfficiency, bestParams)
- DB에 WFO 결과 저장 (parent + 자식 구간)

## Deliverables
- `src/backtest/wfo.ts` (업데이트)

## Constraints
- WFO 효율성 = OOS expectancy / IS expectancy (IS expectancy > 0인 경우)
- IS expectancy ≤ 0이면 해당 윈도우 skip
- 전체 WFO 효율성 = 모든 유효 윈도우 효율성 평균
- 기준: > 0.5이면 전략 유효 판단 (보고서에 명시)
- DB 저장: 상위 run_type=WFO (parent), 각 구간 window_index로 연결

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `WfoResult`, `WfoWindowResult` 타입 정의
4. `runWfo(config, db)` 구현:
   a. generateWfoWindows() → 윈도우 목록
   b. 각 윈도우: IS → runParameterSearch() → 최적 파라미터
   c. 각 윈도우: OOS → 최적 파라미터로 백테스트 → expectancy
   d. 효율성 = OOS/IS expectancy
5. 전체 WFO 효율성 = 유효 윈도우 평균
6. DB 저장: parent backtest + 각 구간 backtest (parent_id로 연결)
7. CLI 출력: 윈도우별 IS/OOS expectancy, 효율성, 전체 효율성
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 각 윈도우에서 IS expectancy > 0이면 OOS 검증 수행
- WFO 효율성이 0~∞ 범위로 계산됨
- DB에 parent + 자식 구간이 parent_id로 연결되어 저장됨
- CLI에 효율성 > 0.5 여부 표시

## Test Scenarios
- runWfo(2 windows) with IS expectancy [1.5, 2.0], OOS expectancy [0.9, 1.2] → 효율성 [0.6, 0.6], 전체 0.6
- IS expectancy = 0인 윈도우 → skip, 유효 윈도우에서만 평균
- 모든 윈도우 IS expectancy ≤ 0 → 전체 효율성 0, 경고 메시지
- DB 저장 후 SELECT: parent 1행 (run_type=WFO), 자식 N행 (parent_id 연결)
- 전체 효율성 > 0.5 → "전략 유효" 표시
- 전체 효율성 ≤ 0.5 → "과적합 의심" 경고

## Validation
```bash
bun run typecheck
bun test -- --grep "runWfo|wfoEfficiency"
```

## Out of Scope
- Worker thread 병렬화 (T-13-012)
- CLI 인터페이스 (T-13-013)
