# T-14-010 Paper Reset API with Run History Preservation

## Goal
Build a paper trading reset API endpoint that archives the current paper trading run to a history table before resetting balances, positions, and orders, preserving the history for future comparison.

## Why
Users periodically need to reset their paper trading state to start fresh — after a strategy change, after a poor run they want to discard, or to re-test with a new initial balance. Simply deleting the data would destroy valuable performance history. Archiving each run before reset allows traders to compare runs over time and understand how strategy changes affected outcomes.

## Inputs
- `packages/shared/db/schema/paper_balances.ts` — paper_balances table (T-14-002)
- `packages/shared/db/schema/paper_positions.ts` — paper_positions table (T-14-002)
- `packages/shared/db/schema/paper_orders.ts` — paper_orders table (T-14-002)
- `apps/api/src/routes/paper/index.ts` — paper router (T-14-009)
- `packages/shared/db/index.ts` — DrizzleORM instance
- `docs/exec-plans/14-paper-trading.md` — EP14 reset spec

## Dependencies
- T-14-009 (paper trading status/orders/performance API — establishes the paper router and auth patterns)

## Expected Outputs
- Migration: `packages/shared/db/migrations/XXXX_create_paper_runs.sql` — creates paper_runs table
- `packages/shared/db/schema/paper_runs.ts` — paper_runs Drizzle schema
- `apps/api/src/routes/paper/reset.ts` — reset endpoint handler
- `apps/api/__tests__/routes/paper-reset.test.ts` — test suite
- Updated `apps/api/src/routes/paper/index.ts` — registers reset route
- `bun run db:generate` output committed

## Deliverables
- `paper_runs` table schema:
  - `id` UUID PK
  - `strategyId` UUID FK → strategies
  - `userId` UUID FK → users
  - `runId` UUID (the ID of the run being archived)
  - `startedAt` TIMESTAMPTZ
  - `endedAt` TIMESTAMPTZ
  - `startBalance` NUMERIC
  - `finalBalance` NUMERIC
  - `tradeCount` INTEGER
  - `winCount` INTEGER
  - `lossCount` INTEGER
  - `totalPnl` NUMERIC
  - `createdAt` TIMESTAMPTZ
- `POST /api/v1/paper/:strategyId/reset` — reset endpoint:
  - Optional body: `{ initialBalance?: string }` (default: strategy's configured initial balance)
  - Archives current run to paper_runs (captures finalBalance, tradeCount, startedAt from current run)
  - Deletes all paper_positions and paper_orders for strategyId
  - Resets paper_balances to initialBalance with a new runId
  - Returns: `{ newRunId: string; archivedRunId: string; initialBalance: string }`
  - All steps in a single DB transaction (atomic — no partial resets)

## Constraints
- Entire reset operation must be atomic in a single DB transaction
- `initialBalance` must be a positive Decimal — reject with 400 if zero or negative
- User isolation: strategy must belong to authenticated userId — return 403 otherwise
- Archive must be created before any deletion — rollback entirely if archive fails
- Do not delete paper_runs records (they are permanent historical records)

## Steps
1. Write failing tests first (RED):
   - Test: `POST /reset` archives current run to paper_runs before reset
   - Test: `POST /reset` resets paper_balances to initialBalance with new runId
   - Test: `POST /reset` deletes all paper_positions for strategyId
   - Test: `POST /reset` deletes all paper_orders for strategyId
   - Test: archived run has correct finalBalance and tradeCount
   - Test: `POST /reset` is atomic — if archive fails, no data is deleted
   - Test: returns 403 for another user's strategy
   - Test: returns 400 for initialBalance <= 0
   - Test: optional initialBalance uses strategy default when omitted
2. Create paper_runs schema and generate migration (GREEN)
3. Implement reset endpoint with atomic transaction (GREEN)
4. Register route in paper router
5. Refactor (REFACTOR): extract archive logic as a separate function for testability

## Acceptance Criteria
- Reset is atomic: either archive + reset both succeed or neither happens
- paper_runs entry has correct start/end dates, finalBalance, and tradeCount after reset
- paper_balances reset to initialBalance with fresh runId after reset
- paper_positions and paper_orders cleared for the strategy
- paper_runs records never deleted
- 403 on cross-user access, 400 on invalid initialBalance
- `bun test -- --filter "paper-reset"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "paper-reset"
bun run typecheck
bun run lint
```

## Out of Scope
- Run comparison UI (EP22)
- Automatic reset triggers (e.g. on strategy version change)
- Partial reset (reset positions only, keep orders)
- Export of archived runs to CSV
