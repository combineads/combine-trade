# T-04-006 WebSocket 실시간 캔들 수집기

## Goal
WebSocket kline 스트림을 구독하여 실시간 캔들 데이터를 DB에 저장하는 수집기를 구현한다.

## Why
24/7 자동매매 데몬은 실시간 캔들 데이터를 기반으로 파이프라인을 실행한다. WebSocket 구독으로 지연 없이 캔들 데이터를 수신하고 DB에 반영해야 한다.

## Inputs
- `src/core/ports.ts` — ExchangeAdapter.watchOHLCV()
- `src/candles/repository.ts` — bulkUpsertCandles()
- `src/exchanges/binance.ts` — BinanceAdapter (watchOHLCV 구현됨)
- `docs/exec-plans/04-market-data.md` — M2 수집기 요구사항

## Dependencies
- T-04-001 (Candle 스키마)
- T-04-003 (Candle repository)

## Expected Outputs
- `src/candles/collector.ts`:
  - `CandleCollector` 클래스:
    - `start(symbols, timeframes, adapter): Promise<void>` — 구독 시작
    - `stop(): Promise<void>` — 모든 구독 해제
    - `getStatus(): CollectorStatus` — 활성 구독 수, 마지막 수신 시각
    - `onReconnect(callback: () => void): Unsubscribe` — 재연결 감지 이벤트
  - `CollectorStatus` 타입

## Deliverables
- `src/candles/collector.ts`

## Constraints
- ExchangeAdapter.watchOHLCV() 콜백을 통해 캔들 수신
- 수신 캔들을 즉시 DB UPSERT (is_closed 상태 반영)
- 미마감 캔들(is_closed=false)도 저장 — 대시보드 표시용
- 마감 캔들(is_closed=true) 수신 시 UPSERT로 확정
- 심볼 × 타임프레임 조합별 독립 구독
- 구독 해제 시 Unsubscribe 콜백 호출
- 재연결 감지: 구독별 lastReceivedAt 추적, 타임프레임 duration × 3 이상 갭 후 캔들 재수신 시 reconnect로 판정
- onReconnect 콜백 에러 격리 (try-catch)
- DB 테스트: adapter는 mock, DB 저장은 실제 PostgreSQL에서 검증 (test-db 헬퍼)

## Steps
1. `src/candles/collector.ts` 파일 생성
2. `CollectorStatus` 타입 정의
3. `CandleCollector` 클래스 구현:
   a. `start()` — 심볼×타임프레임 조합별 watchOHLCV 구독
   b. 콜백에서 수신 캔들 → repository.bulkUpsertCandles([candle]) 호출
   c. 활성 구독 Map 관리 (key: `${symbol}:${timeframe}`)
   d. `stop()` — 모든 Unsubscribe 호출
   e. `getStatus()` — 활성 구독 수, 마지막 수신 시각
4. 에러 처리: 개별 UPSERT 실패 시 로그 + 계속 수집
5. 구조화 로그 (symbol, timeframe, is_closed, open_time)
6. 단위 테스트 (mock adapter) + 통합 테스트 (실제 PostgreSQL에 캔들 저장 검증, test-db 헬퍼) 작성

## Acceptance Criteria
- 다중 심볼 × 다중 타임프레임 동시 구독 성공
- 수신 캔들이 DB에 저장됨 (is_closed 반영)
- stop() 호출 시 모든 구독 해제
- getStatus()가 활성 구독 수, 마지막 수신 시각 반환
- 개별 DB 에러가 전체 수집을 중단시키지 않음

## Test Scenarios
- start() with 2 symbols × 4 timeframes → 8개 watchOHLCV 구독 생성
- 콜백 수신 시 → bulkUpsertCandles 호출됨
- 미마감 캔들 수신 → is_closed=false로 저장
- 마감 캔들 수신 → is_closed=true로 UPSERT
- stop() → 모든 Unsubscribe 함수 호출됨
- getStatus() after start → { activeSubscriptions: 8, lastReceivedAt: Date }
- DB UPSERT 실패 → 에러 로그 + 수집 계속
- 재연결 감지: 타임프레임 × 3 갭 후 캔들 수신 → onReconnect 콜백 호출됨

## Validation
```bash
bun test -- --grep "collector"
bun run typecheck
```

## Out of Scope
- 캔들 마감 이벤트 발행 (T-04-007)
- 갭 복구 트리거 (T-04-009)
- 데몬 오케스트레이션 (EP-09)
