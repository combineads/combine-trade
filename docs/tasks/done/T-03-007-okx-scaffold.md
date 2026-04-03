# T-03-007 exchanges/okx.ts — OKX 어댑터 스캐폴드

## Goal
OkxAdapter 스캐폴드를 생성한다. ExchangeAdapter 인터페이스를 구현하되, 모든 메서드는 ExchangeNotImplementedError를 throw한다.

## Why
Phase 2 거래소인 OKX의 어댑터 구조를 미리 확보한다. 인터페이스 컴파일 통과를 보장하여 ExchangeAdapterFactory에서 모든 거래소를 동일하게 다룰 수 있게 한다.

## Inputs
- `src/exchanges/base.ts` (T-03-001) — BaseExchangeAdapter, ExchangeNotImplementedError
- `src/core/ports.ts` — ExchangeAdapter 인터페이스
- CCXT OKX API 특이사항 (레이트리밋: 60 req/2s)

## Dependencies
T-03-001

## Expected Outputs
- `src/exchanges/okx.ts` — OkxAdapter 클래스 (모든 메서드 NotImplemented)
- Phase 2에서 실제 구현으로 교체

## Deliverables
- `src/exchanges/okx.ts`

## Constraints
- BaseExchangeAdapter 상속
- exchangeType = 'okx' (CCXT OKX Swap)
- 모든 메서드: `throw new ExchangeNotImplementedError('okx', methodName)`
- OKX 특이사항 주석으로 기록: 레이트리밋 60req/2s, 계약 단위(contractSize) 차이

## Steps
1. OkxAdapter 클래스 생성 (extends BaseExchangeAdapter)
2. exchangeType = 'okx' 설정
3. 모든 ExchangeAdapter 메서드 오버라이드 → ExchangeNotImplementedError
4. OKX 특이사항 주석 추가
5. 테스트 작성
6. typecheck 통과 확인

## Acceptance Criteria
- OkxAdapter가 ExchangeAdapter 인터페이스 구현 (bun run typecheck 통과)
- 모든 메서드 호출 시 ExchangeNotImplementedError throw
- CCXT 인스턴스가 'okx'로 생성됨
- OKX 특이사항이 코드 주석으로 기록됨

## Test Scenarios
- OkxAdapter 생성 → CCXT okx 인스턴스 생성 확인
- fetchBalance() → ExchangeNotImplementedError('okx', 'fetchBalance')
- createOrder() → ExchangeNotImplementedError('okx', 'createOrder')
- watchOHLCV() → ExchangeNotImplementedError('okx', 'watchOHLCV')
- setLeverage() → ExchangeNotImplementedError('okx', 'setLeverage')

## Validation
```bash
bun run typecheck
bun test --grep "okx"
```

## Out of Scope
- OKX 메서드 실제 구현 (Phase 2)
- OKX testnet 통합 테스트

## Implementation Notes
- Created `src/exchanges/okx.ts` — OkxAdapter extends BaseExchangeAdapter with `exchangeName = 'okx'`
- Uses CCXT exchange type `'okx'` (unified Swap market); rate limiter set to 30 req/s (60 req/2s)
- All 10 ExchangeAdapter methods throw `ExchangeNotImplementedError(this.exchangeName, '<method>')`
- OKX-specific comments document rate limit (60 req/2s) and contractSize differences per symbol
- Exported from `src/exchanges/index.ts`
- 19 tests written covering instantiation, CCXT id verification, all stub methods, and error properties
- All 19 okx tests pass; pre-existing failures in binance.test.ts (3) are unrelated to this task
