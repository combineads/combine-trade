# T-118 Implement kill switch DB service

## Goal
Create a Drizzle-backed service that implements `KillSwitchDeps` interface, persisting kill switch state and audit events to PostgreSQL.

## Why
EP09 M1 — kill switch logic is implemented as pure functions, but state is not persisted. Without DB backing, kill switch state is lost on restart.

## Inputs
- `packages/core/risk/kill-switch.ts` (KillSwitchDeps interface, KillSwitchState type)
- `db/schema/kill-switch.ts` (killSwitchState + killSwitchEvents tables)

## Dependencies
None (independent DB service)

## Expected Outputs
- `KillSwitchDbService` implementing KillSwitchDeps
- Audit event logging to kill_switch_events table

## Deliverables
- `packages/core/risk/kill-switch-db.ts`
- `packages/core/risk/__tests__/kill-switch-db.test.ts`

## Constraints
- loadActiveStates(): SELECT * FROM kill_switch_state WHERE is_active = true
- saveState(): UPSERT kill_switch_state + INSERT kill_switch_events for audit
- Deactivation: update kill_switch_state.is_active = false AND set kill_switch_events.deactivated_at
- Must map between Drizzle row types and KillSwitchState domain type
- DB instance injected via constructor (DI)

## Steps
1. Write tests for loadActiveStates, saveState (activate + deactivate)
2. Implement KillSwitchDbService class
3. Map between Drizzle schema columns and KillSwitchState
4. Implement audit event logging on state changes

## Acceptance Criteria
- loadActiveStates returns only active kill switches
- saveState with active=true creates/updates state + creates audit event
- saveState with active=false updates state + sets deactivatedAt on audit event
- All operations use Drizzle query builder

## Validation
```bash
bun test packages/core/risk/__tests__/kill-switch-db.test.ts
bun run typecheck
```

## Out of Scope
- Auto-triggers (separate task)
- Slack notifications
- Kill switch API route

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/core/risk/kill-switch-db.ts` (new), `packages/core/risk/__tests__/kill-switch-db.test.ts` (new — 7 tests)
- **Approach**: TDD. `KillSwitchDbService` implements `KillSwitchDeps` with `KillSwitchDbDeps` for query injection. Maps DB rows (strategyId null = global scope) to domain `KillSwitchState`. Activation inserts audit event; deactivation updates audit event's deactivatedAt.
- **Validation**: 7/7 tests pass, typecheck clean, 1080 total tests.

## Outputs
- `KillSwitchDbService` implementing `KillSwitchDeps`
- `KillSwitchDbDeps` interface for Drizzle query injection
- `KillSwitchRow`, `KillSwitchEventRow` interfaces
