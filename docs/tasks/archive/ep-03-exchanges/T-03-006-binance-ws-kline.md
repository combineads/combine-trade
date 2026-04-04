# T-03-006 exchanges/binance.ts — Binance WebSocket kline 구독

## Goal
BinanceAdapter.watchOHLCV()를 구현한다. WsManager를 활용하여 Binance Futures WebSocket kline 스트림을 구독하고, 실시간 캔들 데이터를 Candle 타입으로 변환하여 콜백으로 전달한다.

## Why
실시간 캔들 데이터는 데몬 파이프라인의 진입점이다. 캔들 마감 시 지표 계산→시그널 평가→주문 실행의 전체 플로우가 시작된다. watchOHLCV는 EP-04(candles collector)가 직접 사용하는 핵심 메서드이다.

## Inputs
- `src/exchanges/binance.ts` (T-03-002) — BinanceAdapter 기존 코드
- `src/exchanges/ws-manager.ts` (T-03-005) — WsManager
- `src/core/ports.ts` — OHLCVCallback, Unsubscribe 타입
- Binance Futures WebSocket API: `wss://fstream.binance.com/ws/<symbol>@kline_<interval>`

## Dependencies
T-03-002, T-03-005

## Expected Outputs
- `src/exchanges/binance.ts` — watchOHLCV() 구현 (M1의 stub 대체)
- EP-04(candles collector)에서 `adapter.watchOHLCV('BTCUSDT', '5m', cb)` 호출

## Deliverables
- `src/exchanges/binance.ts` (기존 파일에 watchOHLCV 구현)

## Constraints
- Binance WS URL 형식: `wss://fstream.binance.com/ws/{symbol_lower}@kline_{interval}`
- sandbox 시: `wss://stream.binancefuture.com/ws/...`
- kline 메시지에서 is_closed (k.x) 필드로 캔들 마감 구분
- 모든 OHLCV 값은 Decimal로 변환
- WsManager.onReconnect에서 자동 재구독 (갭은 EP-04에서 복구)
- 다중 심볼×타임프레임 동시 구독 가능

## Steps
1. Binance WS kline 스트림 URL 생성 함수
2. watchOHLCV() 구현:
   - WsManager.connect()로 kline 스트림 연결
   - onMessage에서 Binance kline JSON → Candle 변환
   - OHLCVCallback(candle) 호출
   - Unsubscribe 함수 반환 (connection.close())
3. kline JSON → Candle 변환 함수:
   - k.t → open_time (Date)
   - k.o/h/l/c/v → Decimal 변환
   - k.x → is_closed (boolean)
4. 재연결 시 자동 재구독:
   - WsManager.onReconnect 콜백에서 동일 스트림 재연결
5. 테스트 작성 (mock WsManager + Binance kline payload)
6. typecheck, lint 통과 확인

## Acceptance Criteria
- watchOHLCV('BTCUSDT', '5m', callback) → Unsubscribe 함수 반환
- Binance kline 메시지 수신 → Candle 타입으로 변환, callback 호출
- Candle.open_time이 Date 타입, OHLCV가 Decimal
- Candle.is_closed가 Binance k.x 값과 일치
- 여러 심볼×타임프레임 동시 구독 가능
- Unsubscribe() 호출 → 해당 스트림만 종료
- WS 재연결 후 자동 재구독
- sandbox 모드에서 testnet WS URL 사용
- `bun run typecheck` 통과

## Test Scenarios
- watchOHLCV() → WsManager.connect() 호출 확인, Unsubscribe 함수 반환
- Binance kline JSON { k: { t, o, h, l, c, v, x: false } } → Candle { is_closed: false } 변환
- Binance kline JSON { k: { x: true } } → Candle { is_closed: true }
- OHLCV 문자열 "85432.50" → Decimal('85432.50') 변환 정확성
- 여러 번 watchOHLCV → 독립된 WS 연결 생성 (스트림 ID 다름)
- Unsubscribe() 호출 → 해당 연결 close()
- 재연결 시 onReconnect → 동일 URL로 재구독

## Validation
```bash
bun run typecheck
bun test --grep "binance.*ws|binance.*kline|watchOHLCV"
```

## Out of Scope
- 캔들 마감 이벤트 발행 로직 (EP-04 collector)
- 캔들 DB 저장 (EP-04)
- 갭 복구 (EP-04)
- 다른 거래소 WS kline 구현

## Implementation Notes
- `BinanceAdapter` constructor accepts an optional `wsFactory?: WebSocketFactory` parameter to allow test injection of a mock WebSocket factory. The `_sandbox` flag is stored from `ExchangeConfig.sandbox` to determine which WS URL to use.
- `watchOHLCV` is synchronous internally (returns `Promise.resolve(unsubscribe)`) since `WsManager.connect()` is synchronous. The `Promise<Unsubscribe>` return type is kept to match the `ExchangeAdapter` port.
- Reconnection is handled entirely by `WsManager` — no `onReconnect` callback is needed in the adapter because WsManager reconnects to the same URL automatically.
- `parseKlineMessage` returns `null` for non-kline events (e.g. server pings) and invalid payloads, preventing spurious callbacks.
- The existing stub test `"watchOHLCV throws ExchangeNotImplementedError"` was removed from `tests/exchanges/binance.test.ts`; full WS coverage is in the new `tests/exchanges/binance-ws.test.ts`.

## Outputs
- Modified: `src/exchanges/binance.ts` — `watchOHLCV` implemented, `WsManager` added as lazy member field
- Created: `tests/exchanges/binance-ws.test.ts` — 23 tests covering URL construction, kline parsing, Decimal conversion, sandbox URL, unsubscribe, and multiple concurrent subscriptions
- Modified: `tests/exchanges/binance.test.ts` — removed stale stub test, removed unused import

## Status
DONE — 2026-04-04
