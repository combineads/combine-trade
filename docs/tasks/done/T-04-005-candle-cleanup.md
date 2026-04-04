# T-04-005 1M 캔들 데이터 Rolling 정리

## Goal
보존 기간을 초과한 1M 캔들 데이터를 주기적으로 삭제하는 cleanup 모듈을 구현한다.

## Why
1M 캔들은 6개월 rolling 보존이며 누적 시 ~1.58M행/심볼로 DB 성능에 영향을 줄 수 있다. 주기적 정리로 테이블 크기를 관리한다.

## Inputs
- `src/db/schema.ts` — candleTable
- `docs/DATA_MODEL.md` — 보존 정책: 1D/1H/5M = 무기한(3년 cold storage 고려), 1M = 6개월

## Dependencies
- T-04-001 (Candle 스키마)

## Expected Outputs
- `src/candles/cleanup.ts`:
  - `cleanupOldCandles(options?): Promise<CleanupResult>` — 보존 기간 초과 캔들 삭제
  - `CleanupResult` — { timeframe, deleted, cutoffDate }[]

## Deliverables
- `src/candles/cleanup.ts`

## Constraints
- 삭제 대상: 1M 타임프레임, open_time < (now - 6개월)
- 1D/1H/5M은 삭제하지 않음 (3년 보존, 이 태스크에서는 무기한)
- 대량 삭제 시 1000행 단위 배치 DELETE (테이블 락 최소화)
- 삭제 전 로그, 삭제 후 결과 로그
- 데몬에서 일 1회 호출 예정 (호출 스케줄링은 EP-09)
- DB 테스트: test-db 헬퍼로 실제 PostgreSQL에서 DELETE 동작 검증 (배치 삭제 포함)

## Steps
1. `src/candles/cleanup.ts` 파일 생성
2. `CleanupResult` 타입 정의
3. `cleanupOldCandles()` 구현:
   a. 1M 보존 cutoff 날짜 계산 (now - 6개월)
   b. DELETE FROM candles WHERE timeframe='1M' AND open_time < cutoff (배치)
   c. 결과 집계
4. 배치 삭제: `DELETE FROM candles WHERE id IN (SELECT id FROM candles WHERE timeframe='1M' AND open_time < cutoff LIMIT 1000)` + loop until 0 rows affected
5. 로깅: 삭제 건수, cutoff 날짜
6. 통합 테스트 작성 (실제 PostgreSQL에서 DELETE 동작 검증, test-db 헬퍼 사용)

## Acceptance Criteria
- 6개월 이전 1M 캔들만 삭제
- 1D/1H/5M 캔들은 삭제되지 않음
- 배치 단위(1000행) 삭제로 대량 삭제 처리
- CleanupResult에 삭제 건수, cutoff 날짜 포함
- 삭제할 데이터 없을 때 에러 없이 빈 결과 반환

## Test Scenarios
- cleanupOldCandles() with 1M candles older than 6 months → 삭제됨
- cleanupOldCandles() with 1M candles within 6 months → 삭제되지 않음
- cleanupOldCandles() with 5M candles older than 6 months → 삭제되지 않음 (5M은 보존)
- cleanupOldCandles() with empty table → { deleted: 0 } 반환
- cleanupOldCandles() with 3000 old 1M candles → 3개 배치로 삭제 처리
- CleanupResult.cutoffDate가 6개월 전 날짜

## Validation
```bash
bun test -- --grep "candle-cleanup|cleanup"
bun run typecheck
```

## Out of Scope
- 스케줄링 (EP-09 데몬에서 호출)
- 1D/1H/5M cold storage 아카이빙
