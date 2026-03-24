# T-13-006 Journal worker event handler

## Goal
Create a journal worker that subscribes to `label_ready` events via the event bus, calls `assembleJournal()` from `packages/core/journal`, applies `generateTags()` for auto-tagging, and stores the resulting journal record.

## Why
Journals are assembled automatically after each trade label is assigned (WIN/LOSS/TIME_EXIT). Without a worker to react to `label_ready` events, journals must be created manually, which breaks the automation promise of the system. This worker is the bridge between the labeling pipeline and the journal storage layer.

## Inputs
- `packages/core/src/journal/` — `assembleJournal()`, `generateTags()`, `Journal` type
- Event bus interface (existing in workers or packages/shared)
- `label_ready` event payload type
- `docs/ARCHITECTURE.md` — worker patterns, event bus usage
- `docs/RELIABILITY.md` — worker failure handling

## Dependencies
- None (pure logic; interfaces abstract the event bus and storage)

## Expected Outputs
- `workers/journal/src/journal-event-handler.ts`
- `workers/journal/src/journal-event-handler.test.ts`
- Updated worker entry point to register handler

## Deliverables

### 1. LabelReadyEvent type
```typescript
// The event emitted when a trade outcome label is assigned
export interface LabelReadyEvent {
  type: 'label_ready';
  tradeId: string;
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  entryPrice: string;
  exitPrice: string;
  label: 'WIN' | 'LOSS' | 'TIME_EXIT';
  entryVector: number[];
  exitVector: number[];
}
```

### 2. Journal event handler
```typescript
// workers/journal/src/journal-event-handler.ts

export interface JournalStorage {
  save(journal: Journal): Promise<void>;
}

export interface EventBusSubscription {
  unsubscribe(): void;
}

export interface EventBus {
  subscribe(eventType: string, handler: (event: unknown) => Promise<void>): EventBusSubscription;
}

export class JournalEventHandler {
  constructor(
    private eventBus: EventBus,
    private storage: JournalStorage,
  ) {}

  start(): EventBusSubscription

  async handleLabelReady(event: LabelReadyEvent): Promise<void>
}
```

### 3. Handler logic
- `start()`: subscribes to `'label_ready'` events, returns subscription
- `handleLabelReady()`:
  1. Call `assembleJournal(event)` → `Journal`
  2. Call `generateTags(journal)` → `string[]`
  3. Set `journal.tags = tags`
  4. Call `storage.save(journal)`
- On error: log error, do not rethrow (worker must not crash on single event failure)

### 4. Tests
- `handleLabelReady()` calls `assembleJournal()` with event data
- `handleLabelReady()` calls `generateTags()` and sets tags on journal
- `handleLabelReady()` calls `storage.save()` with assembled journal
- `handleLabelReady()` on `storage.save()` error: logs error, does not throw
- `start()` returns subscription object with `unsubscribe()` method

## Constraints
- Worker must not crash on single event failure — error handling required in `handleLabelReady()`
- `JournalStorage` and `EventBus` are interfaces — no concrete DB or message broker imports
- `assembleJournal()` and `generateTags()` are imported from `packages/core` only
- Worker must not import Elysia or any HTTP framework
- Tests use stub implementations of `JournalStorage` and `EventBus`

## Steps
1. Write failing tests (RED):
   - handleLabelReady assembles and saves journal
   - Tags applied to assembled journal
   - Storage error does not throw
   - start returns subscription
2. Define `LabelReadyEvent`, `JournalStorage`, `EventBus` interfaces (GREEN)
3. Implement `JournalEventHandler.handleLabelReady()` (GREEN)
4. Implement `JournalEventHandler.start()` (GREEN)
5. Register handler in worker entry point (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `handleLabelReady()` calls `assembleJournal()`, `generateTags()`, and `storage.save()` in order
- Tags from `generateTags()` are set on the journal before saving
- Storage failure is caught and logged, not rethrown
- `start()` subscribes to `'label_ready'` and returns `EventBusSubscription`
- `bun run typecheck` passes

## Validation
```bash
bun test
bun run typecheck
```

## Out of Scope
- Journal API routes
- Event bus concrete implementation (RabbitMQ, Redis, etc.)
- Manual journal creation
- Journal edit/delete

## Implementation Notes
- Date: 2026-03-23
- Files changed: `workers/journal-worker/src/journal-event-handler.ts`, `workers/journal-worker/__tests__/journal-event-handler.test.ts`, `workers/journal-worker/package.json`
- Tests: 5 pass (assemble+save, auto-tags, error swallow, subscribe, route events)
- Approach: JournalEventHandler builds TradeJournal directly from LabelReadyEvent fields. Uses crypto.randomUUID() for IDs. Error handler catches all exceptions to prevent worker crash.
- Validation: `bun test` 1415 pass, `bun run typecheck` clean

## Outputs
- `JournalEventHandler` class with `start()` and `handleLabelReady()` methods
- `LabelReadyEvent`, `JournalStorage`, `EventBus`, `EventBusSubscription` interfaces
