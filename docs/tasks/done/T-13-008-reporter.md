# T-13-008 결과 리포터 (CLI 출력 & DB 저장)

## Goal
백테스트 결과를 CLI 테이블로 출력하고 backtests DB 테이블에 저장하는 리포터를 구현한다.

## Why
결과를 사람이 읽을 수 있는 형태로 출력하고, 실행 이력을 DB에 보존하여 비교 분석 가능하게 함.

## Inputs
- `src/backtest/metrics.ts` — FullMetrics 타입
- `src/backtest/engine.ts` — BacktestResult, BacktestConfig 타입
- `src/db/schema.ts` — backtestTable

## Dependencies
- T-13-001, T-13-006, T-13-007

## Expected Outputs
- `src/backtest/reporter.ts` — `printReport()`, `saveReport()` 함수

## Deliverables
- `src/backtest/reporter.ts`

## Constraints
- CLI 출력: 메트릭 요약 테이블 (콘솔 포매팅, 정렬)
- DB 저장: backtests 테이블에 run_type='BACKTEST', config_snapshot, results(jsonb) 저장
- config_snapshot에 백테스트 설정 전체 스냅샷
- results에 FullMetrics를 jsonb로 직렬화

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `printReport(config, metrics, trades)` — CLI 테이블 출력
4. 메트릭 포맷팅: 승률 %, 기대값, MDD %, 샤프, 프로핏팩터
5. 거래별 상세 출력 (옵션, 기본 off)
6. `saveReport(db, config, metrics)` — backtests INSERT
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- printReport() 호출 시 콘솔에 메트릭 테이블 출력
- saveReport() 후 backtests 테이블에 1행 삽입
- 저장된 results jsonb에 totalTrades, winRate, expectancy, maxDrawdown, sharpeRatio, profitFactor 포함

## Test Scenarios
- printReport(config, metrics, trades) → stdout에 테이블 포함 (총 거래, 승률, 기대값, MDD 행 존재)
- saveReport(db, config, metrics) → backtests 테이블 SELECT → 1행 존재
- 저장된 행의 run_type === 'BACKTEST'
- 저장된 행의 config_snapshot에 symbol, startDate, endDate 포함
- 저장된 행의 results에 winRate, expectancy 키 포함

## Validation
```bash
bun run typecheck
bun test -- --grep "reporter|printReport|saveReport"
```

## Out of Scope
- WFO 결과 저장 (T-13-011)
- 시각화/차트 (Non-goal)
