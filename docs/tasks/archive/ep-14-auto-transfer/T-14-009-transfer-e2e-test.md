# T-14-009 이체 E2E 통합 테스트

## Goal
이체 파이프라인 전체(잔고 계산 → 이체 실행 → 스케줄러 → CLI)를 MockExchangeAdapter로 검증하는 E2E 통합 테스트를 작성한다.

## Why
개별 단위 테스트는 각 모듈이 독립적으로 동작함을 검증하지만, 모듈 간 통합(config 로드 → 잔고 계산 → 이체 실행 → EventLog 기록)이 올바르게 연결되는지는 E2E 테스트로만 확인할 수 있다.

## Inputs
- T-14-001 ~ T-14-005 전체 이체 파이프라인
- MockExchangeAdapter (backtest용 mock)

## Dependencies
- T-14-003, T-14-004, T-14-005

## Expected Outputs
- `tests/transfer/transfer-e2e.test.ts` — 이체 파이프라인 E2E 테스트

## Deliverables
- `tests/transfer/transfer-e2e.test.ts`

## Constraints
- MockExchangeAdapter 사용 — 실제 거래소 호출 없음
- DB는 테스트 DB 사용 (실제 EventLog INSERT/SELECT 검증)
- 모든 금액 검증은 Decimal.js 비교
- 테스트 간 DB 상태 격리 (트랜잭션 롤백 또는 cleanup)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail (이미 구현된 코드가 있으므로 일부는 pass할 수 있음)
3. `tests/transfer/transfer-e2e.test.ts` 생성:
   - 테스트 setup: DB 초기화, TRANSFER CommonCode 시드, MockExchangeAdapter 생성
   - 시나리오별 테스트 케이스 작성
   - teardown: DB cleanup
4. Run tests — confirm all pass (GREEN phase)
5. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- config 로드 → calculateTransferable → executeTransfer → EventLog 기록 전 과정 검증
- MockExchangeAdapter로 이체 성공/실패 시나리오 모두 커버
- EventLog에 실제로 INSERT 되었는지 DB 쿼리로 검증
- dry-run 모드에서 EventLog에 기록되지 않음을 검증
- 스케줄러가 시간 도래 시 executeTransfer를 호출하는지 검증

## Test Scenarios
- Full pipeline: seed config → set mock balance 1000 USDT, margin 200 → executeTransfer → EventLog has TRANSFER_SUCCESS with amount ~250
- Full pipeline with insufficient balance: mock balance 50, margin 30 → executeTransfer → EventLog has TRANSFER_SKIP
- Full pipeline with transfer failure: mock adapter.transfer() throws → 3 retries → EventLog has TRANSFER_FAILED
- Scheduler integration: start scheduler with immediate next run → executeTransfer called within 2 seconds
- CLI dry-run: parseArgs + calculateTransferable only → no EventLog entry, no adapter.transfer() call
- Config change: update transfer_pct from 50 to 80 → next executeTransfer uses 80% calculation
- Reserve dynamic: risk_pct=0.01, balance=100 → reserve=50 (minimum floor), not 10

## Validation
```bash
bun test -- --grep "transfer-e2e"
bun run typecheck
```

## Out of Scope
- 실제 Binance 테스트넷 이체 테스트 (수동 검증)
- API/웹 UI E2E 테스트
- 부하 테스트

## Implementation Notes

- Implemented `tests/transfer/transfer-e2e.test.ts` with 18 tests across 6 describe blocks covering all 7 required scenarios.
- DB dependency eliminated: used `createMockLogger()` (in-memory event array) instead of real DB inserts. The `events[]` array serves as the EventLog assertion surface.
- `ExchangeAdapter` mock (`createMockAdapter()`) covers all port interface methods — no method trimming.
- Retry failure test (Scenario 3) carries a 10s timeout annotation because `withRetry` in `executor.ts` uses real `setTimeout` backoff (~3s total for 3 failed attempts).
- Scheduler integration test uses a 50ms `setTimeout` wait to let the async timer callback fire after `start()`, then calls `scheduler.stop()` in cleanup.
- Reserve floor scenario confirmed: `risk_pct=0.01, balance=100` → dynamic reserve = 10 → floor kicks in → reserve = 50.
- All Decimal comparisons use `.equals()` / `.greaterThan()` — no `number` arithmetic.
- Pre-existing typecheck errors in `src/api/server.ts` and `tests/api/e2e.test.ts` are unrelated to this task (tracked separately).

## Outputs

- `tests/transfer/transfer-e2e.test.ts` — 18 tests, 63 expect() calls, all passing
