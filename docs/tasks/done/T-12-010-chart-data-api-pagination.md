# T-12-010 Chart data API with cursor-based pagination

## Goal
Implement a chart data API endpoint with cursor-based pagination for efficient infinite-scroll rendering of large candle datasets.

## Why
Candle datasets for long date ranges (e.g. 1m timeframe over months) are too large to return in a single response. Cursor-based pagination lets the chart fetch exactly the window it needs without offset-drift issues.

## Inputs
- `db/schema/candles.ts` — candles table schema
- `apps/api/src/routes/` — existing route structure
- `packages/shared/eden/` — Eden treaty client

## Dependencies
- T-12-002 (chart foundation / Lightweight Charts setup)

## Expected Outputs
- `GET /api/v1/candles/:symbol/:timeframe` — returns paginated candle array
- Response shape: `{ data: Candle[], nextCursor: string | null }`
- Query params: `cursor` (ISO timestamp string, optional), `limit` (default 500, max 2000)
- Eden treaty client updated with the new route

## Deliverables
- `apps/api/src/routes/candles.ts` — new route file (or updated if existing)
- `apps/api/src/routes/__tests__/candles.test.ts`
- Updated Eden treaty client types

## Constraints
- Cursor must be timestamp-based (ISO 8601) for consistency with chart x-axis
- Exceeding max limit (2000) clamps silently — no error
- Cursor is exclusive: first result has `openTime > cursor`
- Results ordered by `openTime ASC`
- All monetary values returned as strings (Decimal.js serialization)

## Steps
1. Write failing tests first (RED):
   - Test: `GET /api/v1/candles/BTCUSDT/1m` returns 500 candles by default
   - Test: `?limit=100` returns exactly 100 candles
   - Test: `?limit=3000` returns at most 2000 candles
   - Test: `?cursor=<timestamp>` returns candles strictly after cursor
   - Test: last page returns `nextCursor: null`
   - Test: intermediate page returns a valid `nextCursor`
2. Implement route (GREEN):
   - Parse and validate `:symbol`, `:timeframe`, `cursor`, `limit` params
   - Query DB with `WHERE openTime > cursor ORDER BY openTime ASC LIMIT limit+1`
   - Determine `nextCursor` from the (limit+1)th row if present
   - Return `{ data, nextCursor }`
3. Update Eden treaty client to include the new route type
4. Refactor (REFACTOR): extract cursor pagination helper for reuse in indicator API

## Acceptance Criteria
- Default response contains 500 candles ordered by `openTime ASC`
- `nextCursor` allows fetching the next page without gaps or duplicates
- Cursor from page N, when used as input to page N+1, produces contiguous data
- `bun test -- --filter "chart-data-api"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "chart-data-api"
bun run typecheck
bun run lint
```

## Out of Scope
- WebSocket streaming of live candles (covered elsewhere)
- Multi-symbol batch endpoint
- Aggregation / resampling of candle timeframes server-side
