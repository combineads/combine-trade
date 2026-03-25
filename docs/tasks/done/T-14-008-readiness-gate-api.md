# T-14-008 Readiness Gate Enforcement API and Score Reset Conditions

## Goal
Build API endpoints that enforce the readiness gate before allowing mode transitions from paper to live trading, and implement automated score reset triggers for loss limit breaches, kill switch events, and strategy code changes.

## Why
Preventing premature transition from paper to live trading is a critical safety requirement. Without a gate that enforces a minimum readiness score, traders could switch to live trading before their strategy is validated, risking real capital on an unproven system. Score reset triggers ensure that adverse events force re-validation before live trading is re-enabled.

## Inputs
- `packages/shared/db/schema/readiness_scores.ts` — readiness score table (T-14-004)
- `packages/shared/db/schema/strategies.ts` — strategy table with version tracking
- `apps/api/src/routes/trading/` — trading router
- `packages/shared/event-bus/` — event bus for kill switch and loss limit events
- `docs/exec-plans/14-paper-trading.md` — EP14 readiness gate spec

## Dependencies
- T-14-004 (readiness score computation — provides the score schema and computation logic)

## Expected Outputs
- `apps/api/src/routes/trading/mode.ts` — mode transition endpoint with gate enforcement
- `apps/api/src/routes/trading/readiness.ts` — readiness score query endpoint
- `apps/api/src/services/readiness-reset.ts` — score reset trigger service
- `apps/api/__tests__/routes/trading-readiness.test.ts` — test suite
- Updated `apps/api/src/routes/trading/index.ts` — registers mode and readiness routes

## Deliverables
- `POST /api/v1/trading/mode/:strategyId` — mode transition endpoint:
  - Body: `{ mode: 'paper' | 'live' }`
  - Rejects with 422 and `{ error: 'READINESS_GATE_FAILED', score: number, required: 70 }` if readiness score < 70 when transitioning to live
  - Paper → paper and live → paper transitions always permitted
  - Updates strategy execution mode on success
  - Returns `{ strategyId, mode, readinessScore }`
- `GET /api/v1/trading/readiness/:strategyId` — readiness score query:
  - Returns `ReadinessReport`: `{ overall: number; components: { paper: number; backtest: number; risk: number }; canGoLive: boolean }`
  - `canGoLive: true` only when overall >= 70
- `ReadinessResetService`:
  - Loss limit breach event → reset paper score to 0 for affected strategyId
  - Kill switch event → reset risk score to 0 for all strategies under the user
  - Strategy code change (new version deployed) → reset backtest score to 0 for strategyId
  - All resets are idempotent (re-running has no additional effect)

## Constraints
- Readiness threshold of 70 is a hard-coded constant — do not make it configurable per-strategy in this task
- Mode transition to live must be atomic: gate check and mode update in the same DB transaction
- Kill switch reset must affect all strategies for the user, not just the triggering strategy
- Score reset must not delete historical score records — insert a new zero-score record
- All endpoints require JWT authentication with userId

## Steps
1. Write failing tests first (RED):
   - Test: `POST /mode` with score < 70 returns 422 with READINESS_GATE_FAILED
   - Test: `POST /mode` with score >= 70 transitions to live successfully
   - Test: `POST /mode` paper → paper always succeeds regardless of score
   - Test: `POST /mode` live → paper always succeeds regardless of score
   - Test: `GET /readiness` returns component scores and `canGoLive`
   - Test: loss limit breach resets paper score to 0
   - Test: kill switch resets risk score to 0 for all user strategies
   - Test: code change resets backtest score to 0
   - Test: resets are idempotent
2. Implement mode transition endpoint with gate check in transaction (GREEN)
3. Implement readiness query endpoint (GREEN)
4. Implement `ReadinessResetService` with event handlers (GREEN)
5. Register event listeners in service startup
6. Refactor (REFACTOR): extract gate check predicate as a pure function

## Acceptance Criteria
- Mode transition to live rejected with 422 when readiness score < 70
- Mode transition to live succeeds when score >= 70
- Paper/live → paper transitions always succeed
- `GET /readiness` returns accurate component breakdown
- Loss limit breach correctly resets paper component score
- Kill switch correctly resets risk component for all user strategies
- Code change correctly resets backtest component score
- All resets are idempotent
- `bun test -- --filter "readiness-gate"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "readiness-gate"
bun run typecheck
bun run lint
```

## Out of Scope
- Configurable readiness threshold per strategy (hardcoded at 70 for now)
- Readiness score computation logic (T-14-004)
- UI for readiness display (EP22)
- Automated re-enablement after score recovery
