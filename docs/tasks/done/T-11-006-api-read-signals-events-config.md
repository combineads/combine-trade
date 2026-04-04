# T-11-006 조회 API — signals/recent, events/recent, config

## Goal
대시보드 우측 영역에 필요한 조회 API 3개를 구현한다: 최근 시그널, 최근 이벤트, 현재 설정.

## Why
대시보드의 최근 시그널/거래 리스트와 설정 정보(실행 모드, Trade Block)가 이 데이터를 소비한다.

## Inputs
- `docs/exec-plans/11-api-web.md` M2
- `docs/DATA_MODEL.md` — Signal, EventLog, CommonCode, TradeBlock

## Dependencies
- T-11-003 (미들웨어)

## Expected Outputs
- `src/api/routes/signals.ts` — GET /api/signals/recent
- `src/api/routes/events.ts` — GET /api/events/recent
- `src/api/routes/config.ts` — GET /api/config

## Deliverables
- `src/api/routes/signals.ts`
- `src/api/routes/events.ts`
- `src/api/routes/config.ts`
- `tests/api/routes/signals.test.ts`
- `tests/api/routes/events.test.ts`
- `tests/api/routes/config.test.ts`

## Constraints
- /recent 엔드포인트는 최근 N건만 반환 (기본 10, 최대 50)
- Signal 응답: id, symbol, exchange, timeframe, signal_type, direction, safety_passed, knn_decision, created_at
- EventLog 응답: id, event_type, symbol, exchange, data, created_at
- Config 응답: 실행 모드(execution_mode), 활성 Trade Block 목록, 주요 설정값
- CommonCode 캐시에서 읽기 (DB 직접 쿼리 불필요)

## Steps
1. `src/api/routes/signals.ts` — Signal 테이블에서 최근 N건 조회, ?limit=N 파라미터
2. `src/api/routes/events.ts` — EventLog 테이블에서 최근 N건 조회, ?limit=N 파라미터
3. `src/api/routes/config.ts` — CommonCode 캐시에서 실행 모드, Trade Block 활성 목록 조회
4. 각 라우트 server.ts에 마운트
5. 테스트 작성

## Acceptance Criteria
- GET /api/signals/recent → 최근 시그널 10건 (기본), 최신순
- GET /api/signals/recent?limit=5 → 5건
- GET /api/events/recent → 최근 이벤트 10건 (기본), 최신순
- GET /api/events/recent?limit=20 → 20건
- GET /api/config → `{ execution_modes: { BTCUSDT_binance: "analysis", ... }, trade_blocks: [...], ... }`
- limit > 50 → 50으로 clamp

## Test Scenarios
- GET /api/signals/recent → default 10 items, newest first
- GET /api/signals/recent?limit=5 → exactly 5 items
- GET /api/signals/recent?limit=100 → clamped to 50 items
- GET /api/signals/recent with no signals → 200 empty array
- GET /api/events/recent → default 10 items, newest first
- GET /api/config → includes execution_modes object and trade_blocks array
- GET /api/config → trade_blocks include only active (non-expired) blocks

## Validation
```bash
bun test -- tests/api/routes/signals.test.ts tests/api/routes/events.test.ts tests/api/routes/config.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- 시그널 전체 이력 (후속 에픽)
- 이벤트 전체 이력 (후속 에픽)
- 설정 변경 API (Non-goals)
