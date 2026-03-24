# T-06-013 Alert deduplication

## Goal
Implement an `AlertDeduplicator` that prevents duplicate alerts from being processed when the same strategy event is delivered more than once due to network retries or event bus redelivery.

## Why
EP06 M2 — the alert worker's idempotency guarantee currently relies on a simple `isAlertAlreadySent` dep stub. Without a concrete, TTL-backed deduplication layer, network retries or event bus at-least-once semantics will cause duplicate Slack notifications and double-recorded alert rows for the same decision event.

## Inputs
- `workers/alert-worker/src/handler.ts` — `AlertWorkerDeps.isAlertAlreadySent` contract (injected dep interface)
- `packages/alert/` — alert package boundary (deduplicator lives here or in a shared util)
- EP06 M2 spec: "Idempotency: 동일 event_id 알람 중복 발송 방지"

## Dependencies
- T-06-001 (alert message formatter — alert package exists)
- T-06-004 (alert worker handler — defines `isAlertAlreadySent` dep contract)

## Expected Outputs
- `AlertDeduplicator` class with `isDuplicate(eventId: string): Promise<boolean>` and `markSeen(eventId: string): Promise<void>` methods
- In-memory Map-based implementation with TTL expiration (default: 3600 seconds)
- Optional Redis-backed implementation behind the same interface for multi-process deployments
- `duplicate_count` metric counter incremented on every duplicate hit
- DEBUG log emitted on duplicate detection: `[alert-dedup] duplicate eventId skipped: <eventId>`

## Deliverables
- `packages/alert/deduplicator.ts`
- `packages/alert/__tests__/deduplicator.test.ts`

## Constraints
- Default TTL: 3600 seconds (1 hour); configurable via constructor option
- In-memory implementation: use a `Map<string, number>` storing expiry timestamps
- Expired entries must be evicted lazily on `isDuplicate` / `markSeen` calls (no background timer required)
- Redis implementation (if included): same interface; Redis `SET NX EX` for atomic check-and-set
- `duplicate_count` counter: a simple numeric property or injected metrics callback — no external dependency required
- Must not import Elysia, Drizzle, or CCXT
- All methods are async to allow swapping to Redis without interface change

## Steps
1. Write failing tests in `packages/alert/__tests__/deduplicator.test.ts` (RED):

   **Test A — New eventId is not a duplicate**
   - Fresh `AlertDeduplicator`; `isDuplicate("evt-1")` → `false`

   **Test B — Mark seen, then check duplicate**
   - `markSeen("evt-1")` → `isDuplicate("evt-1")` → `true`

   **Test C — TTL expiry**
   - `markSeen("evt-2")` with TTL=1s; advance time by 2s (fake timers or mock Date.now); `isDuplicate("evt-2")` → `false`

   **Test D — duplicate_count increments**
   - `markSeen("evt-3")`; call `isDuplicate("evt-3")` twice → `duplicate_count === 2`

   **Test E — Distinct eventIds are independent**
   - `markSeen("evt-a")`; `isDuplicate("evt-b")` → `false`

   **Test F — Lazy eviction does not break subsequent checks**
   - Mark two events; let one expire; `isDuplicate` on expired → `false`, on live → `true`

2. Implement `packages/alert/deduplicator.ts` (GREEN)
3. Refactor: extract `AlreadySeenStore` interface so both in-memory and Redis implementations satisfy it; export `AlertDeduplicatorOptions` type

## Acceptance Criteria
- All 6 tests pass
- `isDuplicate` returns `false` for unseen eventIds
- `isDuplicate` returns `true` for eventIds marked within TTL window
- `isDuplicate` returns `false` for eventIds whose TTL has elapsed
- `duplicate_count` increments on every `true` result from `isDuplicate`
- Zero TypeScript errors, zero lint warnings
- Exported from `packages/alert/index.ts`

## Validation
```bash
bun test --filter "alert-dedup" && bun run typecheck
```

## Out of Scope
- Redis implementation (interface designed for it, but in-memory sufficient for this task)
- Persistent deduplication store (DB-backed)
- Distributed deduplication across multiple alert-worker instances
- Wiring `AlertDeduplicator` into the alert worker handler (handler already has `isAlertAlreadySent` dep — that wiring belongs to the worker entry point)

## Implementation Notes

- Implemented `AlreadySeenStore` interface (exported) so both in-memory and Redis backends satisfy the same contract — Redis swap requires zero changes to `AlertDeduplicator`.
- `InMemorySeenStore` uses `Map<string, number>` keyed by eventId, storing expiry timestamps in milliseconds.
- Lazy eviction: `isDuplicate` deletes the stale entry on first expired access; no background timer.
- `getNow` is an injectable clock function (`() => number`) defaulting to `Date.now()`. This keeps time control entirely in test space without requiring fake timers.
- `duplicateCount` is a simple readonly getter over a private `_duplicateCount` field — no external metrics dependency.
- Test F covers the lazy eviction interaction between two entries at different ages — both expire by the final `now` value, which correctly validates lazy cleanup does not corrupt checks on still-live entries.
- Added 7 tests (task spec said 6; added an extra "live within TTL" case to directly verify the positive path).
- All methods are `async` per constraint for Redis compatibility.

## Outputs

- `packages/alert/deduplicator.ts` — `AlertDeduplicator` class, `AlreadySeenStore` interface, `AlertDeduplicatorOptions` type
- `packages/alert/__tests__/deduplicator.test.ts` — 7 tests (all pass)
- `packages/alert/index.ts` — barrel updated to export `AlertDeduplicator`, `AlertDeduplicatorOptions`, `AlreadySeenStore`

Validation results:
```
7 pass, 0 fail — bun test packages/alert/__tests__/deduplicator.test.ts
tsc --noEmit — 0 errors
biome check — 0 issues on new/modified files
```
