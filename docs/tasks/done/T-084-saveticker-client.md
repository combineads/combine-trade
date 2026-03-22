# T-084 saveticker.com HTTP client

## Goal
Implement HTTP client for saveticker.com calendar and news APIs with retry logic and graceful error handling.

## Why
EP16 M1 requires fetching economic event calendars and news from saveticker.com. This client is the data source for all macro context features.

## Inputs
- `packages/core/macro/types.ts` (T-083 outputs: EconomicEvent, NewsItem, CreateEconomicEventInput, CreateNewsItemInput)
- `packages/core/macro/impact-parser.ts` (T-083 outputs: parseImpactFromTitle, extractEventName)
- EP16 exec-plan M1 spec

## Dependencies
T-083

## Expected Outputs
- `SavetickerClient` class with `fetchCalendarEvents` and `fetchRecentNews` methods
- `SavetickerClientConfig` interface for dependency injection

## Deliverables
- `packages/core/macro/saveticker-client.ts`
- `packages/core/macro/__tests__/saveticker-client.test.ts`

## Constraints
- `packages/core/macro/` must not import Elysia, CCXT, or Drizzle
- Use native `fetch` only (no axios/node-fetch)
- Retry: 3 attempts, exponential backoff
- On failure: return empty array + warning log (never throw, never block pipeline)
- Client must accept injected fetch for testing

## Steps
1. Define `SavetickerClientConfig` interface (baseUrl, fetch override for testing)
2. Implement `fetchCalendarEvents(startDate, endDate)` — calls saveticker.com calendar API, parses response, maps to `CreateEconomicEventInput[]` using `parseImpactFromTitle` and `extractEventName`
3. Implement `fetchRecentNews(pageSize, afterTime?)` — calls saveticker.com news API, maps to `CreateNewsItemInput[]`
4. Add retry wrapper with exponential backoff (3 attempts, 1s/2s/4s delays)
5. Write tests with injected mock fetch (no real HTTP calls)

## Acceptance Criteria
- `fetchCalendarEvents` returns parsed events with correct impact levels
- `fetchRecentNews` returns parsed news items
- Retry logic attempts 3 times before returning empty array
- API failure returns empty array + console.warn (no exception thrown)
- All tests use injected fetch (no network calls)

## Validation
```bash
bun test packages/core/macro/__tests__/saveticker-client.test.ts
bun run typecheck
```

## Out of Scope
- Actual saveticker.com API integration testing
- actual/forecast comparison (API doesn't provide it)
- News relevance scoring
