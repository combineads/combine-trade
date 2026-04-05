# T-18-009 FSM 전이 DB 기록 (WATCHING ↔ IDLE)

## Metadata
- modules: [signals, positions]
- primary: signals

## Goal
`openWatchSession()` 시 `symbol_state.fsm_state = 'WATCHING'`, `invalidateWatchSession()` 시 `fsm_state = 'IDLE'`을 DB에 기록한다.

## Why
현재 코드베이스에 `fsm_state = "WATCHING"`을 SET하는 구문이 0건 (grep 확인). `openWatchSession()`은 `watch_session` 테이블만 기록하고, `symbol_state.fsm_state`는 변경하지 않음. `createTicket()`이 `fsm_state === "WATCHING"` 전제조건을 검증하므로, fsm_state가 WATCHING으로 전이되지 않으면 진입이 영원히 불가능할 수 있음.

## Inputs
- PRD §6 L190-192:
  - IDLE → WATCHING (WatchSession 조건 충족)
  - WATCHING → IDLE (전제 붕괴)
- `src/signals/watching.ts:365-407` — openWatchSession()
- `src/signals/watching.ts:413-425` — invalidateWatchSession()
- `src/positions/fsm.ts:135` — SYMBOL_STATE_TRANSITION_MAP

## Dependencies
- 없음

## Expected Outputs
- 수정된 `src/signals/watching.ts`
- 테스트

## Deliverables
- `openWatchSession()`: 세션 INSERT 후 `symbol_state.fsm_state = 'WATCHING'` UPDATE
  - 전제: 현재 fsm_state가 IDLE인 경우에만 (HAS_POSITION이면 전이 안 함)
  - `validateTransition('IDLE', 'WATCHING')` 사용
- `invalidateWatchSession()`: `invalidated_at` SET 후 `symbol_state.fsm_state = 'IDLE'` UPDATE
  - 전제: 현재 fsm_state가 WATCHING인 경우에만 (HAS_POSITION이면 전이 안 함)
  - active ticket이 있으면 fsm_state 변경 안 함
- 두 함수에 symbol + exchange 인자가 필요 (invalidateWatchSession은 현재 sessionId만 받음)

## Constraints
- 레이어 규칙: signals(L5) → positions(L5) 직접 임포트 불가 (같은 레이어 금지)
  - 해결: `validateTransition`은 `fsm.ts`(positions/L5)에 있지만, 같은 레이어 L5→L5 임포트 금지
  - 대안 1: fsm 검증 로직을 core(L0)로 이동
  - 대안 2: daemon(L9)에서 openWatchSession 후 fsm_state UPDATE 실행
  - 대안 3: watching.ts에서 직접 symbol_state UPDATE (fsm 검증 없이, DB CHECK 제약으로 보호)
  - **권장: 대안 3** — symbol_state.fsm_state UPDATE는 단순 SET이고, DB CHECK 제약이 유효한 값만 허용
- invalidateWatchSession 시그니처 확장: sessionId + symbol + exchange 필요
  - 또는: sessionId로 watch_session 조회 후 symbol/exchange 획득

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `openWatchSession()`: 세션 INSERT 후 symbol_state UPDATE (fsm_state='WATCHING')
   - 조건: 현재 fsm_state = 'IDLE' (WHERE 절에 포함)
4. `invalidateWatchSession()` 시그니처에 symbol/exchange 추가 (또는 세션 조회)
5. `invalidateWatchSession()`: invalidated_at SET 후 symbol_state UPDATE (fsm_state='IDLE')
   - 조건: 현재 fsm_state = 'WATCHING' (WHERE 절에 포함, HAS_POSITION 보호)
6. pipeline.ts���서 호출부 시그니처 맞춤
7. backtest adapter에서 watching 함수 mock 갱신
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] openWatchSession → symbol_state.fsm_state = 'WATCHING' DB 확인
- [x] openWatchSession with fsm_state='HAS_POSITION' → fsm_state 변경 없음
- [x] invalidateWatchSession → symbol_state.fsm_state = 'IDLE' DB 확인
- [x] invalidateWatchSession with fsm_state='HAS_POSITION' → fsm_state 변경 없음 (active ticket 보호)
- [x] createTicket() → fsm_state='WATCHING' 전제조건 충족으로 정상 진입 (ticket-manager.test.ts 기존 통과)
- [x] 전체 FSM 경로: IDLE → WATCHING → HAS_POSITION → IDLE 통합 검증 (lifecycle test)

## Test Scenarios
- openWatchSession() with fsm_state='IDLE' → fsm_state becomes 'WATCHING'
- openWatchSession() with fsm_state='HAS_POSITION' → fsm_state unchanged
- invalidateWatchSession() with fsm_state='WATCHING' → fsm_state becomes 'IDLE'
- invalidateWatchSession() with fsm_state='HAS_POSITION' → fsm_state unchanged (ticket protection)
- full lifecycle: IDLE → openWatchSession → WATCHING → createTicket → HAS_POSITION → closeTicket → IDLE
- openWatchSession() replacing active session → old session invalidated + fsm stays WATCHING
- invalidateWatchSession() on already-invalidated session → no fsm_state change

## Validation
```bash
bun test src/signals/watching.test.ts
bun test src/positions/ticket-manager.test.ts
bun test src/daemon/pipeline.test.ts
bun run typecheck
```

## Out of Scope
- crash-recovery에서 fsm_state 복원 (P2 항목)
- reconciliation에서 fsm_state 정합성 검사 (P2 항목)

## Implementation Notes
- **Design choice**: Option B (session lookup) — `invalidateWatchSession` queries `watch_session` for symbol/exchange before updating `symbol_state`. No signature change; callers in `pipeline.ts` and `crash-recovery.ts` unchanged.
- **Layer constraint respected**: No import from `positions/fsm.ts`. FSM validation done entirely via SQL WHERE clause (`fsm_state = 'IDLE'` or `fsm_state = 'WATCHING'`) with DB CHECK constraint as safety net.
- **backtest/pipeline-adapter.ts**: No changes needed — in-memory state already tracks `activeWatchSessions` correctly. The `invalidateWatchSession` mock already deletes from `activeWatchSessions` map which effectively replaces fsm_state tracking in tests.
- **Callers**: `pipeline.ts` and `crash-recovery.ts` signatures unchanged. `crash-recovery`'s `invalidateWatchSession` dep is a wrapper `(id, reason) => Promise<void>` — no `db` param — so the SELECT approach works transparently.
- **Tests**: 7 new FSM transition integration tests added to `tests/signals/watching.test.ts` inside the existing `watching — DB integration` describe block. All 48 tests pass.
- **Validation**: `bun test tests/signals/watching.test.ts` — 48 pass / 0 fail. `bun test tests/positions/ticket-manager.test.ts` — 26 pass / 0 fail. No typecheck errors in changed files.
