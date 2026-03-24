# T-16-004 Event-triggered news collector

## Goal
Implement a polling collector that fetches news for economic events after they occur, linking news items to their triggering events.

## Why
EP16 M3 — after an economic event's scheduled time passes, automatically collect related news within a ±30 minute window and associate them with the event.

## Inputs
- `packages/core/macro/saveticker-client.ts` (T-16-002 outputs: SavetickerClient.fetchRecentNews)
- `db/schema/macro.ts` (T-16-001 outputs: economicEvents, newsItems tables)

## Dependencies
T-16-001, T-16-002

## Expected Outputs
- `NewsCollector` class with `collectPendingEvents()` method
- News-event linking logic

## Deliverables
- `workers/macro-collector/news-collector.ts`
- `workers/macro-collector/__tests__/news-collector.test.ts`

## Constraints
- Poll interval: 1 minute (logic only, not scheduler)
- Trigger condition: `scheduled_at <= now() - 5min AND news_collected = false`
- News time filter: event.scheduled_at ± 30 minutes
- Upsert news by external_id
- After collection: set `news_collected = true`, `news_collected_at = now()`
- Client failure: keep `news_collected = false` for retry next cycle
- DB access via injected repository interface

## Steps
1. Define `NewsEventRepository` interface (findPendingEvents, upsertNews, markCollected)
2. Implement `NewsCollector` class
3. For each pending event: fetch news, filter by ±30min window, upsert, mark collected
4. Handle partial failures (one event fails, others continue)
5. Write tests with mock repository and mock client

## Acceptance Criteria
- Events past scheduled_at + 5min trigger news collection
- Only news within ±30 minutes of event scheduled_at is stored
- `news_collected` flag prevents re-collection
- Client failure leaves `news_collected = false` for retry
- Multiple pending events processed independently

## Validation
```bash
bun test workers/macro-collector/__tests__/news-collector.test.ts
bun run typecheck
```

## Out of Scope
- DB advisory locks for concurrent collectors
- Scheduler/cron infrastructure
- News relevance scoring
