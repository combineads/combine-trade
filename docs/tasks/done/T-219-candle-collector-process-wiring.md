# T-219 candle-collector process bootstrap

## Goal
`workers/candle-collector/src/db.ts` (CandleRepository + findActiveSymbolTimeframes Drizzle 구현)와 `workers/candle-collector/src/index.ts` (DB에서 활성 전략의 (symbol, timeframe) 쌍 읽어 멀티 페어 polling loop + dynamic pair 감지)를 구현한다.

## Why
candle-collector는 전체 파이프라인의 데이터 소스다. Binance WebSocket/REST에서 캔들을 수집해 DB에 저장하고 `candle_closed`를 NOTIFY한다. 이 워커 없이는 실시간 데이터가 없다.

## Inputs
- `workers/candle-collector/src/collector.ts` — 기존 CandleCollector 도메인 로직
- `packages/core/candle/` — CandleCollectorDeps, CandleRepository 인터페이스
- `packages/adapters/binance/` — BinanceFuturesAdapter (fetchOHLCV)
- `db/index.ts` — Drizzle 싱글턴
- T-218 패턴 참조

## Dependencies
T-218

## Expected Outputs
- `workers/candle-collector/src/db.ts` — CandleRepository + findActiveSymbolTimeframes
- `workers/candle-collector/src/index.ts` — 멀티 페어 polling + dynamic 감지

## Deliverables
- `workers/candle-collector/src/db.ts`:
  - `CandleRepository.upsert(candle)` → candles 테이블 upsert
  - `CandleRepository.findLatestOpenTime(symbol, timeframe)` → 최신 캔들 시각
  - `findActiveSymbolTimeframes()` → strategies 테이블에서 `status='active'`인 (symbol, timeframe) 쌍
- `workers/candle-collector/src/index.ts`:
  - 시작 시: DB에서 활성 (symbol, timeframe) 쌍 로드
  - 각 쌍에 대해 `CandleCollector` 인스턴스 생성 + concurrent 실행
  - 60초마다 `findActiveSymbolTimeframes()` 재조회 → 새 쌍 추가 시 새 collector 시작 (기존 중단 없음)
  - 각 closed candle 마다 `candle_closed` NOTIFY
  - SIGTERM → 모든 collector graceful shutdown

## Constraints
- 기존 실행 중인 collector는 재시작하지 않음 (Set으로 활성 페어 추적)
- 60초 polling은 `setInterval` 사용
- REST 기반 polling (`fetchOHLCV`) — WebSocket 구현은 별도 epic

## Steps
1. `candle-collector/src/collector.ts` + `CandleCollectorDeps` 읽기
2. `BinanceFuturesAdapter.fetchOHLCV` 인터페이스 확인
3. `db.ts` 3개 함수 구현
4. `index.ts` 멀티 페어 loop 구현
5. `bun run typecheck`

## Acceptance Criteria
- `"Candle collector started"` 출력
- DB에서 활성 전략의 페어 읽기 확인
- `bun run typecheck` 통과
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/candle-collector/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
WebSocket 기반 스트리밍, OKX 어댑터, horizontal scaling
