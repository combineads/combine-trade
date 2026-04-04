# T-11-004 조회 API — health, symbol-states, positions

## Goal
대시보드 좌측 영역에 필요한 조회 API 3개를 구현한다: 시스템 헬스, 심볼 상태, 활성 포지션.

## Why
대시보드의 시스템 상태 행, 심볼 카드, 활성 포지션 테이블이 이 데이터를 소비한다.

## Inputs
- `docs/exec-plans/11-api-web.md` M2
- `docs/DATA_MODEL.md` — SymbolState, Ticket 엔티티
- T-11-003의 미들웨어 (인증 적용)

## Dependencies
- T-11-003 (미들웨어)

## Expected Outputs
- `src/api/routes/health.ts` — GET /api/health
- `src/api/routes/symbol-states.ts` — GET /api/symbol-states
- `src/api/routes/positions.ts` — GET /api/positions

## Deliverables
- `src/api/routes/health.ts`
- `src/api/routes/symbol-states.ts`
- `src/api/routes/positions.ts`
- `tests/api/routes/health.test.ts`
- `tests/api/routes/symbol-states.test.ts`
- `tests/api/routes/positions.test.ts`

## Constraints
- L8 모듈: L0~L7 임포트 가능
- 모든 금액/가격 필드는 string으로 직렬화 (Decimal.js → .toString())
- DI 패턴: 각 라우트는 deps 인터페이스를 받아 DB 쿼리 함수 주입
- 응답 시간 < 200ms
- /api/health는 인증 없이 접근 가능 (T-11-003에서 제외 경로 설정됨)

## Steps
1. `src/api/routes/health.ts` — DB 연결 확인(ping), 데몬 가동 시간 반환
2. `src/api/routes/symbol-states.ts` — SymbolState 전체 조회 (fsm_state, daily_bias, execution_mode, losses 카운터 포함)
3. `src/api/routes/positions.ts` — Ticket WHERE state != 'CLOSED' 조회 (진입가, SL, 현재가, 미실현 PnL 계산용 데이터)
4. 각 라우트를 Hono 라우터로 생성하고, server.ts에 마운트
5. 응답 타입 정의 (Zod → OpenAPI 스타일 또는 순수 타입)
6. 테스트 작성

## Acceptance Criteria
- GET /api/health → `{ status: "ok", db: "connected", uptime_seconds: N }`
- GET /api/health (DB 연결 실패 시) → `{ status: "degraded", db: "disconnected" }`
- GET /api/symbol-states → `[{ symbol, exchange, fsm_state, daily_bias, execution_mode, losses_today, ... }]`
- GET /api/positions → `[{ ticket_id, symbol, exchange, direction, entry_price, sl_price, size, remaining_size, state, ... }]`
- 모든 numeric 필드는 string 타입

## Test Scenarios
- GET /api/health with DB connected → 200 `{ status: "ok" }`
- GET /api/health with DB disconnected → 200 `{ status: "degraded", db: "disconnected" }`
- GET /api/symbol-states with 2 symbols → 200 array with 2 items, each having fsm_state/daily_bias
- GET /api/symbol-states with no symbols → 200 empty array
- GET /api/positions with 2 active tickets → 200 array with numeric fields as strings
- GET /api/positions with no active positions → 200 empty array
- GET /api/positions excludes CLOSED tickets → only non-CLOSED tickets returned

## Validation
```bash
bun test -- tests/api/routes/health.test.ts tests/api/routes/symbol-states.test.ts tests/api/routes/positions.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- tickets (T-11-005), signals/events (T-11-006)
- 제어 API (T-11-007)
