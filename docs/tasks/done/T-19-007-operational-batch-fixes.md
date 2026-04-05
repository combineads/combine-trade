# T-19-007 Operational 수정 일괄 (Slippage EventLog, Panic Close Slack, SymbolState upsert, KNN순서)

## Metadata
- modules: [orders, reconciliation, notifications, positions, daemon]
- primary: orders

## Goal
독립적인 소규모 운영 수정 4건을 한 태스크에서 일괄 처리한다: slippage 이벤트 로그 기록(#26), Panic Close Slack @channel 긴급 표시(#33), SymbolState upsert 함수 추가(#34), KNN 실행 전 daily_bias 방향 체크 이동(#37).

## Why
- **#26**: 스프레드 초과 중단(SLIPPAGE_ABORT)과 슬리피지 청산(SLIPPAGE_CLOSE) 이벤트가 EventLog에 기록되지 않아 사후 추적 불가. PRD가 명시한 감사 로그 요건 미충족.
- **#33**: Panic Close는 긴급 상황이므로 Slack @channel 멘션이 필요하나 현재 일반 알림과 동일 형식.
- **#34**: SymbolState INSERT...ON CONFLICT DO UPDATE 경로가 없어 새 심볼 추가 시 수동 개입 필요.
- **#37**: daily_bias 방향 체크(step 9b)가 KNN 검색(step 8) 이후에 위치하여 KNN을 불필요하게 실행한 후 차단됨. PRD는 방향 체크를 KNN 전에 수행하도록 규정.

## Inputs
- `src/orders/executor.ts` — `executeEntry()` 내 spread abort / slippage close 경로
- `src/reconciliation/worker.ts:218` — `sendSlackAlert("RECONCILIATION_MISMATCH", ...)` 호출
- `src/positions/ticket-manager.ts` — SymbolState 조작 함수들
- `src/daemon/pipeline.ts:906–926` — step 9b daily_bias 체크 블록 (현재 step 8 KNN 이후)
- PRD §7.24 L469 (EventLog), §7.26 L481 (Slack @channel), §7.27 L487 (upsert), §7.28 L493 (순서)

## Dependencies
- 없음 (4개 수정 모두 독립적)

## Expected Outputs
- 수정된 `src/orders/executor.ts`
- 수정된 `src/reconciliation/worker.ts`
- 수정된 `src/positions/ticket-manager.ts`
- 수정된 `src/daemon/pipeline.ts`
- 갱신된 테스트 파일들

## Deliverables
- `src/orders/executor.ts`:
  - spread 초과 중단 경로에서 `deps.insertEvent("SLIPPAGE_ABORT", {...})` 호출 추가
  - slippage 초과 청산 경로에서 `deps.insertEvent("SLIPPAGE_CLOSE", {...})` 호출 추가
  - `ExecuteEntryParams`에 선택적 `insertEvent` dep 주입 추가
- `src/reconciliation/worker.ts`:
  - Panic Close 후 Slack 알림 메시지에 `@channel` 프리픽스 또는 `<!channel>` 태그 추가
- `src/positions/ticket-manager.ts`:
  - `upsertSymbolState(db, symbol, exchange, patch)` 함수 추가 — INSERT ... ON CONFLICT (symbol, exchange) DO UPDATE SET ...
- `src/daemon/pipeline.ts`:
  - step 9b daily_bias 방향 체크 블록을 step 8 KNN 검색 블록 **앞**으로 이동
  - 순서: ... → evidence → safety → vectorize → load KNN config → **daily_bias check** → KNN search → time-decay → decision → ...
- 각 변경에 대한 테스트 추가 또는 갱신

## Constraints
- `insertEvent` dep이 없을 경우(undefined) executor는 기존대로 동작 — 하위 호환 유지
- Slack @channel 형식: Slack Incoming Webhook은 `<!channel>` 마크업 또는 메시지 텍스트 프리픽스 사용
- `upsertSymbolState()`는 Drizzle `.insert().onConflictDoUpdate()` 패턴 사용
- daily_bias 체크 이동 시 함수 시그니처 변경 없음 — 블록 위치만 변경
- 모든 수정에서 `bun run typecheck` 통과

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `executor.ts` — spread abort 경로에 `insertEvent("SLIPPAGE_ABORT")` 추가
4. `executor.ts` — slippage close 경로에 `insertEvent("SLIPPAGE_CLOSE")` 추가
5. `reconciliation/worker.ts` — Panic Close Slack 알림에 `<!channel>` 추가
6. `positions/ticket-manager.ts` — `upsertSymbolState()` 구현
7. `daemon/pipeline.ts` — daily_bias 체크 블록 KNN 앞으로 이동
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] 스프레드 초과로 진입 중단 시 EventLog에 `SLIPPAGE_ABORT` 행 기록됨
- [x] 슬리피지 초과로 긴급 청산 시 EventLog에 `SLIPPAGE_CLOSE` 행 기록됨
- [x] `insertEvent` dep이 없으면 executor 기존 동작 유지 (이벤트 로그 없이 진행)
- [x] Panic Close 후 Slack 알림 메시지에 `<!channel>` 포함됨
- [x] `upsertSymbolState()`: 행이 없으면 INSERT, 있으면 UPDATE (충돌 무시 아님)
- [x] pipeline.ts에서 daily_bias 체크가 KNN search(`searchKnn`) 호출보다 앞에 위치
- [x] daily_bias 불일치 시 KNN search가 실행되지 않음
- [x] `bun run typecheck` 통과

## Test Scenarios
- executeEntry() with spread exceeding limit and insertEvent dep provided → insertEvent called with "SLIPPAGE_ABORT"
- executeEntry() with spread exceeding limit and no insertEvent dep → no error, abort proceeds normally
- executeEntry() with slippage exceeding limit and insertEvent dep → insertEvent called with "SLIPPAGE_CLOSE"
- reconciliation worker panic close → sendSlackAlert message body contains "<!channel>"
- upsertSymbolState() with new symbol → row inserted
- upsertSymbolState() with existing symbol → row updated (fsm_state overwritten)
- pipeline processSymbol() with daily_bias direction mismatch → searchKnn not called, returns early
- pipeline processSymbol() with daily_bias direction match → searchKnn called normally

## Validation
```bash
bun test src/orders/executor.test.ts
bun test src/reconciliation/worker.test.ts
bun test src/positions/ticket-manager.test.ts
bun test src/daemon/pipeline.test.ts
bun run typecheck
```

## Out of Scope
- Slippage 임계값 변경
- Slack 채널 설정 변경 (채널명은 CommonCode에서 유지)
- SymbolState FSM 전이 로직 변경
- KNN 결정 로직 변경
