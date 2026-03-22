# T-050 Catch-up polling logic

## Goal
Implement catch-up polling logic for missed PostgreSQL LISTEN/NOTIFY events using a DI pattern. When a worker restarts or a NOTIFY is lost, the catch-up runner queries for unprocessed events, processes each one idempotently, and marks them as processed. Pure logic with injected dependencies — no direct DB or network calls.

## Why
EP07 M3 specifies that each worker runs catch-up polling every 60 seconds to recover events missed due to connection loss or transaction rollback. PostgreSQL NOTIFY is fire-and-forget — if a worker is not connected when a NOTIFY fires, that event is lost. The DB is the source of truth; the catch-up mechanism reads unprocessed rows and reprocesses them. Keeping this logic pure and injectable makes it trivially testable without a real database.

## Inputs
- EP07 M3 spec — NOTIFY miss recovery, 60-second interval, idempotency guarantee
- EP07 M3 query pattern: `WHERE processed_at IS NULL AND created_at < NOW() - INTERVAL '30 seconds'`
- Existing DI pattern in `packages/shared/di/` as structural reference

## Dependencies
None.

## Expected Outputs
- `packages/shared/pipeline/catch-up.ts`
  - `CatchUpDeps` interface:
    ```ts
    interface CatchUpDeps {
      findUnprocessedEvents(options: CatchUpOptions): Promise<Array<{ id: string; payload: unknown }>>;
      processEvent(id: string, payload: unknown): Promise<void>;
      markProcessed(id: string): Promise<void>;
    }
    ```
  - `CatchUpOptions` interface: `{ maxAgeSeconds?: number; batchSize?: number }` — defaults: `maxAgeSeconds: 30`, `batchSize: 100`
  - `CatchUpResult` interface: `{ processed: number; failed: number; errors: Array<{ id: string; error: Error }> }`
  - `runCatchUp(deps: CatchUpDeps, options?: CatchUpOptions): Promise<CatchUpResult>` — fetches unprocessed events from `deps.findUnprocessedEvents`, processes each via `deps.processEvent`, then calls `deps.markProcessed`; if `processEvent` throws, the event is counted as `failed` and added to `errors`, but processing continues for remaining events (per-event error isolation); `markProcessed` is only called for successfully processed events
  - `buildCatchUpOptions(options?: CatchUpOptions): Required<CatchUpOptions>` — merges provided options with defaults
- `packages/shared/pipeline/__tests__/catch-up.test.ts`
- Updated `packages/shared/pipeline/index.ts` to export new types and functions

## Deliverables
- `packages/shared/pipeline/catch-up.ts`
- `packages/shared/pipeline/__tests__/catch-up.test.ts`
- Updated `packages/shared/pipeline/index.ts`

## Constraints
- Pure logic only — no direct DB access, no HTTP calls, no filesystem access
- `CatchUpDeps` is injected at call time — never imported from a concrete implementation
- Per-event error isolation: a failure in `processEvent` for one event must not prevent processing of subsequent events
- `markProcessed` must NOT be called if `processEvent` threw for that event
- `findUnprocessedEvents` is called exactly once per `runCatchUp` invocation
- Default `maxAgeSeconds: 30`, `batchSize: 100` — callers may override either field
- `packages/shared/pipeline/catch-up.ts` must not import Elysia, Drizzle, CCXT, or any package outside `packages/shared`
- All tests use `bun:test`; mock deps use plain closure-based in-memory state

## Steps
1. Create `packages/shared/pipeline/catch-up.ts` with interfaces and function stubs (RED anchor)
2. Write failing tests in `packages/shared/pipeline/__tests__/catch-up.test.ts` (RED):
   - `buildCatchUpOptions()` with no args → `{ maxAgeSeconds: 30, batchSize: 100 }`
   - `buildCatchUpOptions({ maxAgeSeconds: 60 })` → `{ maxAgeSeconds: 60, batchSize: 100 }`
   - `buildCatchUpOptions({ batchSize: 10 })` → `{ maxAgeSeconds: 30, batchSize: 10 }`
   - `runCatchUp` with 0 events → `{ processed: 0, failed: 0, errors: [] }`
   - `runCatchUp` with 3 events → `findUnprocessedEvents` called once, `processEvent` called 3 times, `markProcessed` called 3 times, `{ processed: 3, failed: 0, errors: [] }`
   - `runCatchUp` where `processEvent` throws for event 2 of 3 → event 1 and 3 succeed; result `{ processed: 2, failed: 1, errors: [{ id: "evt-2", error: <thrown error> }] }`
   - `markProcessed` is NOT called for the failing event (call log assertion)
   - `markProcessed` IS called for the two succeeding events (call log assertion)
   - `findUnprocessedEvents` receives the resolved options (including defaults) on each call
   - Custom `batchSize: 5` passed through to `findUnprocessedEvents` options
   - `processEvent` throwing for ALL events → `{ processed: 0, failed: N, errors: [...] }` — no throw from `runCatchUp`
3. Implement `packages/shared/pipeline/catch-up.ts` (GREEN)
4. Update `packages/shared/pipeline/index.ts` with new exports
5. Refactor: add JSDoc to `runCatchUp`, `CatchUpDeps`, `CatchUpOptions`, `CatchUpResult`

## Acceptance Criteria
- `buildCatchUpOptions` correctly applies defaults for any omitted field
- `findUnprocessedEvents` is called exactly once per `runCatchUp` invocation regardless of event count
- Per-event error isolation: failure of one event does not prevent processing of others
- `markProcessed` is called only for events where `processEvent` succeeded
- `runCatchUp` never throws — all errors are captured in `CatchUpResult.errors`
- All 11 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/pipeline/__tests__/catch-up.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- The 60-second polling interval timer (caller/supervisor responsibility)
- Concrete DB query implementation (lives in the worker adapter, not in shared)
- Backpressure and concurrency limiting across multiple catch-up runs
- Distributed locking to prevent two workers processing the same event simultaneously
- NOTIFY subscription management (handled by the event-bus module)
