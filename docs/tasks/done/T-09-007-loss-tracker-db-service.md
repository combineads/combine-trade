# T-09-007 Implement loss tracker DB service

## Goal
Create a Drizzle-backed service that implements `LossTrackerDeps` interface, persisting PnL records and loss limit configuration to PostgreSQL.

## Why
EP09 M2 — loss tracking logic is pure functions but not connected to DB. Without persistence, daily/weekly loss tracking resets on restart.

## Inputs
- `packages/core/risk/loss-tracker.ts` (LossTrackerDeps interface, PnlRecord type)
- `db/schema/daily-loss-limits.ts` (dailyLossLimits + dailyPnlTracking tables)

## Dependencies
None (independent DB service)

## Expected Outputs
- `LossTrackerDbService` implementing LossTrackerDeps
- Loss limit configuration CRUD

## Deliverables
- `packages/core/risk/loss-tracker-db.ts`
- `packages/core/risk/__tests__/loss-tracker-db.test.ts`

## Constraints
- loadTodayRecords(): SELECT FROM daily_pnl_tracking WHERE date = today, ORDER BY updated_at DESC
- loadWeekRecords(): SELECT WHERE date >= start of current week (Monday)
- saveRecord(): INSERT into daily_pnl_tracking
- Date calculations must use UTC
- DB instance injected via constructor (DI)

## Steps
1. Write tests for loadTodayRecords, loadWeekRecords, saveRecord
2. Implement LossTrackerDbService class
3. Handle UTC date boundary calculations
4. Map between Drizzle schema and PnlRecord

## Acceptance Criteria
- loadTodayRecords returns only today's records (UTC)
- loadWeekRecords returns current week's records (Monday-Sunday UTC)
- saveRecord persists PnL with correct date and strategy
- Records ordered by most recent first

## Validation
```bash
bun test packages/core/risk/__tests__/loss-tracker-db.test.ts
bun run typecheck
```

## Out of Scope
- Loss limit enforcement logic (already implemented in loss-tracker.ts)
- Auto-reset (separate concern)
- Slack notifications

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/core/risk/loss-tracker-db.ts` (new), `packages/core/risk/__tests__/loss-tracker-db.test.ts` (new — 5 tests)
- **Approach**: TDD. `LossTrackerDbService` implements `LossTrackerDeps`. UTC date calculations via `getUtcDateString()` and `getWeekStartUtc()` (Monday-based). Maps `PnlRow` (DB) to `PnlRecord` (domain) with `updatedAt → closedAt`.
- **Validation**: 5/5 tests pass, typecheck clean, 1080 total tests.

## Outputs
- `LossTrackerDbService` implementing `LossTrackerDeps`
- `LossTrackerDbDeps` interface for Drizzle query injection
- `PnlRow` interface matching DB schema
