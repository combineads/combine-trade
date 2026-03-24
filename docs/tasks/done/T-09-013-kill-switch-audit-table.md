# T-09-013 Kill switch audit table

## Goal
Create the `kill_switch_events` audit table schema and a repository interface for recording every kill switch activation with a positions snapshot.

## Why
EP09 M1 — all kill switch activations must be logged with position snapshots for post-mortem analysis. Without a persistent audit trail, operators cannot reconstruct what positions existed at the time of activation or diagnose why the kill switch fired.

## Inputs
- `docs/exec-plans/09-risk-management.md` M1 (audit table requirement, positions snapshot)
- `packages/core/risk/kill-switch.ts` (KillSwitchState, KillSwitchScope, KillSwitchTrigger types)
- `packages/db/` — existing DrizzleORM schema patterns
- Architecture guardrail: `packages/core` must not import Drizzle — repository interface lives in core, implementation in packages/db

## Dependencies
- T-09-001 (kill switch state machine — provides KillSwitchScope and KillSwitchTrigger types)

## Expected Outputs
- `packages/db/schema/kill-switch-events.ts`
  - `killSwitchEvents` DrizzleORM table:
    - `id` uuid primary key, default `crypto.randomUUID()`
    - `killSwitchStateId` varchar — FK reference to the kill switch state that fired
    - `triggerType` varchar — mirrors `KillSwitchTrigger`
    - `triggerReason` text — human-readable description of why it fired
    - `scope` varchar — mirrors `KillSwitchScope`
    - `scopeTarget` varchar nullable — exchangeId or strategyId
    - `positionsSnapshot` jsonb — array of open position records at time of activation
    - `activatedAt` timestamp with timezone, not null
    - `deactivatedAt` timestamp with timezone, nullable
    - `deactivatedBy` varchar nullable — userId or "system"
- `packages/core/risk/kill-switch-audit.ts`
  - `KillSwitchAuditEvent` interface (mirrors the table shape, no Drizzle imports)
  - `KillSwitchAuditDeps` interface:
    ```ts
    interface KillSwitchAuditDeps {
      insertEvent(event: KillSwitchAuditEvent): Promise<void>;
      findByStateId(killSwitchStateId: string): Promise<KillSwitchAuditEvent | null>;
      listRecent(limit: number): Promise<KillSwitchAuditEvent[]>;
    }
    ```
  - `createAuditEvent(state: KillSwitchState, reason: string, positionsSnapshot: unknown[]): KillSwitchAuditEvent` — pure factory, sets `activatedAt: new Date()`
  - `recordDeactivation(event: KillSwitchAuditEvent, deactivatedBy: string): KillSwitchAuditEvent` — pure, returns new event with `deactivatedAt` and `deactivatedBy` set
- `packages/db/repositories/kill-switch-audit-repository.ts`
  - Implements `KillSwitchAuditDeps` using DrizzleORM
- `packages/core/risk/__tests__/kill-switch-audit.test.ts`

## Deliverables
- `packages/db/schema/kill-switch-events.ts`
- `packages/core/risk/kill-switch-audit.ts`
- `packages/core/risk/__tests__/kill-switch-audit.test.ts`
- `packages/db/repositories/kill-switch-audit-repository.ts`

## Constraints
- `packages/core/risk/kill-switch-audit.ts` must not import Drizzle, CCXT, Elysia, or Slack
- `positionsSnapshot` is stored as JSONB — no schema enforcement on contents at the DB level
- `createAuditEvent` and `recordDeactivation` are pure functions; they never mutate their inputs
- `activatedAt` is always `new Date()` inside `createAuditEvent`; callers cannot override it
- All tests use `bun:test`; mock deps are plain inline objects

## Steps
1. Write failing tests in `packages/core/risk/__tests__/kill-switch-audit.test.ts` (RED):
   - `createAuditEvent` returns event with correct `triggerType`, `scope`, `scopeTarget`, `triggerReason`
   - `createAuditEvent` sets `activatedAt` to a Date, `deactivatedAt` to null
   - `createAuditEvent` copies `positionsSnapshot` array
   - `recordDeactivation` returns new event with `deactivatedAt` set and `deactivatedBy` set
   - `recordDeactivation` does not mutate the original event
   - `KillSwitchAuditDeps` mock: `insertEvent` called once when saving
   - `KillSwitchAuditDeps` mock: `findByStateId` returns null for unknown id
   - `KillSwitchAuditDeps` mock: `listRecent(5)` returns up to 5 events
2. Implement `packages/core/risk/kill-switch-audit.ts` (GREEN)
3. Create `packages/db/schema/kill-switch-events.ts` DrizzleORM table definition
4. Create `packages/db/repositories/kill-switch-audit-repository.ts` implementing `KillSwitchAuditDeps`
5. Refactor: add JSDoc to all exported functions and interfaces

## Acceptance Criteria
- `createAuditEvent` produces an immutable event from a `KillSwitchState` and reason string
- `recordDeactivation` returns a new event object; original is unchanged
- DrizzleORM schema compiles without errors and matches the interface shape
- Repository file imports only from Drizzle and `packages/core`
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "kill-switch-audit" && bun run typecheck
```

## Out of Scope
- Migrating existing kill switch activations to the new table
- Querying audit events from the API (UI concern)
- Archival or rotation of old audit records
- Slack notification on audit write (separate task T-09-014)
