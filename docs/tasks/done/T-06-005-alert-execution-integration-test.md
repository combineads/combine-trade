# T-06-005 Alert-execution integration test

## Goal
Write integration tests that verify the complete decision → mode check → alert format → order build chain using fully mocked dependencies. Confirm that each execution mode produces the exact and only the expected downstream actions.

## Why
Unit tests for T-06-001 through T-06-004 verify each module in isolation. This integration test catches wiring bugs, incorrect mode guards, and interface mismatches that only surface when all modules are composed. It also serves as a living specification of the expected behaviour for each execution mode, making mode semantics explicit and machine-verifiable.

## Inputs
- T-06-001 `formatAlertMessage`, `AlertContext` from `packages/alert`
- T-06-002 `getExecutionMode`, `setExecutionMode`, `isActionable`, `requiresOrder`, `ExecutionModeDeps` from `packages/execution`
- T-06-003 `buildOrder`, `generateClientOrderId`, `OrderContext` from `packages/execution`
- T-06-004 `handleDecisionCompleted`, `AlertWorkerDeps`, `DecisionCompletedEvent` from `workers/alert-worker/src/handler`
- `DecisionResult` from `@combine/core/decision`

## Dependencies
- T-06-001 (alert formatter)
- T-06-002 (execution mode service)
- T-06-003 (order builder)
- T-06-004 (alert worker handler)

## Expected Outputs
- `tests/integration/alert-execution.test.ts`

## Deliverables
- `tests/integration/alert-execution.test.ts`

## Constraints
- No real DB, no real Slack, no real exchange — all external deps mocked via `AlertWorkerDeps` and `ExecutionModeDeps`
- All mock state (mode, alerts sent, decision results) held in plain in-memory closures within the test file
- Fixture `DecisionResult` and `AlertContext` defined inline in the test file (constants at top of file)
- Tests must be deterministic: no random data, no `Date.now()` variance (pass a fixed `ts` to `generateClientOrderId`)
- Each test case uses a fresh mock deps factory (no shared mutable state between tests)
- The test file must import from package paths (`packages/alert`, `packages/execution`, `workers/alert-worker/src/handler`) — not relative `../../` chains

## Steps
1. Define shared fixtures at the top of the test file:
   - `FIXTURE_DECISION_RESULT: DecisionResult` — LONG decision, winrate 0.6, sampleCount 40, confidenceTier "medium"
   - `FIXTURE_ALERT_CONTEXT: AlertContext` — BTC/USDT, 1h, entryPrice "50000", tp "51000", sl "49500", topSimilarity 0.92
   - `FIXTURE_EVENT: DecisionCompletedEvent` — strategyId "strat-1", symbol "BTC/USDT", direction "LONG", decisionId "dec-1", eventId "evt-1"

2. Write tests (RED):

   **Test A — Analysis mode: no alert, no order**
   - Build deps with mode `"analysis"`, dedup returns `false`
   - Call `handleDecisionCompleted(FIXTURE_EVENT, deps)`
   - Assert: `sendSlackWebhook` call count === 0, `saveAlert` call count === 0

   **Test B — Alert mode: alert sent, no order**
   - Build deps with mode `"alert"`, dedup returns `false`
   - Call `handleDecisionCompleted(FIXTURE_EVENT, deps)`
   - Assert: `sendSlackWebhook` called exactly once
   - Assert: `saveAlert` called once with `deliveryState: "sent"`
   - Assert: no order-building function called (verify `buildOrder` not invoked — inject a spy)

   **Test C — Live mode: alert sent, order built**
   - Build deps with mode `"live"` (safety gates enabled), dedup returns `false`
   - Call `handleDecisionCompleted(FIXTURE_EVENT, deps)`
   - Assert: `sendSlackWebhook` called exactly once
   - Assert: `saveAlert` called once with `deliveryState: "sent"`
   - Assert: `buildOrder` called once; the resulting `OrderPayload` has `side: "buy"` (LONG), `symbol: "BTC/USDT"`, `clientOrderId` matching `ct-strat-1-evt-1-{ts}` pattern

   **Test D — PASS decision: nothing happens**
   - FIXTURE_EVENT with `direction: "PASS"`, mode `"alert"`
   - Assert: `sendSlackWebhook` call count === 0, `saveAlert` call count === 0

   **Test E — Deduplication: second call for same eventId is no-op**
   - Mode `"alert"`, first call: dedup returns `false` → alert sent
   - Second call for same eventId: dedup returns `true`
   - Assert: `sendSlackWebhook` total call count === 1 (not 2)

   **Test F — Alert formatter output integrity**
   - Call `formatAlertMessage(FIXTURE_DECISION_RESULT, FIXTURE_ALERT_CONTEXT)` directly
   - Assert: `blocks[0]` is a Header block containing `"LONG"` and `"BTC/USDT"`
   - Assert: `blocks[2]` (stats section) text contains `"60.0%"` (winrate from 0.6)
   - Assert: `blocks.length === 4`

   **Test G — Order builder idempotency**
   - Call `buildOrder` twice with identical `OrderContext` (same `ts`)
   - Assert: both results are deeply equal (same `clientOrderId`, same prices)

3. Implement minimal mock deps factory as a private helper in the test file
4. Run full project validation

## Acceptance Criteria
- All 7 tests pass
- Analysis mode produces zero Slack calls and zero saveAlert calls
- Alert mode produces exactly one Slack call and one saveAlert call with `deliveryState: "sent"`
- Live mode produces exactly one Slack call, one saveAlert call, and one order build
- PASS direction is a no-op regardless of mode
- Duplicate eventId is a no-op on the second call
- `formatAlertMessage` output structure matches Block Kit spec (4 blocks, correct order)
- `buildOrder` is deterministic for identical inputs
- `bun test && bun run typecheck` both pass project-wide

## Validation
```bash
bun test tests/integration/alert-execution.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Real Slack webhook delivery
- Real exchange order submission
- DB schema or persistence
- Execution worker handler (T-06-008)
- Paper trading simulation
- Retry exhaustion scenario (covered in T-06-004 unit tests)
