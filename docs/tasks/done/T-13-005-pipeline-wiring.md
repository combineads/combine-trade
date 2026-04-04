# T-13-005 백테스트 파이프라인 코드 재사용 연결

## Goal
BacktestRunner의 onCandleClose 콜백에서 라이브 파이프라인(PipelineDeps)을 재사용하여 실제 트레이딩 로직을 실행한다.

## Why
백테스트의 핵심 가치는 라이브와 동일한 코드 경로 사용. PipelineDeps DI를 통해 MockAdapter를 주입하면 파이프라인 코드 변경 없이 백테스트 가능.

## Inputs
- `src/daemon/pipeline.ts` — PipelineDeps 타입, handleCandleClose()
- `src/backtest/engine.ts` — BacktestRunner
- `src/backtest/mock-adapter.ts` — MockExchangeAdapter
- 라이브 파이프라인 모듈: indicators, filters, signals, vectors, knn, positions, limits, exits, labeling

## Dependencies
- T-13-002, T-13-003, T-13-004

## Expected Outputs
- `src/backtest/pipeline-adapter.ts` — 백테스트용 PipelineDeps 팩토리
- BacktestRunner에서 파이프라인 실행 → BacktestTrade 수집

## Deliverables
- `src/backtest/pipeline-adapter.ts`
- `src/backtest/engine.ts` 업데이트 (파이프라인 연결)

## Constraints
- PipelineDeps의 모든 의존성을 백테스트 컨텍스트에 맞게 주입
- adapters 맵에 MockExchangeAdapter 주입
- DB 의존성은 실제 DB 사용 (candles, vectors 테이블 읽기)
- 알림(Slack) 비활성화
- executionMode는 'live'로 설정 (실제 주문 실행 시뮬레이션)
- Ticket/Signal/Order는 DB에 저장하지 않고 메모리 수집

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `createBacktestPipelineDeps()` 팩토리 함수 구현
4. PipelineDeps 각 의존성 매핑:
   - adapters: Map(exchange → MockExchangeAdapter)
   - getCandles: MockAdapter.fetchOHLCV 위임
   - 나머지 indicators/signals/knn 등: 실제 모듈 함수 그대로 사용
5. Ticket/Order 저장 함수를 메모리 수집기로 래핑 (DB INSERT 대신 배열 push)
6. Slack 알림을 no-op으로 교체
7. BacktestRunner.run()에서 handleCandleClose → BacktestTrade 변환
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- createBacktestPipelineDeps() 반환값이 PipelineDeps 타입 만족
- 3개 이상 캔들로 run() → handleCandleClose가 매번 호출됨
- 시그널 발생 시 MockAdapter로 주문 → BacktestTrade에 기록
- Slack 알림 미발생

## Test Scenarios
- createBacktestPipelineDeps(mockAdapter, db) → PipelineDeps 타입 체크 통과
- 알려진 시그널 구간 캔들로 run() → 최소 1개 BacktestTrade 수집
- 시그널 없는 구간으로 run() → 빈 trades 배열
- 파이프라인 에러 발생 시 → 에러 로그 후 다음 캔들 계속 진행 (중단 안 함)
- executionMode='live' 확인 → MockAdapter.createOrder가 호출됨

## Validation
```bash
bun run typecheck
bun test -- --grep "pipeline-adapter|BacktestRunner.*pipeline"
```

## Out of Scope
- 메트릭 계산 (T-13-006)
- WFO (T-13-009~011)
- CLI (T-13-013)
