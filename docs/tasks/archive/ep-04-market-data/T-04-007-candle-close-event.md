# T-04-007 캔들 마감 감지 & 이벤트 발행

## Goal
CandleCollector에 캔들 마감 감지 로직과 콜백 기반 이벤트 발행을 추가한다.

## Why
캔들 마감은 파이프라인의 트리거이다. 1D 마감 → 방향필터, 1H 마감 → WATCHING 감지, 5M/1M 마감 → 진입 시그널 평가. 마감 캔들만 정확히 감지하여 후속 파이프라인에 전달해야 한다.

## Inputs
- `src/candles/collector.ts` — CandleCollector (T-04-006에서 생성)
- `src/core/types.ts` — Candle, Timeframe 타입
- `docs/exec-plans/04-market-data.md` — M2 마감 감지 요구사항

## Dependencies
- T-04-006 (WebSocket 수집기)

## Expected Outputs
- `src/candles/collector.ts` 수정:
  - `CandleCloseCallback` 타입: `(candle: Candle, timeframe: Timeframe) => void`
  - `CandleCollector.onCandleClose(callback)` — 마감 콜백 등록
  - 마감 캔들 수신 시 등록된 콜백 호출
- `src/candles/types.ts`:
  - `CandleCloseCallback` 타입 export

## Deliverables
- `src/candles/collector.ts` (수정)
- `src/candles/types.ts` (신규)

## Constraints
- 콜백 패턴 사용 (EventEmitter 아님 — 타입 안전, Decision log 준수)
- 마감 캔들만 콜백 트리거: is_closed=true인 캔들 수신 시 발행, 중복 방지 캐시로 동일 캔들 재발행 차단
- 동일 캔들에 대해 중복 마감 이벤트 방지 (이미 is_closed=true인 캔들 재수신 시 무시)
- 콜백 에러가 수집기를 중단시키면 안 됨 (try-catch)
- 다중 콜백 등록 지원

## Steps
1. `src/candles/types.ts` 생성 — CandleCloseCallback 타입 정의
2. CandleCollector에 마감 콜백 레지스트리 추가 (Set<CandleCloseCallback>)
3. 마감 감지 로직: 수신 캔들의 is_closed=true 확인 + 중복 방지 (최근 마감 캐시)
4. `onCandleClose(callback)` 메서드 추가 — 콜백 등록, unsubscribe 함수 반환
5. 마감 감지 시 등록된 모든 콜백 호출 (try-catch 래핑)
6. 중복 마감 방지: 최근 N개 마감 캔들 키(`${symbol}:${exchange}:${tf}:${openTime}`) 캐시
7. 단위 테스트 작성 (콜백/이벤트 로직 — DB 연동은 T-04-006 통합 테스트에서 커버)

## Acceptance Criteria
- is_closed=true 캔들 수신 시 등록된 콜백 호출됨
- is_closed=false 캔들 수신 시 콜백 호출되지 않음
- 동일 캔들 재수신 시 중복 콜백 호출 없음
- 콜백 내부 에러가 수집기 중단시키지 않음
- 다중 콜백 등록 및 해제 가능
- onCandleClose()가 unsubscribe 함수 반환

## Test Scenarios
- 마감 캔들(is_closed=true) 수신 → 등록된 콜백 호출됨
- 미마감 캔들(is_closed=false) 수신 → 콜백 호출 안 됨
- 동일 마감 캔들 2회 수신 → 콜백 1회만 호출
- 콜백 내부 throw → 수집기 정상 동작 + 에러 로그
- 2개 콜백 등록 → 마감 시 2개 모두 호출
- unsubscribe() 호출 후 마감 → 해당 콜백 호출 안 됨
- 4개 타임프레임 마감 → 각각 독립 콜백 호출

## Validation
```bash
bun test -- --grep "candle-close|close-event"
bun run typecheck
```

## Out of Scope
- 파이프라인 트리거 로직 (EP-05/EP-09)
- 타임프레임별 분기 (1D→방향필터 등은 EP-05+)
