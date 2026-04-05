# T-13-007 고급 메트릭 (샤프 비율, 프로핏 팩터)

## Goal
백테스트 결과에서 샤프 비율(Sharpe Ratio)과 프로핏 팩터(Profit Factor)를 계산하는 함수를 추가한다.

## Why
샤프 비율은 리스크 대비 수익을 정량화, 프로핏 팩터는 총 이익/총 손실로 전략의 안정성을 판단하는 핵심 지표.

## Inputs
- `src/backtest/metrics.ts` — 기존 메트릭 모듈
- `src/backtest/engine.ts` — BacktestTrade 타입

## Dependencies
- T-13-006

## Expected Outputs
- `src/backtest/metrics.ts` 업데이트 — `calcAdvancedMetrics()` 함수
- `AdvancedMetrics` 타입 (sharpeRatio, profitFactor, avgHoldDuration, maxConsecutiveWins, maxConsecutiveLosses)
- `FullMetrics` = BasicMetrics & AdvancedMetrics

## Deliverables
- `src/backtest/metrics.ts` (업데이트)

## Constraints
- Decimal.js 사용
- 샤프 비율 = mean(returns) / std(returns) × sqrt(252) (연율화, 일간 수익률 기반)
- 프로핏 팩터 = totalGrossProfit / totalGrossLoss (손실 0이면 Infinity → Decimal MAX 사용)
- 거래 0건 시 샤프=0, 프로핏팩터=0

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `AdvancedMetrics` 타입 정의
4. `calcAdvancedMetrics(trades: BacktestTrade[]): AdvancedMetrics` 구현
5. 일간 PnL 시리즈 구성 → 샤프 비율 계산
6. 총 이익/총 손실 → 프로핏 팩터 계산
7. 연속 승/패 카운트
8. `calcFullMetrics()` = calcBasicMetrics + calcAdvancedMetrics
9. Run tests — confirm all pass (GREEN phase)
10. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 샤프 비율이 연율화 적용
- 프로핏 팩터가 손실 0일 때 안전하게 처리
- calcFullMetrics()가 BasicMetrics + AdvancedMetrics 모두 반환

## Test Scenarios
- calcAdvancedMetrics([]) → sharpeRatio=0, profitFactor=0
- 일관된 양수 PnL 거래 → sharpeRatio > 0, profitFactor > 1
- 모든 거래 LOSS → profitFactor = 0 (이익 없음)
- 모든 거래 WIN → profitFactor = Decimal MAX (손실 없음)
- 3 WIN, 2 LOSS, 1 WIN → maxConsecutiveWins=3, maxConsecutiveLosses=2
- calcFullMetrics() → BasicMetrics 필드 + AdvancedMetrics 필드 모두 존재

## Validation
```bash
bun run typecheck
bun test -- --grep "advancedMetrics|sharpe|profitFactor"
```

## Out of Scope
- DB 저장 (T-13-008)
- WFO 효율성 (T-13-011)
