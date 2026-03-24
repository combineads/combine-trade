# T-06-012 Implement execution mode DB persistence

## Goal
Create a Drizzle-backed service that implements `ExecutionModeDeps` interface, persisting execution mode per strategy and enforcing safety gates for live mode activation.

## Why
EP06 M5 / EP09 — execution mode changes must persist to DB, and live mode activation requires kill switch + loss limit configuration verification. Without this, mode resets on restart and live mode can be activated without safety checks.

## Inputs
- `packages/execution/mode.ts` (ExecutionModeService, ExecutionModeDeps)
- `packages/execution/types.ts` (ExecutionMode, ExecutionModeDeps, SafetyGateStatus)
- `db/schema/strategies.ts` (executionMode column)

## Dependencies
None (T-09-006 kill switch DB service dependency resolved by EP09 completion)

## Expected Outputs
- `ExecutionModeDbService` implementing ExecutionModeDeps
- Safety gate enforcement: live mode blocked if kill switch disabled or loss limit unconfigured

## Deliverables
- `packages/execution/mode-db.ts`
- `packages/execution/__tests__/mode-db.test.ts`

## Constraints
- loadMode(): SELECT execution_mode FROM strategies WHERE id = strategyId
- saveMode(): UPDATE strategies SET execution_mode = mode WHERE id = strategyId
- getSafetyGateStatus(): check if kill switch state exists AND daily loss limit is configured
- DB instance injected via constructor (DI)

## Steps
1. Write tests for loadMode, saveMode, getSafetyGateStatus
2. Implement ExecutionModeDbService class
3. Wire safety gate to kill switch state + loss limit tables
4. Verify live mode transition blocked without safety gates

## Acceptance Criteria
- loadMode returns current mode from DB
- saveMode persists mode change
- getSafetyGateStatus correctly checks both conditions
- Live mode transition blocked when safety gates not met

## Validation
```bash
bun test packages/execution/__tests__/mode-db.test.ts
bun run typecheck
```

## Out of Scope
- UI for mode change
- Auto mode transitions
