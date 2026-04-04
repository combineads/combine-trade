# T-04-004 캔들 동기화 — 데몬 시작 시 전일까지 자동 동기화

## Goal
데몬 시작 시 DB의 캔들 데이터를 전일까지 자동으로 동기화하는 `sync.ts` 모듈을 구현한다.

## Why
데몬이 재시작될 때 히스토리 데이터가 최신 상태여야 파이프라인이 올바른 지표를 계산할 수 있다. 전일까지 항상 덮어쓰기하여 미완결 캔들을 보정한다.

## Inputs
- `src/candles/history-loader.ts` — downloadCandles(), fetchCandlesViaREST()
- `src/candles/repository.ts` — bulkUpsertCandles(), getLatestCandleTime()
- `src/core/ports.ts` — SymbolRepository.findAll() (활성 심볼 목록 조회)
- `docs/exec-plans/04-market-data.md` — M1 동기화 요구사항

## Dependencies
- T-04-002 (history download)
- T-04-003 (candle repository)

## Expected Outputs
- `src/candles/sync.ts`:
  - `syncCandles(options): Promise<SyncResult>` — 전체 동기화 실행
  - `SyncResult` 타입 — { symbol, exchange, timeframe, inserted, skipped, errors }[]

## Deliverables
- `src/candles/sync.ts`

## Constraints
- 동기화 대상: config에 정의된 모든 활성 심볼 × 4개 타임프레임
- 보존 기간: 1D/1H/5M = 3년, 1M = 6개월
- **전일까지 항상 덮어쓰기**: 마지막 일자 데이터를 항상 재다운로드 (미완결 캔들 보정)
- DB 최신 캔들 시각 확인 → 누락 구간만 다운로드
- 초기 로드(빈 DB) 시 전체 보존 기간 다운로드
- Binance public data 우선, 실패 시 CCXT REST fallback
- 로그: 심볼/타임프레임별 삽입 건수, 소요 시간
- DB 테스트: test-db 헬퍼로 실제 PostgreSQL에서 동기화 결과 검증

## Steps
1. `src/candles/sync.ts` 파일 생성
2. `SyncResult` 타입 정의
3. `syncCandles()` 메인 함수 구현:
   a. 활성 심볼 목록 조회 (SymbolRepository.findAll() → is_active=true 필터)
   b. 각 심볼×타임프레임에 대해:
      - getLatestCandleTime() 호출
      - 보존 기간 시작일 vs DB 최신 중 더 최근 값을 from으로
      - 전일 UTC 23:59를 to로
      - downloadCandles(from, to) 호출
      - 실패 시 fetchCandlesViaREST() fallback
      - bulkUpsertCandles() 호출
   c. SyncResult 집계 반환
4. 전일 덮어쓰기 로직: 항상 마지막 1일치 재다운로드
5. 에러 처리: 개별 심볼/타임프레임 실패 시 나머지 계속 진행
6. 구조화 로그 (심볼, 타임프레임, 건수, 소요시간)
7. 단위 테스트 (downloadCandles mock) + 통합 테스트 (실제 PostgreSQL, test-db 헬퍼) 작성

## Acceptance Criteria
- 빈 DB에서 syncCandles() → 보존 기간 전체 다운로드 시도
- 기존 데이터가 있는 DB → 누락 구간만 다운로드
- 전일까지 항상 마지막 1일치 재다운로드
- Binance public data 실패 시 CCXT REST fallback 호출
- 개별 심볼/타임프레임 실패가 전체 중단시키지 않음
- SyncResult에 심볼/타임프레임별 결과 포함

## Test Scenarios
- syncCandles() with empty DB → 3년 전 날짜부터 전일까지 downloadCandles 호출
- syncCandles() with 1M timeframe, empty DB → 6개월 전부터 다운로드
- syncCandles() with existing data (latest=3일전) → 3일전~전일 구간만 다운로드
- syncCandles() always re-downloads last day → 전일 데이터 재다운로드 확인
- syncCandles() with download failure → fallback to fetchCandlesViaREST
- syncCandles() with one symbol failure → 다른 심볼은 정상 진행
- SyncResult 집계 → 각 심볼/타임프레임별 inserted/skipped/errors 포함

## Validation
```bash
bun test -- --grep "candle-sync|sync"
bun run typecheck
```

## Out of Scope
- 실시간 수집 (T-04-006)
- 갭 복구 (T-04-008, T-04-009)
- 데몬 오케스트레이션에서의 호출 (EP-09)
