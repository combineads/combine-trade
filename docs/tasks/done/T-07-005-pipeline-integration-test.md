# T-07-005 Pipeline integration test

## Goal
Write integration tests that simulate the full event flow through correlation context, per-stage timing, dead-letter handling, and metrics collection. Uses a mock 5-stage pipeline (candle → strategy → vector → decision → alert) to verify that all four shared pipeline modules compose correctly and satisfy the EP07 M2/M3/M4 contracts.

## Why
Unit tests for T-07-001 through T-07-004 verify each module in isolation. This integration test catches wiring bugs and interface mismatches that only surface when the modules are composed. It also serves as a living specification for how workers are expected to use the correlation, dead-letter, and metrics APIs together, making the composition pattern explicit and machine-verifiable before the real workers are wired up.

## Inputs
- T-07-001 `createCorrelationContext`, `startStage`, `endStage`, `getStageDurationMs`, `getPipelineLatencyMs`, `CorrelationContext` from `packages/shared/pipeline`
- T-07-002 `handleFailure`, `shouldRetry`, `DeadLetterDeps`, `MAX_RETRIES` from `packages/shared/pipeline`
- T-07-003 `runCatchUp`, `buildCatchUpOptions`, `CatchUpDeps`, `CatchUpResult` from `packages/shared/pipeline`
- T-07-004 `PipelineMetrics`, `MetricsSnapshot`, `computePercentile` from `packages/shared/pipeline`
- T-06-005 `tests/integration/alert-execution.test.ts` as structural reference for integration test layout

## Dependencies
- T-07-001 (correlation ID and timing)
- T-07-002 (dead-letter handler)
- T-07-003 (catch-up polling logic)
- T-07-004 (pipeline metrics collector)

## Expected Outputs
- `tests/integration/pipeline-orchestration.test.ts`

## Deliverables
- `tests/integration/pipeline-orchestration.test.ts`

## Constraints
- No real DB, no real network, no real workers — all external deps mocked via inline closures in the test file
- All mock state (retry counts, dead-letter store, processed events, metrics) held in plain in-memory variables scoped to each test
- Fixtures (stage names, event IDs, error instances) defined as top-level constants in the test file
- Each test uses fresh instances (`new PipelineMetrics()`, `createCorrelationContext()`) — no shared mutable state between tests
- The test file must import from the package path `packages/shared/pipeline` — not relative `../../` chains
- All assertions use exact equality or computed expected values — no "approximately" checks except where the nearest-rank percentile method introduces ±1 tolerance (document the tolerance inline)
- All tests use `bun:test`

## Steps
1. Define top-level fixtures and constants:
   - `STAGES = ["candle", "strategy", "vector", "decision", "alert"]` — the 5 mock pipeline stages
   - `FIXTURE_EVENT_ID = "evt-integration-001"`
   - `FIXTURE_STAGE_ERROR = new Error("vector search timeout")`

