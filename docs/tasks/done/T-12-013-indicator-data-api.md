# T-12-013 Server-side indicator calculation API

## Goal
API endpoint for server-side calculation of technical indicators (SMA, EMA, BB, RSI, MACD, Stochastic), returning paginated results aligned to the candle cursor API.

## Why
Calculating indicators on the client requires downloading raw candle data plus warm-up periods, then running computation in the browser. Server-side calculation reduces client payload, eliminates warm-up window management, and keeps heavy computation off the UI thread.

## Inputs
- `packages/core/indicators/` — indicator calculation functions (T-02-001)
- `GET /api/v1/candles/:symbol/:timeframe` — candle data with cursor pagination (T-12-010)
- `db/schema/candles.ts` — candles table

## Dependencies
- T-12-010 (chart data API — cursor pagination contract to match)
- T-02-001 (core indicator calculations)

## Expected Outputs
- `GET /api/v1/indicators/:symbol/:timeframe/:indicator`
- Query params: `cursor` (ISO timestamp), `limit` (default 500, max 2000), `period` (indicator-specific), `fastPeriod` / `slowPeriod` / `signalPeriod` (MACD)
- Response: `{ data: IndicatorPoint[], nextCursor: string | null }`
- `IndicatorPoint` shape varies by indicator type (see Deliverables)

## Deliverables
- `apps/api/src/routes/indicators.ts` — new route file
- `apps/api/src/routes/__tests__/indicators.test.ts`
- Updated Eden treaty client types
- Response shapes:
  - SMA/EMA: `{ time: string, value: string }`
  - BB: `{ time: string, upper: string, middle: string, lower: string }`
  - RSI: `{ time: string, value: string }`
  - MACD: `{ time: string, macd: string, signal: string, histogram: string }`
  - Stochastic: `{ time: string, k: string, d: string }`

## Constraints
- Use `packages/core/indicators` for all calculations — do not re-implement formulas
- Fetch warm-up candles (period × 2) before `cursor` to seed the indicator state; exclude warm-up points from the response
- All numeric values serialized as strings (Decimal.js)
- Cursor pagination contract must be identical to the candle API (timestamp-exclusive cursor)
- Unknown `:indicator` value returns HTTP 400

## Steps
1. Write failing tests first (RED):
   - Test: `GET /api/v1/indicators/BTCUSDT/1m/sma?period=20` returns SMA array
   - Test: response values match manual SMA calculation for the same candle window
   - Test: cursor pagination produces contiguous, non-duplicated data across pages
   - Test: `GET .../macd?fastPeriod=12&slowPeriod=26&signalPeriod=9` returns correct shape
   - Test: unknown indicator returns 400
   - Test: warm-up candles are not included in the response
2. Implement route (GREEN):
   - Route handler parses and validates params
   - Fetches `limit + warmup` candles from DB starting before cursor
   - Calls appropriate `packages/core/indicators` function
   - Slices warm-up points from result, computes `nextCursor`
3. Update Eden treaty client with indicator route types
4. Refactor (REFACTOR): share warm-up + cursor-slice logic in a `computeIndicatorPage` utility

## Acceptance Criteria
- Each supported indicator returns correctly shaped, numerically accurate data
- Cursor pagination is consistent with the candle API (exclusive timestamp cursor)
- Warm-up candles do not appear in the response
- Unknown indicator name → HTTP 400
- `bun test -- --filter "indicator-data-api"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "indicator-data-api"
bun run typecheck
bun run lint
```

## Out of Scope
- Custom / user-defined indicator formulas
- Indicator caching / precomputation jobs
- WebSocket streaming of indicator updates
