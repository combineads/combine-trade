# T-16-015 Journal Ready Event Bus

## Goal
Add a `journal_ready` PostgreSQL LISTEN/NOTIFY event bus channel so the retrospective-worker knows when a journal entry is fully assembled and ready for analysis.

## Why
The retrospective-worker must not poll the database for new journals. An event-driven approach via `NOTIFY journal_ready` decouples the journal-worker from the retrospective-worker, keeps latency low, and is consistent with the event bus pattern used throughout the pipeline.

## Inputs
- `packages/shared/event-bus/channels.ts` — event bus channel registry
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher
- `packages/shared/event-bus/listener.ts` — PgEventListener
- `workers/journal-worker/src/assembler.ts` — journal assembly pipeline (T-16-014)
- `workers/retrospective-worker/src/` — retrospective-worker entry point (T-16-008)

## Dependencies
- T-16-014 (journal-worker macro extension — must emit after macro context is attached)

## Expected Outputs
- `journal_ready` channel registered in the event bus channel registry
- journal-worker emits `NOTIFY journal_ready` with `journal_id` after macro context is stored
- retrospective-worker subscribes to `LISTEN journal_ready` and triggers analysis on receipt
- Tests covering publish and receive behaviour

## Deliverables
- Updated `packages/shared/event-bus/channels.ts`:
  - Add `Channels.journalReady = 'journal_ready'`
- Updated `workers/journal-worker/src/assembler.ts`:
  - After persisting journal with macro context, call `publisher.notify(Channels.journalReady, { journal_id })`
- Updated `workers/retrospective-worker/src/main.ts` (or listener module):
  - `listener.listen(Channels.journalReady, async ({ journal_id }) => { /* trigger analysis */ })`
- `packages/shared/event-bus/__tests__/journal-ready.test.ts`:
  - Test: `Channels.journalReady` equals `'journal_ready'`
  - Test: journal-worker publishes `journal_ready` with correct `journal_id` after assembly completes
  - Test: retrospective-worker listener receives the event and invokes the analysis handler
  - Test: multiple rapid notifications are each processed independently (no coalescing)

## Constraints
- Notification payload must include `journal_id` (UUID string) — no other fields required
- retrospective-worker must not start analysis synchronously inside the LISTEN callback — enqueue or spawn
- journal-worker must emit NOTIFY only after the DB write has committed (inside the same transaction or after commit)
- Channel name constant must be defined in `channels.ts`, not hardcoded in worker source files
- Do not import Elysia or CCXT in event bus or worker files

## Steps
1. Write failing tests first (RED):
   - Test: `Channels.journalReady` constant is defined and equals `'journal_ready'`
   - Test: assembler calls `publisher.notify` with `Channels.journalReady` and `{ journal_id }`
   - Test: retrospective-worker listener handler is invoked when `journal_ready` fires
   - Test: listener receives correct `journal_id` from payload
2. Add `journalReady` to `channels.ts` (GREEN)
3. Update assembler to emit notify after successful persist
4. Update retrospective-worker to register listener on startup
5. Wire listener callback to trigger retrospective analysis (stub or real handler)
6. Refactor (REFACTOR): ensure listener registration is idempotent (safe to call multiple times on restart)

## Acceptance Criteria
- `Channels.journalReady` is exported from `packages/shared/event-bus/channels.ts`
- journal-worker emits `NOTIFY journal_ready` with `{ journal_id }` after every successful journal assembly
- retrospective-worker listener is invoked for each notification
- `bun test -- --filter "journal.ready"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "journal.ready"
bun run typecheck
bun run lint
```

## Out of Scope
- Retry logic if the retrospective-worker misses a notification (persistence guarantees are out of scope)
- Dead-letter queue for failed retrospective analysis
- `journal_updated` or `journal_closed` events
- Batching multiple `journal_ready` notifications
