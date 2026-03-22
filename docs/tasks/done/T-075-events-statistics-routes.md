# T-075 Events and statistics API routes

## Goal
Implement event and statistics read endpoints in `apps/api/src/routes/events.ts`:
- `GET /strategies/:id/events` — list events for a strategy (paginated)
- `GET /strategies/:id/statistics` — aggregate statistics for a strategy
- `GET /events/:id` — get a single event by ID

## Why
Events are the core unit of the vectorization pipeline — every candle close that meets strategy criteria produces an event. Exposing events and their aggregate statistics over the API allows the UI to show signal history, win rate charts, and expectancy data without the client needing direct DB access.

## Inputs
- `EventRepository` interface from `packages/core/` (or `packages/shared/`)
- DI container wiring in `apps/api/`
- T-073 error helpers (`ApiError`, `NotFoundError`, `ok`, `paginated`)

## Dependencies
- T-073

## Expected Outputs
- `apps/api/src/routes/events.ts`
  - Elysia router plugin
  - `GET /strategies/:strategyId/events` with query params: `page`, `pageSize`, `symbol`, `direction`, `dateFrom`, `dateTo`
  - `GET /strategies/:strategyId/statistics` returning aggregated stats (winRate, expectancy, totalEvents, longCount, shortCount)
  - `GET /events/:id` returning full event detail
  - Uses `EventRepository` injected via DI container
- `apps/api/__tests__/events.test.ts`
  - In-memory mock of `EventRepository`
  - Tests covering success and error cases for all 3 endpoints

## Deliverables
- `apps/api/src/routes/events.ts`
- `apps/api/__tests__/events.test.ts`

## Constraints
- No direct DB access — only through `EventRepository` interface
- All responses use `ok()` / `paginated()` helpers from T-073
- All errors throw `ApiError` subclasses
- Pagination query params: `page` defaults to 1, `pageSize` defaults to 20, max `pageSize` = 100
- All tests use `bun:test` with in-memory mock — no real DB

## Steps
1. Identify `EventRepository` interface methods available
2. Write failing tests (RED):
   - `GET /strategies/:id/events` → 200 with paginated events
   - `GET /strategies/:id/events?symbol=BTCUSDT` → filters by symbol
   - `GET /strategies/:id/events?pageSize=200` → clamps to 100
   - `GET /strategies/:id/statistics` → 200 with stats object
   - `GET /strategies/:id/statistics` for unknown strategy → 404
   - `GET /events/:id` with existing event → 200
   - `GET /events/:id` with unknown event → 404
3. Implement route handlers (GREEN)
4. Refactor: extract schema definitions to top of file

## Acceptance Criteria
- All 3 endpoints return correct status codes and response envelopes
- Filtering and pagination work correctly
- `pageSize` is clamped to 100 maximum
- Unknown strategy or event ID returns 404
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test apps/api/__tests__/events.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Event creation (pipeline concern, not API CRUD)
- Vector search / similarity queries
- Labeling events
- Authentication guard (T-079)
