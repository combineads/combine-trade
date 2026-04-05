# T-14-007 이체 API 엔드포인트 (이력 조회 + 수동 트리거)

## Goal
이체 이력 조회 API와 수동 즉시 이체 트리거 API를 구현한다.

## Why
웹 대시보드에서 이체 이력을 확인하고, 수동으로 즉시 이체를 트리거할 수 있어야 한다. EventLog 기반 이력 조회와 수동 트리거로 운영 편의성을 확보한다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M4 — API 스펙
- T-14-003 — executeTransfer() (수동 트리거 시 호출)
- `src/api/` — 기존 API 라우터 패턴

## Dependencies
- T-14-003

## Expected Outputs
- `GET /api/transfers` — EventLog에서 TRANSFER_% 이벤트 조회 (cursor 페이지네이션)
- `POST /api/transfers/trigger` — 수동 즉시 이체 트리거

## Deliverables
- `src/api/routes/transfers.ts` 생성 (또는 기존 라우터에 추가)

## Constraints
- EventLog WHERE event_type LIKE 'TRANSFER_%' 필터링
- cursor 페이지네이션 (created_at DESC 기반)
- POST /trigger는 확인 없이 즉시 실행 (UI에서 확인 대화상자 처리)
- L8 레이어 규칙: L0-L7 모듈 import 가능
- 응답 형태 기존 API 패턴과 일관성 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/api/routes/transfers.ts` 생성:
   - `GET /api/transfers`:
     - query params: `cursor` (optional, ISO datetime), `limit` (default 20, max 100)
     - EventLog에서 event_type IN ('TRANSFER_SUCCESS','TRANSFER_FAILED','TRANSFER_SKIP') 조회
     - created_at DESC, cursor 기반 페이지네이션
     - 응답: `{ data: TransferEvent[], nextCursor: string | null }`
   - `POST /api/transfers/trigger`:
     - body: `{ exchange?: string }` (기본 binance)
     - executeTransfer() 호출
     - 응답: `{ success: boolean, result: TransferResult }`
4. 기존 API 라우터에 transfers 라우트 등록
5. Run tests — confirm all pass (GREEN phase)
6. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- GET /api/transfers 응답에 이체 이력 배열 반환
- cursor 페이지네이션 동작 (다음 페이지 조회 가능)
- POST /api/transfers/trigger 호출 시 executeTransfer() 실행
- 존재하지 않는 exchange 지정 시 400 에러
- 응답 형태가 기존 API 패턴과 일관

## Test Scenarios
- GET /api/transfers with no events → returns { data: [], nextCursor: null }
- GET /api/transfers with 3 TRANSFER events → returns { data: [3 items], nextCursor: null }
- GET /api/transfers with limit=1 and 3 events → returns { data: [1 item], nextCursor: "..." }
- GET /api/transfers with cursor → returns only events before cursor time
- POST /api/transfers/trigger with valid exchange → calls executeTransfer, returns { success: true, result }
- POST /api/transfers/trigger with invalid exchange → returns 400 error
- GET /api/transfers does not return non-TRANSFER EventLog entries

## Validation
```bash
bun test -- --grep "api-transfers"
bun run typecheck
bun run lint
```

## Out of Scope
- 웹 UI 구현 (T-14-008)
- TRANSFER CommonCode 편집 API (기존 PUT /api/config 확장은 별도)

## Implementation Notes

### Files created
- `src/api/routes/transfers.ts` — Hono sub-router with GET /transfers and POST /transfers/trigger
- `tests/api/routes/transfers.test.ts` — 14 tests covering all 7 acceptance scenarios

### Files modified
- `src/api/server.ts` — mounted createTransferRoutes in createApiRouter
- `src/api/types.ts` — added TransfersDeps to RouteDeps intersection type
- `src/api/index.ts` — barrel-exported TransferEventRow, TransfersDeps, createTransferRoutes
- `tests/api/e2e.test.ts` — added TransfersDeps mock fields to createMockRouteDeps() and mounted the route in buildFullApp()

### Design decisions
- `nextCursor` uses `created_at` (ISO string) instead of row `id`, matching the task spec of cursor-based datetime pagination (WHERE created_at < cursor)
- Exchange validation uses SUPPORTED_EXCHANGES constant values (binance, okx, bitget, mexc) from src/core/constants.ts
- DI boundary: route handler delegates all DB access to `getTransferHistory` and all transfer execution to `triggerTransfer`; no direct DB or exchange imports in the route
- Invalid `limit` returns 400; values exceeding MAX_LIMIT (100) are silently capped

### Validation results
- bun test tests/api/routes/transfers.test.ts: 14 pass, 0 fail
- bun run typecheck: clean
- bun run lint (transfers.ts): no errors (pre-existing errors in backtest files are unrelated)
