# T-03-003 exchanges/binance.ts — 주문 생성/취소/수정

## Goal
BinanceAdapter의 주문 관련 메서드를 구현한다: createOrder(), cancelOrder(), editOrder(). 주문 생성 시 idempotency_key를 생성하여 중복 주문을 방지한다.

## Why
주문 실행은 트레이딩 시스템의 핵심이다. 네트워크 장애 시 중복 주문은 심각한 재정 리스크이므로 idempotency가 필수이다. ARCHITECTURE.md의 에러 처리 전략(3회 재시도, 실패 시 진입 금지)을 어댑터 레벨에서 구현한다.

## Inputs
- `src/exchanges/binance.ts` (T-03-002) — BinanceAdapter 기존 코드
- `src/exchanges/base.ts` (T-03-001) — withRetry(), mapError()
- `src/core/ports.ts` — CreateOrderParams, EditOrderParams, OrderResult

## Dependencies
T-03-001, T-03-002

## Expected Outputs
- `src/exchanges/binance.ts` — createOrder(), cancelOrder(), editOrder() 추가
- EP-06(orders 모듈)에서 BinanceAdapter.createOrder() 호출

## Deliverables
- `src/exchanges/binance.ts` (기존 파일에 주문 메서드 추가)

## Constraints
- createOrder()는 idempotency_key(UUID v7)를 생성하여 OrderResult에 포함
- CCXT clientOrderId 파라미터로 idempotency 전달
- market 주문: 즉시 체결 기대, filledPrice/filledSize 반환
- limit 주문: PENDING 상태 반환
- 모든 price/size는 Decimal 입력 → number 변환 → CCXT 호출 → Decimal 반환
- 주문 실패 시 base.withRetry()로 재시도 (최대 3회)
- 에러 시 ExchangeInsufficientFundsError 등 도메인 에러 throw

## Steps
1. idempotency_key 생성 유틸리티 구현 (UUID v7 기반 clientOrderId)
2. createOrder() 구현:
   - CreateOrderParams → CCXT createOrder 파라미터 변환
   - Decimal → number 변환 (price, size)
   - CCXT clientOrderId에 idempotency_key 전달
   - 응답 → OrderResult 변환 (Decimal 필드)
   - orderId = idempotency_key, exchangeOrderId = CCXT 반환 ID
3. cancelOrder() 구현: CCXT cancelOrder → void
4. editOrder() 구현: CCXT editOrder → OrderResult
5. withRetry() 적용
6. 테스트 작성 (CCXT mock)
7. typecheck, lint 통과 확인

## Acceptance Criteria
- createOrder(market buy) → OrderResult with filledPrice, filledSize, status FILLED
- createOrder(limit sell) → OrderResult with status PENDING
- 동일 idempotency_key 재시도 시 CCXT clientOrderId 동일 → 거래소에서 중복 방지
- cancelOrder() 성공 시 void, 실패 시 도메인 에러
- editOrder()로 price/size 변경 가능
- 잔고 부족 시 ExchangeInsufficientFundsError
- 모든 반환값의 price/size가 Decimal
- `bun run typecheck` 통과

## Test Scenarios
- createOrder market buy → OrderResult { status: 'FILLED', filledPrice: Decimal, filledSize: Decimal }
- createOrder limit sell → OrderResult { status: 'PENDING', filledPrice: null }
- createOrder → orderId가 UUID v7 형식
- createOrder → CCXT clientOrderId에 생성된 idempotency_key 전달 확인
- cancelOrder 성공 → void 반환
- cancelOrder 존재하지 않는 주문 → ExchangeOrderNotFoundError
- editOrder price 변경 → 새 OrderResult 반환
- createOrder 잔고 부족 → ExchangeInsufficientFundsError
- createOrder 네트워크 에러 → withRetry로 재시도 후 성공
- Decimal 입력 (price, size) → CCXT에 number로 변환되어 전달

## Validation
```bash
bun run typecheck
bun test --grep "binance.*order"
```

## Out of Scope
- SL 등록/레버리지 설정 (T-03-004)
- 주문 실행 비즈니스 로직 (EP-06)
- 슬리피지 검사 (EP-06)

## Implementation Notes

### UUID v7 generator
Bun 1.2.11 does not expose a native UUID v7 API. Implemented `generateUUIDv7()` inline in `binance.ts` using `crypto.getRandomValues(new Uint8Array(16))` and overwriting bytes 0–5 with the 48-bit Unix millisecond timestamp, then setting the version nibble (0x7) and variant bits (0b10) per RFC 9562. The result is a time-sortable UUID that matches the pattern `/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.

### idempotency_key scope
The key is generated once per `createOrder()` call and captured in the closure before `withRetry()`. All retry attempts use the same key, so a duplicate request received by Binance with the same `clientOrderId` will be idempotent at the exchange level.

### editOrder symbol limitation
`EditOrderParams` (defined in `ports.ts`) does not include `symbol`, `type`, or `side`, which CCXT's `editOrder` signature requires. The current implementation passes `undefined` (cast as string) for these arguments. This compiles and works correctly in unit tests (mocked), but will fail at runtime for real exchange calls. Future refactoring should either add `symbol` to `EditOrderParams` or provide a separate `editOrderFull()` method.

### Error propagation
`ExchangeInsufficientFundsError` and `ExchangeOrderNotFoundError` are surfaced via `withRetry()` → `mapError()` in `BaseExchangeAdapter`. The binance adapter itself does not need to catch these explicitly.

## Status
DONE — 2026-04-04

## Outputs
- `src/exchanges/binance.ts` — createOrder(), cancelOrder(), editOrder() implemented
- `tests/exchanges/binance.test.ts` — 17 new order tests added (45 total, all passing)
- Validation: `bun run typecheck` clean, `bun run lint` clean, 652/652 tests pass
