# T-111 Wire execution worker to event bus

## Goal
Connect the execution-worker handler to the PostgreSQL LISTEN/NOTIFY event bus so it processes decision_completed events and submits orders.

## Why
EP06 M4 — ExecutionWorkerHandler (T-107) needs to be wired to the event bus to receive decision events.

## Inputs
- `workers/execution-worker/src/handler.ts` (T-107 ExecutionWorkerHandler)
- Event bus module
- `db/schema/orders.ts` (orders table)

## Dependencies
- T-107 (execution worker handler)

## Expected Outputs
- Execution worker entry point: listen → risk gate → order → track
- All handler deps wired from IoC/explicit construction
- Order status tracker running in parallel
- Graceful shutdown

## Deliverables
- `workers/execution-worker/src/index.ts` (updated — full worker entry)
- `workers/execution-worker/__tests__/integration.test.ts`

## Constraints
- Subscribe to "decision_completed" channel
- Parse event payload
- Wire deps: exchange adapter, risk gate, mode service, order repo
- Start OrderStatusTracker (T-109) alongside event listener
- Graceful shutdown: stop tracker → unsubscribe → drain → exit

## Steps
1. Write integration test with mock event bus and mock exchange
2. Implement worker entry: subscribe → parse → handle
3. Start order status tracker as parallel loop
4. Add graceful shutdown

## Acceptance Criteria
- Worker subscribes to decision_completed
- LONG/SHORT in live mode → order submitted to exchange
- Risk gate rejection → order skipped with reason logged
- Order tracker running and polling
- Clean shutdown

## Validation
```bash
bun test workers/execution-worker/__tests__/integration.test.ts
bun run typecheck
```

## Out of Scope
- Advisory lock serialization (EP09-M0)
- SL/TP bracket orders
- Position management

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `workers/execution-worker/src/entry.ts` (new), `workers/execution-worker/__tests__/integration.test.ts` (new — 3 tests)
- **Approach**: TDD. `startExecutionWorker()` wires ExecutionWorkerHandler to event bus subscription. All deps injected via `ExecutionWorkerEntryDeps` interface.
- **Validation**: 3/3 tests pass, 1008 total pass, typecheck clean.

## Outputs
- `startExecutionWorker(deps)` — subscribes to decision_completed, dispatches to handler
- `ExecutionWorkerEntryDeps` interface
