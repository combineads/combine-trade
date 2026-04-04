# T-04-009 갭 복구 — REST 보완 로드 & 자동 복구

## Goal
감지된 캔들 갭을 CCXT REST API로 자동 복구하는 모듈을 구현한다. WebSocket 재연결 후 및 데몬 시작 시 자동으로 실행된다.

## Why
WebSocket 연결 끊김 동안 누락된 캔들을 REST API로 보완하여 데이터 무결성을 보장한다. 갭이 있으면 지표 계산과 시그널 생성이 부정확해진다.

## Inputs
- `src/candles/gap-detection.ts` — detectGaps() (T-04-008에서 생성)
- `src/candles/repository.ts` — bulkUpsertCandles()
- `src/core/ports.ts` — ExchangeAdapter.fetchOHLCV()
- `src/candles/history-loader.ts` — fetchCandlesViaREST()

## Dependencies
- T-04-003 (Candle repository)
- T-04-008 (gap detection)

## Expected Outputs
- `src/candles/gap-recovery.ts`:
  - `GapRecovery` 클래스:
    - `recover(symbol, exchange, timeframe, adapter): Promise<RecoveryResult>`
    - `recoverAll(symbols, adapter): Promise<RecoveryResult[]>` — 모든 심볼/타임프레임 복구
  - `RecoveryResult` 타입: `{ symbol, exchange, timeframe, gapsFound, candlesRecovered, errors }`

## Deliverables
- `src/candles/gap-recovery.ts`

## Constraints
- REST API 호출은 ExchangeAdapter.fetchOHLCV() 사용
- 갭 복구 중에도 실시간 수집(CandleCollector)은 계속 동작
- 대량 갭 복구 시 레이트리밋 준수 (갭 구간별 순차 처리, 구간 간 딜레이)
- 복구 실패한 갭은 로그 + 다음 복구 사이클에서 재시도
- 갭이 없으면 바로 완료 (불필요한 API 호출 없음)
- DB 테스트: adapter는 mock, 복구 결과는 실제 PostgreSQL에서 검증 (test-db 헬퍼)

## Steps
1. `src/candles/gap-recovery.ts` 파일 생성
2. `RecoveryResult` 타입 정의
3. `GapRecovery` 클래스 구현:
   a. `recover()` — detectGaps() → 갭별 fetchOHLCV → bulkUpsertCandles
   b. `recoverAll()` — 모든 심볼×타임프레임 순회, recover() 호출
4. 레이트리밋 보호: 갭 구간 간 500ms 딜레이
5. 에러 처리: REST 실패 시 해당 갭 skip, 결과에 에러 기록
6. 구조화 로그 (갭 수, 복구 캔들 수, 실패 수)
7. 단위 테스트 (mock adapter) + 통합 테스트 (실제 PostgreSQL에서 갭 복구 검증, test-db 헬퍼) 작성

## Acceptance Criteria
- 갭이 있는 구간에 대해 fetchOHLCV 호출 → DB UPSERT
- 갭이 없으면 API 호출 없이 바로 완료
- 복구 후 해당 구간 재검사 시 갭 없음
- REST 실패 시 해당 갭 skip, 나머지 계속 처리
- RecoveryResult에 갭 수, 복구 건수, 에러 수 포함
- 갭 구간 간 딜레이로 레이트리밋 보호

## Test Scenarios
- recover() with no gaps → gapsFound=0, candlesRecovered=0, API 호출 없음
- recover() with 1 gap (3 missing candles) → fetchOHLCV 호출, 3 candles 복구
- recover() with REST failure → errors=1, 나머지 갭 계속 처리
- recoverAll() with 2 symbols × 4 timeframes → 8회 recover() 호출
- recoverAll() with mixed results → 심볼별 RecoveryResult 배열 반환
- 레이트리밋: 2개 갭 복구 시 갭 간 딜레이 존재
- 대규모 갭 (100 candles) → fetchOHLCV limit 파라미터 활용한 분할 요청

## Validation
```bash
bun test -- --grep "gap-recovery"
bun run typecheck
```

## Out of Scope
- 갭 감지 로직 (T-04-008)
- WebSocket 재연결 자체 (EP-03 ws-manager)
- 데몬 스케줄링 (EP-09)
