# T-033 Build vector worker

## Goal
Build the vector worker that listens for strategy_event_created, normalizes features, stores vectors, performs L2 search, computes statistics, runs decision engine inline, persists the decision, and publishes decision_completed.

## Why
The vector worker is the central pipeline stage that transforms strategy events into trading decisions. It orchestrates normalization, storage, search, statistics, and decision in a single flow for latency optimization.

## Inputs
- EP03 M5 spec (vector worker integration)
- T-028 normalization orchestrator
- T-029 table manager
- T-030 vector repository
- T-031 statistics calculator
- T-032 decision engine
- `packages/shared/event-bus/channels.ts` (strategy_event_created, decision_completed)

## Dependencies
- T-028 (normalization orchestrator)
- T-029 (vector table manager)
- T-030 (vector repository)
- T-031 (pattern statistics calculator)
- T-032 (decision engine)

## Expected Outputs
- `workers/vector-worker/src/handler.ts` — event handler
- `workers/vector-worker/src/health.ts` — health endpoint
- Worker tests with full mock pipeline

## Deliverables
- `workers/vector-worker/src/handler.ts`
- `workers/vector-worker/src/health.ts`
- `workers/vector-worker/package.json`
- `workers/vector-worker/__tests__/handler.test.ts`

## Constraints
- LISTEN strategy_event_created → full pipeline
- Pipeline: normalize features → ensure vector table → store vector → L2 search → compute statistics → decision engine → persist decision → NOTIFY decision_completed
- Vector storage idempotent (duplicate event → no-op)
- Decision persistence: insert into decisions table
- Worker imports: packages/core/vector, packages/core/decision, packages/shared only
- Decision engine called inline (no extra event bus hop)
- Must handle: INSUFFICIENT search results → PASS decision
- Latency target: entire pipeline < 500ms (leaving 500ms from candle close)

## Steps
1. Set up `workers/vector-worker/package.json` with dependencies
2. Write failing tests with full mock dependencies (RED):
   - Event received → full pipeline executes → decision persisted → NOTIFY published
   - Duplicate event → idempotent (no duplicate decision)
   - INSUFFICIENT search results → PASS decision with reason
   - Normalization failure → error logged, no crash
3. Implement `workers/vector-worker/src/handler.ts`:
   - handleStrategyEvent(payload):
     a. Load strategy event from DB
     b. Load strategy config (for normalization and decision config)
     c. Normalize features → vector
     d. Ensure vector table exists
     e. Store vector
     f. L2 search for similar vectors
     g. If INSUFFICIENT → create PASS decision
     h. If SUFFICIENT → load labels for matched events → compute statistics → run decision engine
     i. Persist decision to decisions table
     j. Publish decision_completed
4. Implement health endpoint (port 9003)
5. Make tests pass (GREEN)
6. Refactor

## Acceptance Criteria
- Full pipeline executes on strategy_event_created
- Decision persisted to decisions table with all fields
- decision_completed published with correct payload
- INSUFFICIENT results → PASS decision (reason: insufficient_samples)
- Duplicate event processing → no duplicate decision
- Worker stays running after individual event errors (error isolation)
- Health endpoint responds on port 9003

## Validation
```bash
bun test -- --filter "vector-worker"
bun run typecheck
bun run lint
```

## Out of Scope
- Actual pgvector database integration
- Performance benchmarks
- Label worker (EP04 scope)
- Alert/execution downstream (EP06 scope)
