# T-13-003 슬리피지 시뮬레이션 & 비거래 메서드 정교화

## Goal
MockExchangeAdapter에 슬리피지 시뮬레이션을 추가하고, stop_market/limit 주문 체결 로직을 정교화한다.

## Why
백테스트 결과의 현실성을 높이려면 슬리피지 반영이 필수. 라이브에서는 SL이 stop_market으로 등록되므로 이를 시뮬레이션해야 정확한 결과 산출 가능.

## Inputs
- `src/backtest/mock-adapter.ts` — T-13-002에서 구현한 MockExchangeAdapter
- `src/orders/slippage.ts` — SlippageConfig 타입 참조

## Dependencies
- T-13-002

## Expected Outputs
- `src/backtest/mock-adapter.ts` 업데이트 — 슬리피지, pending orders 로직 추가

## Deliverables
- `src/backtest/mock-adapter.ts` (업데이트)

## Constraints
- 슬리피지는 설정 가능 (기본: 0, 퍼센트 기반)
- stop_market 주문은 pending으로 등록 → 캔들 가격이 trigger에 도달하면 체결
- `cancelOrder`, `editOrder` pending 주문에 대해 동작
- Decimal.js 사용

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. MockAdapterConfig에 `slippagePct` 옵션 추가
4. `createOrder` market 체결 시 slippage 적용 (BUY: +slippage, SELL: -slippage)
5. `createOrder` stop_market → pendingOrders 배열에 등록, PENDING 반환
6. `checkPendingOrders(currentCandle)` — 캔들 high/low가 trigger 도달 시 체결
7. `cancelOrder` — pendingOrders에서 제거
8. `editOrder` — pending 주문의 price/size 변경
9. Run tests — confirm all pass (GREEN phase)
10. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- slippagePct=0.1% 설정 시 market BUY 체결가 = close × 1.001
- stop_market 주문이 PENDING → 가격 도달 시 FILLED
- cancelOrder로 pending 주문 취소 가능
- editOrder로 pending 주문 가격 변경 가능

## Test Scenarios
- createOrder(market, BUY) with slippagePct=0.1 → filledPrice = close × 1.001
- createOrder(market, SELL) with slippagePct=0.1 → filledPrice = close × 0.999
- createOrder(stop_market, stopLoss=100) → status PENDING
- checkPendingOrders(candle with low=99) → SL triggered, FILLED
- checkPendingOrders(candle with low=101) → SL not triggered, still PENDING
- cancelOrder(pendingOrderId) → order removed, fetchOrder returns CANCELLED
- editOrder(pendingOrderId, newPrice) → trigger price updated

## Validation
```bash
bun run typecheck
bun test -- --grep "slippage|pending"
```

## Out of Scope
- 수수료 시뮬레이션
- 부분 체결 시뮬레이션
- 유동성 부족 시뮬레이션
