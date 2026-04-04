# T-04-003 Candle Repository — 벌크 UPSERT & 조회 헬퍼

## Goal
Candle 데이터의 DB 영속화 레이어를 구현한다. 벌크 UPSERT (중복 무시)와 조회 헬퍼를 포함한다.

## Why
히스토리 로더(T-04-002), 수집기(T-04-006), 갭 복구(T-04-009) 모두 캔들을 DB에 저장해야 한다. 공통 Repository 패턴으로 추출하여 중복 코드를 방지한다.

## Inputs
- `src/db/schema.ts` — candleTable (T-04-001에서 생성)
- `src/core/types.ts` — Candle 타입
- `src/db/pool.ts` — DB 연결

## Dependencies
- T-04-001 (Candle 스키마)

## Expected Outputs
- `src/candles/repository.ts`:
  - `bulkUpsertCandles(candles[]): Promise<number>` — INSERT ON CONFLICT 벌크 UPSERT, 삽입 건수 반환
  - `getLatestCandleTime(symbol, exchange, timeframe): Promise<Date | null>`
  - `getCandles(symbol, exchange, timeframe, from, to, limit?): Promise<Candle[]>`

## Deliverables
- `src/candles/repository.ts`

## Constraints
- UPSERT: `INSERT ... ON CONFLICT (symbol, exchange, timeframe, open_time) DO UPDATE` — is_closed=true인 기존 행은 덮어쓰지 않음 (WHERE is_closed = false)
- 벌크 INSERT 최적화: 1000행 단위 배치
- 가격/볼륨은 Decimal → numeric 문자열 변환
- 조회 시 open_time DESC 정렬 (최근 우선)
- 갭 감지 로직은 포함하지 않음 (T-04-008에서 전담)
- 모든 테스트는 실제 PostgreSQL에서 실행 (test-db 헬퍼, mock DB 금지)

## Steps
1. `src/candles/repository.ts` 파일 생성
2. `bulkUpsertCandles()` 구현 — Drizzle onConflictDoUpdate, 1000행 배치
3. `getLatestCandleTime()` 구현 — MAX(open_time) 쿼리
4. `getCandles()` 구현 — 범위 조회, limit 지원
5. 통합 테스트 작성 (실제 PostgreSQL, test-db 헬퍼 사용 — mock DB 금지)

## Acceptance Criteria
- 벌크 UPSERT가 중복 캔들 무시 (UNIQUE 위반 시 조건부 업데이트)
- is_closed=true인 기존 캔들은 덮어쓰지 않음
- 1000행 배치로 대량 삽입 처리
- getLatestCandleTime이 null 반환 (빈 테이블) 또는 최신 시각 반환
- getCandles가 open_time DESC 정렬

## Test Scenarios
- bulkUpsertCandles() with 3000 candles → 3개 배치로 분할, 3000 반환
- bulkUpsertCandles() with duplicate candles (is_closed=false existing) → 업데이트됨
- bulkUpsertCandles() with duplicate candles (is_closed=true existing) → skip됨
- bulkUpsertCandles() with empty array → 0 반환, 에러 없음
- getLatestCandleTime() on empty table → null
- getLatestCandleTime() with data → 최신 open_time 반환
- getCandles() with from/to range → 범위 내 캔들만 반환, DESC 정렬

## Validation
```bash
bun test -- --grep "candle-repository|repository"
bun run typecheck
```

## Out of Scope
- 히스토리 다운로드 (T-04-002)
- CCXT REST fallback (T-04-002)
- 갭 감지 로직 (T-04-008)
- 동기화 로직 (T-04-004)
- 실시간 수집 (T-04-006)
