# T-03-004 exchanges/binance.ts — SL 등록 & 레버리지 설정

## Goal
BinanceAdapter의 setLeverage() 구현 및 stop-market 주문을 통한 SL 등록 지원을 구현한다. CreateOrderParams.type을 확장하여 'stop_market' 타입을 추가한다.

## Why
ARCHITECTURE.md: "SL must be registered on the exchange before any other post-entry action." SL 등록 실패 시 3회 재시도 후 즉시 포지션 청산이 필요하다. 레버리지는 주문 전에 거래소에 설정해야 한다. 이 두 작업은 안전한 포지션 관리의 핵심 전제조건이다.

## Inputs
- `src/exchanges/binance.ts` (T-03-002, T-03-003) — BinanceAdapter 기존 코드
- `src/core/ports.ts` — ExchangeAdapter.setLeverage() (T-03-001에서 추가)
- `src/core/ports.ts` — CreateOrderParams (type 확장 필요)
- CCXT Binance setLeverage API

## Dependencies
T-03-001, T-03-003

## Expected Outputs
- `src/exchanges/binance.ts` — setLeverage() 구현, stop_market 주문 지원
- `src/core/ports.ts` — CreateOrderParams.type에 'stop_market' 추가
- EP-06(orders)에서 SL 등록, EP-05(positions)에서 레버리지 설정에 사용

## Deliverables
- `src/exchanges/binance.ts` (기존 파일에 추가)
- `src/core/ports.ts` (CreateOrderParams.type 확장)

## Constraints
- setLeverage(): CCXT exchange.setLeverage() 래핑
- stop_market 주문: CCXT createOrder with type='STOP_MARKET', stopPrice 설정
- SL 주문은 reduceOnly=true (포지션 축소만)
- SL 등록 실패 시 withRetry 3회 재시도
- 레버리지 max cap (38x)은 positions 모듈 담당 — 어댑터는 거래소에 그대로 전달

## Steps
1. `src/core/ports.ts` — CreateOrderParams.type에 'stop_market' 추가:
   - `type: "market" | "limit" | "stop_market"`
   - stop_market 시 price 필드를 trigger price로 사용
2. setLeverage() 구현:
   - CCXT exchange.setLeverage(leverage, symbol) 호출
   - 에러 매핑 적용
3. createOrder() 확장 — stop_market 타입 처리:
   - CCXT createOrder에 type='STOP_MARKET', stopPrice 전달
   - reduceOnly=true 강제 (SL은 항상 포지션 축소)
4. SL 등록 후 확인 로직: fetchOrder()로 SL 주문 상태 조회
5. 테스트 작성
6. typecheck, lint 통과 확인

## Acceptance Criteria
- setLeverage(10, 'BTCUSDT') → 성공 시 void
- setLeverage() 실패 시 도메인 에러 throw
- createOrder({ type: 'stop_market', price: slPrice, side: 'SELL', reduceOnly: true }) → SL 주문 생성
- SL 주문의 reduceOnly가 항상 true
- stop_market 주문 생성 후 fetchOrder()로 존재 확인 가능
- CreateOrderParams.type이 'market' | 'limit' | 'stop_market'으로 확장
- `bun run typecheck` 통과

## Test Scenarios
- setLeverage(10, 'BTCUSDT') → CCXT setLeverage 호출 확인, void 반환
- setLeverage() 네트워크 에러 → withRetry 재시도 후 성공
- setLeverage() 3회 실패 → ExchangeNetworkError throw
- createOrder stop_market → CCXT에 type='STOP_MARKET', stopPrice 전달 확인
- createOrder stop_market → reduceOnly=true 강제 확인
- createOrder stop_market → OrderResult 반환 (orderId, status)
- SL 주문 후 fetchOrder → 주문 존재 확인
- CreateOrderParams type='stop_market'이 타입 체크 통과

## Validation
```bash
bun run typecheck
bun test --grep "binance.*(sl|leverage|stop)"
```

## Out of Scope
- 레버리지 상한 검증 (positions 모듈, EP-06)
- SL 등록 실패 시 포지션 청산 로직 (orders 모듈, EP-06)
- SL 본절 이동 로직 (exits 모듈, EP-07)
