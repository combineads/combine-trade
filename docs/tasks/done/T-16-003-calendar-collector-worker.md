# T-16-003 Calendar collector worker

## Goal
Implement a daily cron worker that fetches upcoming economic events from saveticker.com and upserts them into the database.

## Why
EP16 M2 — automated daily collection of upcoming HIGH/MEDIUM impact economic events so the system can anticipate macro-sensitive trading windows.

## Inputs
- `packages/core/macro/saveticker-client.ts` (T-16-002 outputs: SavetickerClient)
- `packages/core/macro/impact-parser.ts` (T-16-001 outputs: shouldCollect)
- `db/schema/macro.ts` (T-16-001 outputs: economicEvents table)

## Dependencies
T-16-001, T-16-002

## Expected Outputs
- `CalendarCollector` class with `collect()` method
- Worker entry point at `workers/macro-collector/calendar-collector.ts`

## Deliverables
- `workers/macro-collector/calendar-collector.ts`
- `workers/macro-collector/__tests__/calendar-collector.test.ts`

## Constraints
- Cron schedule: daily UTC 00:30 (`30 0 * * *`)
- Fetch range: today to today+7 days
- Only store HIGH and MEDIUM impact events (use `shouldCollect`)
- Upsert by `external_id` (idempotent)
- DB access via injected repository interface (not direct Drizzle import in worker logic)
- DB connection pool: max 2

## Steps
1. Define `CalendarEventRepository` interface with `upsertByExternalId` method
2. Implement `CalendarCollector` class that uses SavetickerClient + repository
3. Filter events by impact using `shouldCollect`
4. Upsert each event by external_id
5. Write tests with mock client and mock repository

## Acceptance Criteria
- Running collect() fetches 7-day range and upserts HIGH/MEDIUM events
- Duplicate runs produce no duplicate data (upsert by external_id)
- LOW impact events are filtered out
- Client failure returns gracefully (empty collection, warning log)

## Validation
```bash
bun test workers/macro-collector/__tests__/calendar-collector.test.ts
bun run typecheck
```

## Out of Scope
- Cron scheduler infrastructure (just the collect logic)
- DrizzleORM repository implementation (repository interface only)
- LOW impact event collection option
