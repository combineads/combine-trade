# T-03-002 exchanges/binance.ts — BinanceAdapter 읽기 작업

## Goal
BinanceAdapter의 조회 메서드를 구현한다: fetchBalance(), fetchPositions(), fetchOrder(), fetchOHLCV(), getExchangeInfo().

## Why
Binance Futures는 Phase 1 거래소로 가장 먼저 완전 구현된다. 읽기 작업은 주문 작업(T-03-003)의 기반이며, 포지션 조회는 대조(reconciliation)에서도 핵심이다.

## Inputs
- `src/exchanges/base.ts` (T-03-001) — BaseExchangeAdapter, 에러 매핑, Decimal 변환
- `src/core/ports.ts` — ExchangeAdapter, ExchangePosition, OrderResult, ExchangeSymbolInfo 타입
- `src/core/types.ts` — Candle, Exchange 타입
- CCXT Binance Futures API 문서

## Dependencies
T-03-001

## Expected Outputs
- `src/exchanges/binance.ts` — BinanceAdapter 클래스 (조회 메서드)
- EP-04(market-data), EP-06(position-management), EP-08(reconciliation)에서 사용

## Deliverables
- `src/exchanges/binance.ts`

## Constraints
- BaseExchangeAdapter 상속
- CCXT `binanceusdm` (Binance USD-M Futures) 사용
- 모든 반환값의 price/size는 Decimal 타입
- Candle 반환 시 open_time은 Date (CCXT timestamp → Date 변환)
- sandbox 모드 지원 (ExchangeConfig.sandbox)

## Steps
1. `BinanceAdapter extends BaseExchangeAdapter` 클래스 생성
2. `exchangeType = 'binanceusdm'` 설정
3. fetchBalance() 구현: CCXT fetchBalance → { total, available } Decimal
4. fetchPositions() 구현: CCXT fetchPositions → ExchangePosition[] (symbol 필터 선택)
5. fetchOrder() 구현: CCXT fetchOrder → OrderResult
6. fetchOHLCV() 구현: CCXT fetchOHLCV → Candle[] (timestamp → Date, OHLCV → Decimal)
7. getExchangeInfo() 구현: CCXT loadMarkets → ExchangeSymbolInfo (tickSize, minOrderSize 등)
8. 각 메서드에 base.mapError() 에러 처리 적용
9. 테스트 작성 (CCXT mock)
10. typecheck, lint 통과 확인

## Acceptance Criteria
- fetchBalance()가 { total: Decimal, available: Decimal } 반환
- fetchPositions()가 ExchangePosition[]을 Decimal 필드로 반환
- fetchPositions('BTCUSDT')로 특정 심볼만 필터링 가능
- fetchOHLCV()가 Candle[] 반환 (open_time: Date, OHLCV: Decimal)
- getExchangeInfo()가 tickSize, minOrderSize 등을 Decimal로 반환
- fetchOrder()가 존재하지 않는 주문에 ExchangeOrderNotFoundError throw
- sandbox 모드에서 testnet 엔드포인트 사용
- `bun run typecheck` 통과

## Test Scenarios
- fetchBalance() → CCXT mock 응답 { total: 10000, free: 8500 } → { total: Decimal('10000'), available: Decimal('8500') }
- fetchPositions() → CCXT mock 응답 2개 포지션 → ExchangePosition[] 길이 2, 모든 필드 Decimal
- fetchPositions('BTCUSDT') → 해당 심볼 포지션만 반환
- fetchPositions() 빈 배열 → 빈 ExchangePosition[] 반환
- fetchOHLCV('BTCUSDT', '5m', since, 100) → Candle[] 길이 100, open_time이 Date 타입
- fetchOHLCV() CCXT timestamp → Candle.open_time Date 변환 정확성
- getExchangeInfo('BTCUSDT') → tickSize, minOrderSize, maxLeverage, contractSize 포함
- fetchOrder() 존재하는 주문 → OrderResult with Decimal filledPrice/filledSize
- fetchOrder() 존재하지 않는 주문 → ExchangeOrderNotFoundError

## Validation
```bash
bun run typecheck
bun test --grep "binance"
```

## Out of Scope
- 주문 생성/취소/수정 (T-03-003)
- SL/레버리지 (T-03-004)
- WebSocket kline 구독 (T-03-006)

## Implementation Notes

### Files created
- `src/exchanges/binance.ts` — BinanceAdapter class with all read methods
- `tests/exchanges/binance.test.ts` — 32 tests covering all read methods and stubs

### Files modified
- `src/exchanges/index.ts` — added `BinanceAdapter` export

### Key decisions
- `fetchPositions()` filters zero-contract positions (CCXT returns all symbols including those with 0 size on Binance Futures)
- `fetchPositions(symbol)` passes `[symbol]` to CCXT to reduce network payload, then also applies client-side filter for correctness
- `getExchangeInfo()` uses sensible defaults: tickSize=0.01, minOrderSize=0.001, maxLeverage=125, contractSize=1
- CCXT `order.status = "closed"` maps to `OrderStatus = "FILLED"` (Binance convention)
- Write methods (createOrder, cancelOrder, editOrder), watchOHLCV, and setLeverage throw ExchangeNotImplementedError as stubs for T-03-003/004/006
- `mapTimeframe()` handles both lowercase CCXT convention (5m) and uppercase domain convention (5M)

### Validation results
- `bun run typecheck` — pass (0 errors)
- `bun test --grep "binance"` — 32/32 pass
- `bun test` — 620/620 pass
- `bun run lint` — pass (0 errors after fixing pre-existing ws-manager.ts formatting issue)

## Status
DONE
