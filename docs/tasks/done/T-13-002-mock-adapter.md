# T-13-002 MockExchangeAdapter 구현

## Goal
ExchangeAdapter 인터페이스를 구현하는 MockExchangeAdapter를 작성한다. 히스토리 캔들을 시간순으로 공급하고, 주문을 현재 close 가격으로 즉시 체결 시뮬레이션하며, lookahead bias를 방지한다.

## Why
백테스트가 라이브 파이프라인과 동일한 코드 경로를 사용하려면 ExchangeAdapter 인터페이스를 구현하는 Mock이 필요. lookahead 방지가 백테스트 신뢰도의 핵심.

## Inputs
- `src/core/ports.ts` — ExchangeAdapter 인터페이스
- `src/core/types.ts` — Candle, Exchange, Direction 등 타입
- `docs/exec-plans/13-backtest-wfo.md` — Decision log (비거래 메서드 처리 방침)

## Dependencies
- T-13-001 (BacktestRow 타입 필요)

## Expected Outputs
- `src/backtest/mock-adapter.ts` — MockExchangeAdapter 클래스
- `MockAdapterConfig` 타입 (초기 잔액, 심볼 정보 등)

## Deliverables
- `src/backtest/mock-adapter.ts`

## Constraints
- ExchangeAdapter 인터페이스의 모든 메서드 구현
- `fetchOHLCV`: 현재 타임스탬프 이전 캔들만 반환 (lookahead 방지)
- `createOrder`: 시장가 = 현재 close 가격 체결, 지정가/stop_market = 가격 조건 충족 시 체결
- `watchOHLCV`: no-op (백테스트는 캔들 순회 방식)
- `fetchBalance`: 설정 가능한 초기 잔액 - 사용액
- `setLeverage`: no-op (기록만)
- `getExchangeInfo`: 하드코딩된 심볼 정보 반환
- 모든 가격 계산은 Decimal.js

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `MockAdapterConfig` 타입 정의 (initialBalance, symbolInfo, candles)
4. MockExchangeAdapter 클래스 구현 — 내부 상태: currentTimestamp, balance, positions, orders
5. `fetchOHLCV` 구현 — timestamp 필터링으로 lookahead 방지
6. `createOrder` 구현 — 시장가 즉시 체결 (현재 close), reduceOnly 지원
7. `fetchPositions`, `fetchBalance` 구현
8. 비거래 메서드 stub: watchOHLCV (no-op), setLeverage (no-op), getExchangeInfo (하드코딩)
9. `advanceTime(timestamp)` 메서드 — BacktestRunner가 캔들 순회 시 호출
10. Run tests — confirm all pass (GREEN phase)
11. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- ExchangeAdapter 인터페이스 타입 체크 통과
- `fetchOHLCV` 호출 시 currentTimestamp 이후 캔들 반환 안 함
- `createOrder` market 주문 = 현재 close 가격 체결
- `fetchBalance` = initialBalance - 사용액
- `advanceTime`으로 시간 전진 가능

## Test Scenarios
- MockAdapter 생성 후 fetchOHLCV() → currentTimestamp 이전 캔들만 반환
- advanceTime(future) 후 fetchOHLCV() → 새로 포함된 캔들까지 반환
- createOrder(market, BUY) → 현재 close 가격으로 FILLED 반환, balance 차감
- createOrder(market, SELL, reduceOnly) → 포지션 크기 감소, balance 증가
- fetchBalance() 초기 상태 → initialBalance 반환
- createOrder 후 fetchPositions() → 생성된 포지션 반환
- fetchOHLCV with since parameter → since 이후 & currentTimestamp 이전 캔들만 반환

## Validation
```bash
bun run typecheck
bun test -- --grep "MockExchangeAdapter"
```

## Out of Scope
- 슬리피지 시뮬레이션 (T-13-003)
- 지정가/stop_market 복잡 체결 로직 (T-13-003)
- 수수료 시뮬레이션
