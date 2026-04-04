# T-04-008 캔들 갭 감지 로직

## Goal
DB 내 캔들 시계열에서 누락된 구간(갭)을 감지하는 로직을 구현한다.

## Why
WebSocket 연결 끊김, 데몬 재시작 등으로 캔들 데이터에 갭이 발생할 수 있다. 정확한 갭 감지가 있어야 갭 복구(T-04-009)가 누락 구간만 효율적으로 복원할 수 있다.

## Inputs
- `src/candles/repository.ts` — getCandles() (T-04-003에서 생성)
- `src/db/schema.ts` — candleTable (open_time 경량 쿼리용)
- `src/db/pool.ts` — DB 연결
- `src/core/types.ts` — Timeframe 타입
- `src/core/constants.ts` — 타임프레임별 duration

## Dependencies
- T-04-001 (Candle 스키마)
- T-04-003 (Candle repository)

## Expected Outputs
- `src/candles/gap-detection.ts`:
  - `detectGaps(symbol, exchange, timeframe, from, to): Promise<CandleGap[]>`
  - `CandleGap` 타입: `{ from: Date, to: Date, expectedCount: number }`
  - `getTimeframeDurationMs(timeframe): number` — 타임프레임 → 밀리초 변환

## Deliverables
- `src/candles/gap-detection.ts`

## Constraints
- 타임프레임별 캔들 간격: 1D=86400s, 1H=3600s, 5M=300s, 1M=60s
- 갭 판정: 연속 캔들 간 open_time 차이가 타임프레임 duration의 1.5배 이상
- 주말/거래소 점검 시간은 고려하지 않음 (크립토는 24/7)
- 갭 병합: 연속된 작은 갭은 하나의 큰 갭으로 병합
- expectedCount: 갭 구간 내 예상 캔들 수 계산
- 대용량 최적화: 전체 캔들 행을 메모리에 로드하지 않음. open_time 컬럼만 조회하는 경량 SQL 쿼리 사용
- DB 테스트: test-db 헬퍼로 실제 PostgreSQL에 캔들 삽입 후 갭 감지 정확도 검증

## Steps
1. `src/candles/gap-detection.ts` 파일 생성
2. `CandleGap` 타입 정의
3. `getTimeframeDurationMs()` 유틸 구현
4. `detectGaps()` 구현:
   a. SQL 쿼리로 구간 내 캔들 open_time만 조회 (전체 행 로드 아님, open_time ASC)
   b. 연속 캔들 간 시간 차이 계산
   c. duration × 1.5 초과 시 갭으로 판정
   d. 연속 갭 병합
   e. expectedCount 계산
5. 통합 테스트 작성 (실제 PostgreSQL에 캔들 삽입 후 갭 감지 검증, test-db 헬퍼 사용)

## Acceptance Criteria
- 연속 캔들 데이터 → 빈 갭 배열 반환
- 1개 캔들 누락 → 해당 구간 갭 감지
- 연속 3개 캔들 누락 → 1개 병합된 갭, expectedCount=3
- getTimeframeDurationMs("5M") → 300000
- from/to가 정확한 누락 시작/끝 시각

## Test Scenarios
- detectGaps() with continuous 5M data (12 candles, 1 hour) → 빈 배열
- detectGaps() with 1 missing 5M candle → 1개 갭, expectedCount=1
- detectGaps() with 3 consecutive missing 5M candles → 1개 갭, expectedCount=3
- detectGaps() with 2 separate gaps → 2개 갭 반환 (병합 안 됨)
- detectGaps() with empty DB → 전체 구간이 1개 갭
- getTimeframeDurationMs("1D") → 86400000
- getTimeframeDurationMs("1H") → 3600000
- getTimeframeDurationMs("1M") → 60000

## Validation
```bash
bun test -- --grep "gap-detection|gap"
bun run typecheck
```

## Out of Scope
- 갭 복구 (REST 다운로드 — T-04-009)
- WebSocket 재연결 트리거 (EP-03 ws-manager 담당)
