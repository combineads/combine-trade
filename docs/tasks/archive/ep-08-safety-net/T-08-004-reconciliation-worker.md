# T-08-004 대조 워커

## Goal
60초 간격으로 거래소 포지션과 DB 티켓을 대조하고, 불일치 시 패닉 클로즈, 고아 시 IDLE 마킹을 수행하는 워커를 구현한다.

## Why
대조 워커는 라이브 운영의 핵심 안전장치이다. 데몬 크래시/재시작 후 거래소와 DB가 동기화되지 않으면 관리되지 않는 포지션이 발생한다. 60초 주기 대조로 이를 감지하고 자동 복구한다.

## Inputs
- `src/reconciliation/comparator.ts` — comparePositions() (T-08-003 산출물)
- `src/db/event-log.ts` — insertEvent() (T-08-002 산출물)
- `src/db/schema.ts` — eventLogTable, ticketTable, symbolStateTable, orderTable
- `src/orders/executor.ts` — emergencyClose() (EP-06)
- `src/positions/ticket-manager.ts` — getActiveTicket() (EP-06)
- `src/core/ports.ts` — ExchangeAdapter (fetchPositions)

## Dependencies
- T-08-001 (EventLog 스키마)
- T-08-003 (comparator 순수 함수)

## Expected Outputs
- `src/reconciliation/worker.ts` — startReconciliation(), stopReconciliation()
- E2E(T-08-006)에서 통합 검증

## Deliverables
- `src/reconciliation/worker.ts`
- `tests/reconciliation/worker.test.ts`
- `src/reconciliation/index.ts` barrel export 업데이트

## Constraints
- setTimeout 체인 (setInterval 금지 — 실행 시간 드리프트 방지)
- emergencyClose는 EP-06 orders/executor.ts에서 import (L7→L6 허용)
- 프로덕션 모드에서 비활성화 불가 (하드코딩)
- 대조 중 에러 발생 시 로그만 남기고 다음 주기 계속 (fail-open for the worker loop, fail-closed for individual positions)
- PENDING 상태 주문 안전장치: 대조 전 PENDING 주문이 있는 심볼 목록을 조회하여 comparator에 전달
- 스냅샷 타임스탬프: 대조 시작 시 Date.now() 기록, comparator에 전달

## Steps
1. ReconciliationConfig 타입 정의 (intervalMs: 60000)
2. `startReconciliation(db, adapters, config) → { stop: () => void }` 구현
   - setTimeout 체인으로 runOnce() 반복 호출
   - stop() 호출 시 다음 주기 취소
3. `runOnce(db, adapters) → ReconciliationRunResult` 구현
   a. snapshotTime = Date.now()
   b. 각 거래소 adapter.fetchPositions() 호출
   c. DB에서 활성 티켓 조회 (state != 'CLOSED')
   d. DB에서 PENDING 주문 심볼 목록 조회
   e. comparePositions(exchangePositions, activeTickets, pendingSymbols, snapshotTime) 호출
   f. 불일치: emergencyClose() + insertEvent(RECONCILIATION, { action: 'PANIC_CLOSE' })
   g. 고아: symbolState → IDLE + insertEvent(RECONCILIATION, { action: 'ORPHAN_IDLE' })
   h. 매칭: insertEvent(RECONCILIATION, { action: 'MATCHED', count: N })
4. 테스트 작성 후 구현 (TDD) — ExchangeAdapter mock

## Acceptance Criteria
- 60초 간격 setTimeout 체인 동작
- 매칭 → EventLog 기록 (정상)
- 불일치 → emergencyClose + EventLog 기록
- 고아 → SymbolState IDLE + EventLog 기록
- PENDING 주문 안전장치: 해당 심볼 패닉 클로즈 제외
- 스냅샷 이후 생성 Ticket 제외
- 거래소 API 실패 시 해당 거래소 스킵, 다른 거래소 계속
- stop() 호출 시 주기 정상 종료

## Test Scenarios
- runOnce() all matched → EventLog MATCHED, no emergencyClose calls
- runOnce() one unmatched → emergencyClose called, EventLog PANIC_CLOSE
- runOnce() one orphaned → SymbolState set to IDLE, EventLog ORPHAN_IDLE
- runOnce() mixed results → correct handling for each category
- runOnce() PENDING symbol excluded → no panic close for that symbol
- runOnce() exchange API fails → skips that exchange, processes others
- startReconciliation() calls runOnce every ~60s (setTimeout chain)
- stopReconciliation() prevents next cycle
- runOnce() records snapshotTime → recent tickets excluded from comparison
- emergencyClose failure → logged, worker continues

## Validation
```bash
bun test -- --grep "reconciliation-worker|worker"
bun run typecheck
bun run lint
```

## Out of Scope
- 크래시 복구 시퀀스 (EP-09)
- 킬 스위치 (EP-09)
- Slack 알림 전송 (T-08-005 — 호출자가 연동)
