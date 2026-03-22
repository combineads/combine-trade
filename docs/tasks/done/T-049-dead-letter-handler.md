# T-049 Dead-letter handler

## Goal
Implement dead-letter handling for failed pipeline events using a DI pattern. When an event fails processing, the handler checks the retry count and either signals a retry or saves the event to a dead-letter store after 3 exhausted attempts. Pure logic with injected dependencies — no direct DB or network calls.

## Why
EP07 M3 requires that failed events are not silently dropped. After 3 retries, the event must be persisted in a dead-letter store so an operator can inspect it, replay it, or discard it intentionally. Keeping the retry logic pure and injectable makes it unit-testable without a real database, and makes it swappable if the storage backend changes.

## Inputs
- EP07 M3 spec — dead-letter handling, 3-retry max, per-event failure isolation
- `packages/shared/pipeline/correlation.ts` (T-048) — `CorrelationContext` type reference (import not required; stage name is a plain string)
- Existing DI pattern in `packages/shared/di/` as structural reference for interface-first design

## Dependencies
None.

## Expected Outputs
- `packages/shared/pipeline/dead-letter.ts`
  - `DeadLetterDeps` interface:
    ```ts
    interface DeadLetterDeps {
      saveDeadLetter(eventId: string, stage: string, error: Error, retryCount: number): Promise<void>;
      loadRetryCount(eventId: string): Promise<number>;
    }
    ```
  - `DeadLetterEntry` interface: `{ eventId: string; stage: string; error: Error; retryCount: number; exhaustedAt: Date }`
  - `MAX_RETRIES` constant: `3`
  - `shouldRetry(retryCount: number): boolean` — returns `true` if `retryCount < MAX_RETRIES`
  - `handleFailure(eventId: string, stage: string, error: Error, deps: DeadLetterDeps): Promise<{ retried: boolean; exhausted: boolean }>` — loads retry count, increments conceptually; if `shouldRetry(currentCount)` returns true, returns `{ retried: true, exhausted: false }`; otherwise calls `deps.saveDeadLetter` and returns `{ retried: false, exhausted: true }`
- `packages/shared/pipeline/__tests__/dead-letter.test.ts`
- Updated `packages/shared/pipeline/index.ts` to export new types and functions

## Deliverables
- `packages/shared/pipeline/dead-letter.ts`
- `packages/shared/pipeline/__tests__/dead-letter.test.ts`
- Updated `packages/shared/pipeline/index.ts`

## Constraints
- Pure logic only — no direct DB access, no HTTP calls, no filesystem access
- `DeadLetterDeps` is injected at call time — never imported from a concrete implementation
- `MAX_RETRIES` is `3` — the function retries on counts 0, 1, 2 (i.e. `shouldRetry` returns `true` for 0, 1, 2 and `false` for 3+)
- `handleFailure` must call `deps.loadRetryCount` exactly once per invocation
- `deps.saveDeadLetter` must be called exactly once when retries are exhausted, and never when retries remain
- Errors thrown by `deps.saveDeadLetter` must propagate — no silent swallowing
- `packages/shared/pipeline/dead-letter.ts` must not import Elysia, Drizzle, CCXT, or any package outside `packages/shared`
- All tests use `bun:test`; mock deps are plain inline objects with closure-based state

## Steps
1. Create `packages/shared/pipeline/dead-letter.ts` with interface and function stubs (RED anchor)
2. Write failing tests in `packages/shared/pipeline/__tests__/dead-letter.test.ts` (RED):
   - `shouldRetry(0)` → `true`
   - `shouldRetry(1)` → `true`
   - `shouldRetry(2)` → `true`
   - `shouldRetry(3)` → `false`
   - `shouldRetry(10)` → `false`
   - `handleFailure` with `loadRetryCount` returning 0 → returns `{ retried: true, exhausted: false }`, `saveDeadLetter` not called
   - `handleFailure` with `loadRetryCount` returning 1 → returns `{ retried: true, exhausted: false }`, `saveDeadLetter` not called
   - `handleFailure` with `loadRetryCount` returning 2 → returns `{ retried: true, exhausted: false }`, `saveDeadLetter` not called
   - `handleFailure` with `loadRetryCount` returning 3 → returns `{ retried: false, exhausted: true }`, `saveDeadLetter` called once with correct `eventId`, `stage`, `error`, `retryCount: 3`
   - `handleFailure` with `loadRetryCount` returning 99 → `saveDeadLetter` called (exhausted)
   - `saveDeadLetter` throwing → error propagates out of `handleFailure`
   - `loadRetryCount` called exactly once per `handleFailure` invocation (call count assertion)
3. Implement `packages/shared/pipeline/dead-letter.ts` (GREEN)
4. Update `packages/shared/pipeline/index.ts` with new exports
5. Refactor: add JSDoc to `handleFailure`, `shouldRetry`, `DeadLetterDeps`

## Acceptance Criteria
- `shouldRetry` returns `true` for counts 0–2, `false` for 3+
- `handleFailure` calls `loadRetryCount` exactly once per invocation
- `saveDeadLetter` is called only when `retryCount >= MAX_RETRIES`, never when retries remain
- Errors from `saveDeadLetter` propagate out of `handleFailure`
- All 11 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/pipeline/__tests__/dead-letter.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Actual DB persistence implementation (concrete adapter lives in the worker, not in shared)
- Retry scheduling / exponential backoff timing (supervisor concern)
- Dead-letter queue UI or operator tooling
- Alert/notification on exhaustion (alert-worker concern)
- Event replay from the dead-letter store