2. Write tests (RED):

   **Test A — Full pipeline correlation tracking**
   - Create a `CorrelationContext` with `createCorrelationContext()`
   - Call `startStage` / `endStage` for each of the 5 stages in sequence
   - Assert: `getStageDurationMs` returns a number `>= 0` for each stage
   - Assert: `getPipelineLatencyMs` returns a number `>= 0`
   - Assert: `ctx.stages.size === 5` after all stages complete
   - Assert: the correlation ID is propagated unchanged through all stage calls (same string)

   **Test B — Correlation context immutability**
   - Call `startStage(ctx, "candle")` → capture result as `ctx2`
   - Assert: original `ctx.stages.size === 0` (not mutated)
   - Assert: `ctx2.stages.size === 1`
   - Call `endStage(ctx2, "candle")` → capture as `ctx3`
   - Assert: `ctx2.stages.get("candle")!.endMs === null` (ctx2 not mutated)
   - Assert: `ctx3.stages.get("candle")!.endMs !== null`

   **Test C — Dead-letter: retries before exhaustion**
   - Build `DeadLetterDeps` with in-memory retry counter starting at 0 for `FIXTURE_EVENT_ID`
   - Call `handleFailure(FIXTURE_EVENT_ID, "vector", FIXTURE_STAGE_ERROR, deps)` three times, incrementing the stored count each call
   - First call (retryCount=0) → `{ retried: true, exhausted: false }`
   - Second call (retryCount=1) → `{ retried: true, exhausted: false }`
   - Third call (retryCount=2) → `{ retried: true, exhausted: false }`
   - `saveDeadLetter` not called after any of the three calls

   **Test D — Dead-letter: exhaustion on 4th failure**
   - Continuing from Test C (retryCount=3 stored), call `handleFailure` once more
   - Assert: result is `{ retried: false, exhausted: true }`
   - Assert: `saveDeadLetter` called exactly once with `eventId: FIXTURE_EVENT_ID`, `stage: "vector"`, `retryCount: 3`

   **Test E — Catch-up: processes missed events idempotently**
   - Build `CatchUpDeps` with 3 unprocessed events in an in-memory store
   - Call `runCatchUp(deps)` → `{ processed: 3, failed: 0, errors: [] }`
   - Assert: `processEvent` called 3 times
   - Assert: `markProcessed` called 3 times
   - Assert: `findUnprocessedEvents` called exactly once
   - Call `runCatchUp(deps)` again with the same deps (all now marked processed, so `findUnprocessedEvents` returns `[]`)
   - Assert: second run → `{ processed: 0, failed: 0, errors: [] }` (idempotency: already-processed events are not returned)

   **Test F — Catch-up: partial failure isolation**
   - Build `CatchUpDeps` with 3 events; `processEvent` throws for event ID `"evt-bad"`
   - Assert: `{ processed: 2, failed: 1, errors: [{ id: "evt-bad", error: <error> }] }`
   - Assert: `markProcessed` NOT called for `"evt-bad"`, called for the other two

   **Test G — Metrics: full pipeline recording and snapshot**
   - Create a `PipelineMetrics` instance
   - For each of the 5 stages, call `recordLatency(stage, i * 10)` (0, 10, 20, 30, 40 ms) and `recordEvent(stage)` once
   - Call `recordError("vector")` once to simulate one vector timeout
   - Call `getSnapshot()` and assert:
     - All 5 stages present in `snapshot.stages`
     - `snapshot.stages["vector"].errors === 1`
     - `snapshot.stages["vector"].events === 1`
     - `snapshot.stages["vector"].latency.count === 1`
     - `snapshot.stages["candle"].latency.p50 === 0` (only 1 sample: 0 ms)
     - `snapshot.capturedAt` is a positive number

   **Test H — Metrics: reset clears state**
   - Record latency and errors for 3 stages, call `reset()`
   - Assert: `getSnapshot().stages` is an empty object `{}`

   **Test I — End-to-end composition: correlation + metrics**
   - Create `CorrelationContext` and `PipelineMetrics`
   - Simulate a 3-stage pipeline: for each stage, call `startStage`, compute a duration (use a fixed artificial delay of 0 ms), call `endStage`, then `recordLatency(stage, getStageDurationMs(ctx, stage))` and `recordEvent(stage)`
   - Assert: `PipelineMetrics.getSnapshot().stages` contains all 3 stages with `count: 1`
   - Assert: `getPipelineLatencyMs(finalCtx) >= 0`

3. Implement mock helpers (private functions in test file):
   - `makeDeadLetterDeps(initialCounts?: Record<string, number>)` — returns `DeadLetterDeps` with in-memory store
   - `makeCatchUpDeps(events: Array<{ id: string; payload: unknown }>)` — returns `CatchUpDeps` with in-memory store and call log

4. Run full project validation

## Acceptance Criteria
- All 9 tests pass
- Correlation context immutability verified: original context never mutated by `startStage` or `endStage`
- Dead-letter retries at counts 0, 1, 2 — `saveDeadLetter` never called; retry at count 3 — `saveDeadLetter` called exactly once
- Catch-up idempotency: second run on already-processed events produces `{ processed: 0, failed: 0, errors: [] }`
- Catch-up per-event error isolation verified: `markProcessed` not called for failing event
- Metrics snapshot contains correct stage entries, error count, and event count after recording
- `reset()` produces an empty snapshot
- `bun test && bun run typecheck` both pass project-wide

## Validation
```bash
bun test tests/integration/pipeline-orchestration.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Real worker process management (supervisor, SIGTERM)
- Real PostgreSQL LISTEN/NOTIFY
- Real metrics DB flush
- Docker Compose orchestration
- Latency benchmark against the < 1 second p99 envelope (separate validation)
- Slack, CCXT, or any external service integration
