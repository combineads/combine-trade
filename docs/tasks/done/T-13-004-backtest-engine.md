# T-13-004 BacktestRunner 기본 루프

## Goal
캔들을 시간순으로 순회하며 각 캔들에 대해 콜백을 호출하는 BacktestRunner 기본 엔진을 구현한다.

## Why
백테스트의 핵심은 히스토리 캔들을 시뮬레이션 시간 순서대로 처리하는 루프. 이 루프가 있어야 파이프라인 연결(T-13-005)이 가능.

## Inputs
- `src/backtest/mock-adapter.ts` — MockExchangeAdapter
- `src/db/schema.ts` — candleTable, backtestTable
- `src/core/types.ts` — Candle, Timeframe

## Dependencies
- T-13-001, T-13-002

## Expected Outputs
- `src/backtest/engine.ts` — BacktestRunner 클래스
- `BacktestConfig`, `BacktestResult` 타입
- `BacktestTrade` 타입 (개별 거래 기록)

## Deliverables
- `src/backtest/engine.ts`

## Constraints
- 캔들은 DB에서 로드 (candles 테이블)
- 멀티 타임프레임: 1D, 1H, 5M, 1M 모두 순회 (시간순 정렬, 동일 시각이면 상위 TF 우선)
- MockAdapter.advanceTime()으로 시간 전진
- MockAdapter.checkPendingOrders()로 SL/TP 체결 확인
- 개별 거래(BacktestTrade)를 메모리에 수집 (DB 저장 안 함)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `BacktestConfig` 타입 정의 (symbol, exchange, startDate, endDate, slippagePct)
4. `BacktestTrade` 타입 정의 (entryPrice, exitPrice, direction, pnl, holdDuration 등)
5. `BacktestResult` 타입 정의 (trades: BacktestTrade[], startDate, endDate)
6. BacktestRunner 클래스 구현 — constructor(config, db)
7. `loadCandles()` — DB에서 기간 내 캔들 로드, 타임프레임별 분리
8. `run(onCandleClose)` — 멀티 TF 캔들을 시간순 정렬 → 순회 → MockAdapter 시간 전진 → 콜백 호출
9. 캔들 정렬: open_time ASC, TF 우선순위 (1D > 1H > 5M > 1M)
10. Run tests — confirm all pass (GREEN phase)
11. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- DB에서 기간 내 캔들을 모든 타임프레임으로 로드
- 캔들이 시간순으로 순회됨 (동일 시각 시 상위 TF 우선)
- 각 캔들마다 onCandleClose 콜백 호출
- MockAdapter.advanceTime()이 매 캔들마다 호출됨

## Test Scenarios
- BacktestRunner.loadCandles(2024-01-01, 2024-01-02) → 해당 기간 캔들만 로드
- run() with 3 candles → onCandleClose가 3번 호출됨
- 멀티 TF 캔들 정렬: 같은 open_time의 1D, 1H, 5M → 1D가 먼저 처리
- run() 후 MockAdapter.currentTimestamp === 마지막 캔들 시각
- 빈 기간으로 run() → onCandleClose 호출 0번, 빈 결과 반환
- 시작일 > 종료일 → 에러

## Validation
```bash
bun run typecheck
bun test -- --grep "BacktestRunner"
```

## Out of Scope
- 파이프라인 연결 (T-13-005)
- 메트릭 계산 (T-13-006, T-13-007)
- CLI (T-13-013)
