# T-13-006 기본 메트릭 계산 (승률, 기대값, MDD)

## Goal
백테스트 거래 결과 배열에서 총 거래 수, 승률, 기대값, 최대 낙폭(MDD)을 계산하는 메트릭 모듈을 구현한다.

## Why
백테스트 결과의 핵심 판단 지표. PRODUCT.md의 success metrics (expectancy > 0, MDD within tolerance)에 해당.

## Inputs
- `src/backtest/engine.ts` — BacktestTrade 타입
- `src/core/decimal.ts` — Decimal.js 래퍼

## Dependencies
- T-13-004 (BacktestTrade 타입)

## Expected Outputs
- `src/backtest/metrics.ts` — `calcBasicMetrics()` 함수
- `BasicMetrics` 타입 (totalTrades, wins, losses, winRate, expectancy, maxDrawdown, maxDrawdownPct)

## Deliverables
- `src/backtest/metrics.ts`

## Constraints
- 모든 계산은 Decimal.js — `number` 타입 금지
- 승률 = wins / totalTrades
- 기대값(expectancy) = avgWin × winRate - avgLoss × lossRate
- MDD = 최대 누적 고점 대비 낙폭 (equity curve 기반)
- 거래 0건 시 모든 메트릭 0 반환 (에러 아님)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `BasicMetrics` 타입 정의
4. `calcBasicMetrics(trades: BacktestTrade[]): BasicMetrics` 구현
5. 승률, 기대값 계산
6. equity curve 구성 → MDD 계산
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 모든 반환값이 Decimal 타입
- 승률이 0~1 사이
- MDD가 음수 또는 0 (낙폭)
- 빈 trades → 모든 값 0

## Test Scenarios
- calcBasicMetrics([]) → totalTrades=0, winRate=0, expectancy=0, maxDrawdown=0
- 10 trades (7 WIN, 3 LOSS) → winRate=0.7, totalTrades=10
- 모든 거래 WIN → winRate=1.0, expectancy > 0
- 모든 거래 LOSS → winRate=0.0, expectancy < 0
- equity curve [100, 110, 90, 120, 80] → maxDrawdown = 40 (120→80), maxDrawdownPct ≈ 33.3%
- 단조 증가 equity → maxDrawdown=0

## Validation
```bash
bun run typecheck
bun test -- --grep "basicMetrics|calcBasicMetrics"
```

## Out of Scope
- 샤프 비율, 프로핏 팩터 (T-13-007)
- DB 저장 (T-13-008)
- CLI 출력 (T-13-008)
