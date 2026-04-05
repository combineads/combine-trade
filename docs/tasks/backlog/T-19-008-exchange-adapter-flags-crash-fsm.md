# T-19-008 Exchange adapter 플래그 사전 분기 + 크래시 복구 fsm 복원

## Metadata
- modules: [orders, exits, daemon]
- primary: orders

## Goal
거래소 config 플래그(`supports_one_step_order`, `supports_edit_order`)를 실제 API 호출 전에 읽어 분기하고, 크래시 복구 시 매칭된 활성 포지션의 fsm_state를 `HAS_POSITION`으로 명시적으로 설정한다.

## Why
- **#28**: 현재 `executeEntry()`는 bracket order를 항상 시도한 후 실패하면 2-step으로 폴백한다. MEXC처럼 `supports_one_step_order: false`인 거래소에서 불필요한 API 에러가 발생하고 지연이 늘어난다. PRD §4.2는 플래그를 사전에 읽어 분기하도록 명시.
- **#29**: `editOrder`를 지원하지 않는 거래소에서 트레일링 SL 수정 시 `editOrder` 호출이 실패한 후에야 cancel+create로 폴백된다. `supports_edit_order: false`이면 즉시 cancel+create 경로를 사용해야 함.
- **#31**: 크래시 복구 시 exchange에 포지션이 있고 DB ticket이 매칭되는 경우, ticket fsm_state를 `HAS_POSITION`으로 명시적으로 설정하지 않는다. 재시작 후 FSM이 잘못된 상태에서 시작될 수 있음. PRD §7.18(L371).

## Inputs
- `src/orders/executor.ts:412–423` — 브래킷 시도 + 폴백 로직
- `src/config/schema.ts:12–13` — `supports_one_step_order`, `supports_edit_order` 필드
- `src/config/seed.ts:39–85` — 거래소별 플래그 기본값
- `src/exits/manager.ts` — `editOrder` 또는 cancel+create 트레일링 SL 로직
- `src/daemon/crash-recovery.ts` — matched position 처리 블록
- PRD §4.2, §7.18 L371

## Dependencies
- 없음 (3건 모두 독립적 수정)

## Expected Outputs
- 수정된 `src/orders/executor.ts`
- 수정된 `src/exits/manager.ts` (또는 트레일링 SL 수정 담당 파일)
- 수정된 `src/daemon/crash-recovery.ts`
- 갱신된 테스트 파일들

## Deliverables
- `src/orders/executor.ts`:
  - `ExecuteEntryParams`에 `exchangeConfig: { supports_one_step_order: boolean }` dep 추가
  - `supports_one_step_order === false`이면 bracket 시도 없이 즉시 2-step 진입
  - `supports_one_step_order === true`이면 기존 로직 유지 (bracket 시도 → 실패 시 2-step)
- exits 담당 파일 (editOrder 호출 위치):
  - `supports_edit_order === false`이면 editOrder 호출 없이 즉시 cancel+create
  - `supports_edit_order === true`이면 editOrder 시도 → 실패 시 cancel+create
- `src/daemon/crash-recovery.ts`:
  - matched position 처리 블록에서 `setFsmState(symbol, exchange, "HAS_POSITION")` 또는 동등한 upsert 호출 추가
  - SL 재등록 여부와 관계없이 fsm_state를 `HAS_POSITION`으로 설정

