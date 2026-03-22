# T-046 Alert worker handler

## Goal
Implement the alert worker event handler that receives a `decision_completed` event, checks the strategy's execution mode, formats a Slack Block Kit message, deduplicates by `eventId`, and delivers the alert via Slack webhook with 3-attempt exponential backoff.

## Why
The alert worker is the runtime bridge between the decision pipeline and human operators. It must be reliable (retry on transient failures), safe (never send duplicate alerts for the same event), and mode-aware (only act when the strategy is in alert, paper, or live mode). Implementing this as a handler with injected dependencies keeps it testable without a real Slack account or event bus.

## Inputs
- T-043 `formatAlertMessage`, `AlertContext`, `SlackMessage` from `packages/alert`
- T-044 `getExecutionMode`, `isActionable`, `ExecutionModeDeps` from `packages/execution`
- `decision_completed` event bus payload: `{ strategyId: string; symbol: string; direction: "LONG" | "SHORT" | "PASS"; decisionId: string; eventId: string }`
- Full `DecisionResult` loaded from store by handler (injected dep)
- `AlertWorkerDeps` interface defined in this task (see Expected Outputs)
- EP06 M2 spec (alert worker, retry, deduplication, dead-letter logging)

## Dependencies
- T-043 (alert formatter)
- T-044 (execution mode service)

## Expected Outputs
- `workers/alert-worker/src/handler.ts`
  - `handleDecisionCompleted(event: DecisionCompletedEvent, deps: AlertWorkerDeps): Promise<void>`
  - `AlertWorkerDeps` interface
  - `DecisionCompletedEvent` interface
  - `withRetry<T>(fn: () => Promise<T>, maxAttempts: number, baseDelayMs: number): Promise<T>` — exponential backoff helper (exported for testing)
- `workers/alert-worker/__tests__/handler.test.ts`

## Deliverables
- `workers/alert-worker/src/handler.ts`
- `workers/alert-worker/__tests__/handler.test.ts`

## Constraints
- `AlertWorkerDeps` interface must include:
  - `sendSlackWebhook(message: SlackMessage): Promise<void>`
  - `saveAlert(alert: { eventId: string; strategyId: string; payload: SlackMessage; deliveryState: "sent" | "failed" }): Promise<void>`
  - `isAlertAlreadySent(eventId: string): Promise<boolean>` — deduplication check
  - `loadDecisionResult(decisionId: string): Promise<DecisionResult>`
  - `loadAlertContext(event: DecisionCompletedEvent): Promise<AlertContext>`
  - `loadExecutionMode(strategyId: string): Promise<ExecutionMode>`
  - `loadSafetyState(strategyId: string): Promise<SafetyState>` — passed through to ExecutionModeDeps
- Handler must skip (return early, no error) when:
  - `event.direction === "PASS"`
  - `isActionable(mode) === false` (mode is `"analysis"`)
  - `isAlertAlreadySent(eventId) === true`
- On `sendSlackWebhook` failure: retry up to 3 times with exponential backoff (baseDelay: 500 ms, factor: 2 → 500 ms, 1000 ms, 2000 ms)
- After 3 failed attempts: call `saveAlert` with `deliveryState: "failed"` and log to `console.error` (dead-letter)
- On success: call `saveAlert` with `deliveryState: "sent"`
- `workers/alert-worker` may import from `packages/alert`, `packages/execution`, `packages/shared`; must not import Elysia, Drizzle, or CCXT directly
- All injected deps are async; handler must be fully async/await — no fire-and-forget patterns

## Steps
1. Write failing tests in `workers/alert-worker/__tests__/handler.test.ts` (RED):

   **Test A — PASS direction is skipped**
   - Event with `direction: "PASS"` → `sendSlackWebhook` never called, `saveAlert` never called

   **Test B — Analysis mode is skipped**
   - Mode returns `"analysis"` → `sendSlackWebhook` never called

   **Test C — Duplicate eventId is skipped**
   - `isAlertAlreadySent` returns `true` → `sendSlackWebhook` never called

   **Test D — Happy path (alert mode)**
   - Mode `"alert"`, not duplicate → `formatAlertMessage` called, `sendSlackWebhook` called once, `saveAlert` called with `deliveryState: "sent"`

   **Test E — Happy path (live mode)**
   - Mode `"live"` with safety gates enabled → same as alert mode for the alert handler (order execution is a separate worker)

   **Test F — Retry on transient failure**
   - `sendSlackWebhook` fails twice, succeeds on third attempt → `saveAlert` called with `deliveryState: "sent"`, `sendSlackWebhook` called exactly 3 times

   **Test G — Exhausted retries → dead-letter**
   - `sendSlackWebhook` always throws → called exactly 3 times, `saveAlert` called with `deliveryState: "failed"`

   **Test H — `withRetry` exponential backoff timing**
   - Mock `Date.now` or use fake timers; verify backoff delays are `500`, `1000` ms between attempts (or verify call count without real waiting in fast tests using mocked delay)

2. Implement `workers/alert-worker/src/handler.ts` (GREEN)
3. Refactor: extract `withRetry` as a named export; add JSDoc to `handleDecisionCompleted` and `AlertWorkerDeps`

## Acceptance Criteria
- All 8 tests pass
- PASS direction never triggers any downstream call
- Analysis mode never triggers webhook or save
- Duplicate `eventId` guard fires before any other logic (after mode check is acceptable, before webhook)
- `sendSlackWebhook` is called at most 3 times per event
- `saveAlert` is called exactly once per event that reaches the send phase (with correct `deliveryState`)
- `withRetry` delays follow exponential backoff: 500 ms, 1000 ms (tested with mocked timers or call count verification)
- Zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test workers/alert-worker/__tests__/handler.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Slack webhook client implementation (injected dep; implementation is a separate task)
- Event bus subscription setup (worker entrypoint, separate task)
- Alert DB schema and persistence implementation (injected dep)
- Order execution (execution worker, separate task)
- Health endpoint for alert worker
