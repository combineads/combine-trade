# T-11-007 제어 API — mode, kill-switch, trade-blocks CRUD

## Goal
시스템 제어 API를 구현한다: 실행 모드 전환, 킬 스위치 트리거, Trade Block CRUD.

## Why
대시보드 헤더에서 실행 모드 전환, Trade Block 토글, 킬스위치 버튼이 이 API를 호출한다.

## Inputs
- `docs/exec-plans/11-api-web.md` M3
- `docs/DATA_MODEL.md` — SymbolState, TradeBlock, EventLog
- `src/daemon/shutdown.ts` — getExecutionMode()
- `scripts/kill-switch.ts` — killSwitch() 로직

## Dependencies
- T-11-003 (미들웨어)

## Expected Outputs
- `src/api/routes/control.ts` — PUT /api/mode, POST /api/kill-switch, POST /api/trade-blocks, DELETE /api/trade-blocks/:id

## Deliverables
- `src/api/routes/control.ts`
- `tests/api/routes/control.test.ts`

## Constraints
- PUT /api/mode body: `{ mode: "analysis" | "alert" | "live" }` — Zod 검증
- live 전환 시 응답에 `{ warning: "Live mode enables real trading" }` 포함
- POST /api/kill-switch — EP-09 killSwitch() 함수를 호출 (DI로 주입)
- POST /api/trade-blocks body: `{ reason, start_time, end_time }` — MANUAL 타입 고정
- 모든 제어 API 호출 시 EventLog 기록 (MODE_CHANGE, KILL_SWITCH, TRADE_BLOCK_CREATED 등)
- SymbolState.execution_mode 갱신은 전 심볼×거래소에 대해 수행

## Steps
1. `src/api/routes/control.ts` — ControlDeps 타입 (updateMode, killSwitch, createTradeBlock, deleteTradeBlock, recordEvent)
2. PUT /api/mode — Zod 검증, 전 SymbolState UPDATE, EventLog MODE_CHANGE 기록
3. POST /api/kill-switch — killSwitch(deps) 호출, 결과 반환, EventLog KILL_SWITCH 기록
4. POST /api/trade-blocks — Zod 검증 (reason, start_time, end_time), INSERT, EventLog TRADE_BLOCK_CREATED
5. DELETE /api/trade-blocks/:id — 존재 확인, DELETE, EventLog TRADE_BLOCK_DELETED
6. 테스트 작성

## Acceptance Criteria
- PUT /api/mode { mode: "analysis" } → 200 + 전 심볼 execution_mode 갱신
- PUT /api/mode { mode: "live" } → 200 + warning 메시지 포함
- PUT /api/mode { mode: "invalid" } → 400
- POST /api/kill-switch → 200 + `{ positions_closed, orders_cancelled, errors }`
- POST /api/trade-blocks { reason, start_time, end_time } → 201 + 생성된 trade block
- DELETE /api/trade-blocks/:id → 200 (존재) 또는 404 (미존재)
- 모든 제어 API → EventLog에 기록됨

## Test Scenarios
- PUT /api/mode with valid mode "analysis" → 200, all SymbolStates updated
- PUT /api/mode with "live" → 200, response includes warning
- PUT /api/mode with invalid mode → 400 validation error
- POST /api/kill-switch → calls killSwitch deps function, returns result
- POST /api/kill-switch when killSwitch throws → 500 error with message
- POST /api/trade-blocks with valid body → 201, block_type = MANUAL
- POST /api/trade-blocks with missing reason → 400
- DELETE /api/trade-blocks/:id with existing id → 200
- DELETE /api/trade-blocks/:id with non-existing id → 404
- All control endpoints → EventLog record created

## Validation
```bash
bun test -- tests/api/routes/control.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- PUT /api/config (Non-goals)
- ANCHOR 보호 (config 수정 API 없으므로 불필요)
