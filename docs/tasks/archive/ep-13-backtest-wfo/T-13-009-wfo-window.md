# T-13-009 WFO 구간 관리 (IS/OOS/롤)

## Goal
Walk-Forward Optimization의 구간 관리 모듈을 구현한다. 전체 기간을 IS(In-Sample)/OOS(Out-of-Sample) 구간으로 분할하고 롤링 윈도우를 생성한다.

## Why
WFO의 기본 구조. 구간이 정확히 분할되어야 IS에서 최적화 → OOS에서 검증하는 프로세스가 작동.

## Inputs
- `docs/exec-plans/13-backtest-wfo.md` — WFO 구간: 6개월 IS / 2개월 OOS / 1개월 롤
- `docs/DATA_MODEL.md` — CommonCode WFO 그룹

## Dependencies
- T-13-004 (BacktestRunner)

## Expected Outputs
- `src/backtest/wfo.ts` — `generateWfoWindows()` 함수
- `WfoWindow` 타입 (isStart, isEnd, oosStart, oosEnd, windowIndex)
- `WfoConfig` 타입 (isMonths, oosMonths, rollMonths, totalStartDate, totalEndDate)

## Deliverables
- `src/backtest/wfo.ts`

## Constraints
- IS: 6개월, OOS: 2개월, 롤: 1개월 (기본값, CommonCode에서 오버라이드 가능)
- 마지막 윈도우의 OOS가 totalEndDate를 초과하면 해당 윈도우 제외
- 구간은 겹침 없이 연속
- 날짜 계산은 UTC 기준

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `WfoConfig`, `WfoWindow` 타입 정의
4. `generateWfoWindows(config: WfoConfig): WfoWindow[]` 구현
5. 시작일부터 rollMonths 간격으로 윈도우 생성
6. 각 윈도우: IS = [start, start+isMonths), OOS = [start+isMonths, start+isMonths+oosMonths)
7. 다음 윈도우: start += rollMonths
8. 마지막 윈도우 OOS가 totalEndDate 초과 시 제외
9. Run tests — confirm all pass (GREEN phase)
10. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 3년 데이터 (2021-01-01 ~ 2024-01-01) → 6개 이상 윈도우 생성
- 각 윈도우의 IS 기간 = 6개월, OOS 기간 = 2개월
- 윈도우 간 롤 = 1개월
- OOS 종료일이 데이터 범위를 벗어나는 윈도우 미생성

## Test Scenarios
- generateWfoWindows(2021-01-01 ~ 2024-01-01, 6/2/1) → 최소 6개 윈도우
- 첫 번째 윈도우: IS=[2021-01-01, 2021-07-01), OOS=[2021-07-01, 2021-09-01)
- 두 번째 윈도우: IS=[2021-02-01, 2021-08-01), OOS=[2021-08-01, 2021-10-01)
- 마지막 윈도우의 OOS 종료일 ≤ totalEndDate
- 데이터 8개월 미만 → 윈도우 0개 (IS+OOS 불가)
- 딱 8개월 → 윈도우 1개

## Validation
```bash
bun run typecheck
bun test -- --grep "wfo.*window|generateWfoWindows"
```

## Out of Scope
- 파라미터 탐색 (T-13-010)
- WFO 효율성 계산 (T-13-011)
