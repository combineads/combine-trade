# T-18-005 Daily Loss Limit balance 인자 수정

## Metadata
- modules: [daemon, limits]
- primary: daemon
- status: done

## Goal
`pipeline.ts:660`에서 `checkLossLimit()`에 전달되는 두 번째 인자를 `losses_today` → 실제 account balance로 수정하고, `checkAccountDailyLimit()`를 pipeline 진입부에 활성화한다.

## Why
현재 코드: `checkLossLimit(lossState, symbolState.losses_today, config)` — 한도 = `losses_today × 10%`. 첫 손실($100) 이후 한도가 $10이 되어 즉시 후속 진입 차단. PRD §7.15: `SUM(losses_today) ≥ balance × 10%` — balance가 $10,000이면 한도는 $1,000이어야 함.

## Inputs
- PRD §7.15 L347: `일일: SUM(losses_today) ≥ balance × 10% → 당일 전체 중단`
- `src/daemon/pipeline.ts:660`
- `src/limits/loss-limit.ts:115-147` (checkLossLimit)
- `src/limits/loss-limit.ts:250-269` (checkAccountDailyLimit — 현재 미사용)

## Dependencies
- 없음

## Expected Outputs
- 수정된 `src/daemon/pipeline.ts` — 실제 balance 전달
- `checkAccountDailyLimit()` 호출 추가
- 테스트

## Deliverables
- `PipelineDeps`에 `getBalance(exchange: string): Promise<Decimal>` 추가 (ExchangeAdapter에서 가져옴)
- `pipeline.ts:660`: `symbolState.losses_today` → `await deps.getBalance(exchange)` 로 변경
- `processEntry()` 진입부에 `checkAccountDailyLimit(db, balance, config)` 호출 추가
- `checkAccountDailyLimit` 차단 시 로그 + return
- 테스트

## Constraints
- `checkLossLimit()` 순수 함수 시그니처 변경 없음
- `getBalance()`는 캐시된 값 사용 가능 (매 candle close마다 거래소 API 호출 불필요)
- Decimal.js 사용

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `PipelineDeps` 인터페이스에 `getBalance` 메서드 추가
4. `pipeline.ts`: processEntry에서 `await deps.getBalance(exchange)`로 balance 획득
5. `pipeline.ts:660`: 두 번째 인자를 balance로 변경
6. processEntry 진입부에 `checkAccountDailyLimit(deps.db, balance, lossConfig)` 호출 추가
7. 차단 시 로그 출력 + return
8. backtest pipeline-adapter에서 `getBalance` mock 구현
9. Run tests — confirm all pass (GREEN phase)
10. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] balance=$10,000, losses_today=$900 → 허용 (900 < 1000)
- [x] balance=$10,000, losses_today=$1,000 → 차단
- [x] checkAccountDailyLimit: 전 심볼 합산 $950+$50=$1,000 → 차단
- [x] checkAccountDailyLimit: 전 심볼 합산 $500+$400=$900 → 허용
- [x] 백테스트 mock adapter에서 getBalance 정상 동작

## Test Scenarios
- processEntry() with balance=10000 and losses_today=900 → entry allowed (per-symbol check passes)
- processEntry() with balance=10000 and losses_today=1000 → entry blocked (DAILY violation)
- checkAccountDailyLimit() with sum(losses_today)=999, balance=10000 → allowed
- checkAccountDailyLimit() with sum(losses_today)=1000, balance=10000 → blocked
- processEntry() calls checkAccountDailyLimit before per-symbol check
- backtest PipelineDeps provides getBalance returning configured seed capital

## Validation
```bash
bun test src/limits/loss-limit.test.ts
bun test src/daemon/pipeline.test.ts
bun run typecheck
```

## Out of Scope
- 손실 카운터 리셋 → T-18-006
- balance 캐시 전략 최적화 — 기본 구현만

## Implementation Notes
### Files modified
- `src/daemon/pipeline.ts` — Added `getBalance` and `checkAccountDailyLimit` to `PipelineDeps`.
  Fixed `processEntry()`: call `deps.getBalance(exchange)` before loss limit checks, pass real
  balance to `checkLossLimit()`, and call `checkAccountDailyLimit()` before per-symbol check.
  Account limit breach logs `pipeline_entry_account_daily_limit` and returns early.
- `src/backtest/pipeline-adapter.ts` — Added `checkAccountDailyLimit` import and `getBalance` mock
  that delegates to `adapter.fetchBalance().total`.
- `src/limits/loss-limit.test.ts` — New: 10 tests for `checkLossLimit` balance arg correctness
  and `checkAccountDailyLimit` boundary conditions.
- `src/daemon/pipeline.test.ts` — New: 7 tests verifying `getBalance` value flows to
  `checkLossLimit`, `checkAccountDailyLimit` is called before per-symbol check, and backtest
  adapter provides `getBalance`.
- `tests/daemon/pipeline.test.ts` — Added `checkAccountDailyLimit` and `getBalance` mocks to
  existing `defaultDeps` factory.
- `tests/daemon/daemon-e2e.test.ts` — Same: added the two new PipelineDeps mocks.

### Validation result: PASS
- `bun test src/limits/loss-limit.test.ts` — 10/10 pass
- `bun test src/daemon/pipeline.test.ts` — 7/7 pass
- `bun run typecheck` — clean (0 errors)
- `bun run lint` — clean (0 errors)
- `tests/daemon/pipeline.test.ts` + `tests/daemon/daemon-e2e.test.ts` — 96/96 pass
