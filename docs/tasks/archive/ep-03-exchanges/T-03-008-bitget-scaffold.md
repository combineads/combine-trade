# T-03-008 exchanges/bitget.ts — Bitget 어댑터 스캐폴드

## Goal
BitgetAdapter 스캐폴드를 생성한다. ExchangeAdapter 인터페이스를 구현하되, 모든 메서드는 ExchangeNotImplementedError를 throw한다.

## Why
Phase 3 거래소인 Bitget의 어댑터 구조를 미리 확보한다. ExchangeAdapterFactory에서 모든 거래소를 동일하게 다룰 수 있게 한다.

## Inputs
- `src/exchanges/base.ts` (T-03-001) — BaseExchangeAdapter, ExchangeNotImplementedError
- `src/core/ports.ts` — ExchangeAdapter 인터페이스
- CCXT Bitget API 특이사항 (레이트리밋: 20 req/s)

## Dependencies
T-03-001

## Expected Outputs
- `src/exchanges/bitget.ts` — BitgetAdapter 클래스 (모든 메서드 NotImplemented)
- Phase 3에서 실제 구현으로 교체

## Deliverables
- `src/exchanges/bitget.ts`

## Constraints
- BaseExchangeAdapter 상속
- exchangeType = 'bitget'
- 모든 메서드: `throw new ExchangeNotImplementedError('bitget', methodName)`
- Bitget 특이사항 주석: 레이트리밋 20req/s, productType 설정 필요

## Steps
1. BitgetAdapter 클래스 생성 (extends BaseExchangeAdapter)
2. exchangeType = 'bitget' 설정
3. 모든 ExchangeAdapter 메서드 오버라이드 → ExchangeNotImplementedError
4. Bitget 특이사항 주석 추가
5. 테스트 작성
6. typecheck 통과 확인

## Acceptance Criteria
- BitgetAdapter가 ExchangeAdapter 인터페이스 구현 (bun run typecheck 통과)
- 모든 메서드 호출 시 ExchangeNotImplementedError throw
- CCXT 인스턴스가 'bitget'으로 생성됨

## Test Scenarios
- BitgetAdapter 생성 → CCXT bitget 인스턴스 생성 확인
- fetchBalance() → ExchangeNotImplementedError('bitget', 'fetchBalance')
- createOrder() → ExchangeNotImplementedError('bitget', 'createOrder')
- watchOHLCV() → ExchangeNotImplementedError('bitget', 'watchOHLCV')

## Validation
```bash
bun run typecheck
bun test --grep "bitget"
```

## Out of Scope
- Bitget 메서드 실제 구현 (Phase 3)
- Bitget testnet 통합 테스트
