# T-110 Wire alert worker to event bus

## Goal
Connect the alert-worker handler to the PostgreSQL LISTEN/NOTIFY event bus so it processes decision_completed events automatically.

## Why
EP06 M2 — AlertWorkerHandler exists but the worker entry point is empty. It needs to subscribe to decision_completed events and dispatch to the handler.

## Inputs
- `workers/alert-worker/src/handler.ts` (AlertWorkerHandler)
- `packages/shared/event-bus.ts` or equivalent event bus module
- `db/schema/alerts.ts` (alerts table)

## Dependencies
- T-106 (Slack webhook client)

## Expected Outputs
- Alert worker entry point that listens for decision_completed
- Wires all AlertWorkerDeps: mode loader, dedup checker, alert saver, Slack sender, context loader
- Graceful shutdown support

## Deliverables
- `workers/alert-worker/src/index.ts` (updated — full worker entry)
- `workers/alert-worker/__tests__/integration.test.ts`

## Constraints
- Subscribe to "decision_completed" channel via event bus
- Parse event payload to extract eventId and decision result
- Wire deps from IoC container or explicit construction
- Handle event bus disconnect → reconnect
- Graceful shutdown: unsubscribe → drain pending → exit

## Steps
1. Write integration test with in-memory event bus mock
2. Implement worker entry: subscribe → parse → handle → ack
3. Wire all deps (mode loader from DB, dedup from alerts table, Slack from webhook client)
4. Add graceful shutdown handler

## Acceptance Criteria
- Worker starts and subscribes to decision_completed
- LONG/SHORT decisions → alert created and sent
- PASS decisions → skipped
- Duplicate events → skipped
- Clean shutdown on SIGTERM

## Validation
```bash
bun test workers/alert-worker/__tests__/integration.test.ts
bun run typecheck
```

## Out of Scope
- Catch-up polling (EP07-M3)
- Multiple Slack channels
- Alert persistence queries beyond dedup

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `workers/alert-worker/src/entry.ts` (new), `workers/alert-worker/__tests__/integration.test.ts` (new — 3 tests)
- **Approach**: TDD. `startAlertWorker()` wires AlertWorkerHandler to event bus subscription. All deps injected via `AlertWorkerEntryDeps` interface.
- **Validation**: 3/3 tests pass, 1008 total pass, typecheck clean.

## Outputs
- `startAlertWorker(deps)` — subscribes to decision_completed, dispatches to handler
- `AlertWorkerEntryDeps` interface