## Constraints
- 플래그는 `getConfig("EXCHANGE", ...)` 또는 파라미터 주입으로 읽음 — 하드코딩 금지
- `supports_one_step_order` 플래그 읽기 실패 시 안전 폴백: false로 간주(2-step 사용)
- `executeEntry()` 반환 타입 및 호출자 시그니처 변경 최소화
- 크래시 복구 fsm 설정은 멱등성 보장 (이미 HAS_POSITION이어도 에러 없음)
- `bun run typecheck` 통과

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `executor.ts` — `ExecuteEntryParams`에 `exchangeConfig` 필드 추가
4. `executeEntry()` 내 bracket 시도 전에 `supports_one_step_order` 분기 추가
5. exits 담당 파일 — `supports_edit_order` 분기 추가 (editOrder vs cancel+create)
6. `crash-recovery.ts` — matched position 블록에 `setFsmState("HAS_POSITION")` 추가
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] `supports_one_step_order: false` → `attemptBracketEntry()` 호출 없이 즉시 2-step 진입
- [x] `supports_one_step_order: true` → 기존과 동일하게 bracket 먼저 시도
- [x] `supports_edit_order: false` → `editOrder()` 호출 없이 cancel+create로 SL 수정
- [x] `supports_edit_order: true` → editOrder 시도, 실패 시 cancel+create 폴백
- [x] crash recovery 후 matched position이 있는 symbol의 DB fsm_state = `HAS_POSITION`
- [x] fsm_state 설정 실패 → errors 배열에 추가, 복구 계속 진행
- [x] `bun run typecheck` 통과

## Test Scenarios
- executeEntry() with supports_one_step_order=false → attemptBracketEntry not called
- executeEntry() with supports_one_step_order=true → attemptBracketEntry called first
- executeEntry() with supports_one_step_order=false and SL fails → emergency close (bracket not attempted)
- editOrder path with supports_edit_order=false → editOrder not called, cancel+create used directly
- editOrder path with supports_edit_order=true and editOrder success → editOrder called, no cancel+create
- editOrder path with supports_edit_order=true and editOrder failure → cancel+create fallback
- crashRecovery() with matched position → setFsmState("HAS_POSITION") called for that symbol
- crashRecovery() with setFsmState failing → error logged, recovery.errors length incremented, no crash

## Validation
```bash
bun test src/orders/executor.test.ts
bun test src/daemon/crash-recovery.test.ts
bun run typecheck
```

## Implementation Notes (2026-04-05)

### #28 — supports_one_step_order (executor.ts)
- Added optional `exchangeConfig?: { supports_one_step_order: boolean }` to `ExecuteEntryParams`
- Safe fallback: absent or false → skip bracket, use 2-step directly (no wasted API round-trip)
- `supports_one_step_order: true` → bracket attempted first, falls back to 2-step on failure (preserves old behaviour)
- Updated `tests/orders/executor.test.ts` bracket tests to pass `exchangeConfig: { supports_one_step_order: true }` since they intentionally test the bracket path

### #29 — supports_edit_order (manager.ts)
- Added optional `exchangeConfig?: { supports_edit_order: boolean }` to `ProcessTrailingParams` and `ProcessExitParams`
- Safe default: absent → `true` (attempts editOrder, preserving existing behaviour)
- `false` → skip editOrder block entirely, jump directly to cancel+create
- Passes flag down to `moveSl()` via new `supportsEditOrder: boolean` parameter
- New test file: `src/exits/manager.test.ts` — 4 scenarios covering all flag combinations

### #31 — FSM state restore (crash-recovery.ts)
- Added `setFsmState: (symbol, exchange, state) => Promise<void>` to `CrashRecoveryDeps`
- Called with `"HAS_POSITION"` for every matched position, after the SL check block
- Failure captured in `errors[]` array — never throws, recovery continues (idempotent by contract)
- Updated `tests/daemon/crash-recovery.test.ts`, `tests/daemon/daemon-skeleton.test.ts`, `tests/daemon/daemon-e2e.test.ts` to include `setFsmState` mock
- New test file: `src/daemon/crash-recovery.test.ts` — 4 scenarios

### Pre-existing failure (not caused by this task)
- `handleCandleClose > daily_bias cross-validation — post-KNN PASS > bias check does not fire when KNN decision is FAIL` fails in both `src/daemon/pipeline.test.ts` and `tests/daemon/pipeline.test.ts`
- Caused by in-progress change in `src/daemon/pipeline.ts` that moved daily_bias check from post-KNN to pre-KNN position — that change is outside this task's scope

## Out of Scope
- 거래소별 API 구현 변경 (adapter 내부 로직)
- SL 재등록 로직 변경 (T-19-008의 #31은 fsm_state 설정만)
- `emergencyClose()` 로직 변경
