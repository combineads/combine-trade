# T-08-004 Candles, alerts, and orders API routes

## Goal
Implement read-only paginated endpoints for candles, alerts, and orders:
- `GET /candles` — list candles filtered by symbol and timeframe
- `GET /alerts` — list alerts filtered by strategy and status
- `GET /orders` — list orders filtered by symbol and status

## Why
The UI needs read access to historical candles for chart rendering, alerts for notification history, and orders for trade tracking. Exposing these as paginated REST endpoints with filter support covers the full data browsing use case without coupling the UI to database internals.

## Inputs
- `CandleRepository`, `AlertRepository`, `OrderRepository` interfaces from `packages/core/` (or `packages/shared/`)
- DI container wiring in `apps/api/`
- T-08-001 error helpers (`ok`, `paginated`, `ValidationError`)

## Dependencies
- T-08-001

## Expected Outputs
- `apps/api/src/routes/candles.ts`
  - `GET /candles` with query params: `symbol` (required), `timeframe` (required), `page`, `pageSize`, `from`, `to`
- `apps/api/src/routes/alerts.ts`
  - `GET /alerts` with query params: `strategyId`, `status`, `page`, `pageSize`
- `apps/api/src/routes/orders.ts`
  - `GET /orders` with query params: `symbol`, `status`, `strategyId`, `page`, `pageSize`
- `apps/api/__tests__/data-routes.test.ts`
  - In-memory mocks for all three repositories
  - Tests for all 3 endpoints covering success, filtering, and error paths

## Deliverables
- `apps/api/src/routes/candles.ts`
- `apps/api/src/routes/alerts.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/__tests__/data-routes.test.ts`

## Constraints
- No direct DB access — only through repository interfaces
- All responses use `paginated()` helper from T-08-001
- Missing required query params (symbol, timeframe for candles) → 422 `ValidationError`
- Pagination defaults: `page=1`, `pageSize=50`, max `pageSize=200`
- All tests use `bun:test` with in-memory mocks — no real DB
- These are read-only endpoints — no POST/PUT/DELETE

## Steps
1. Identify available methods on each repository interface
2. Write failing tests (RED):
   - `GET /candles?symbol=BTCUSDT&timeframe=1h` → 200 with paginated candles
   - `GET /candles` missing symbol → 422
   - `GET /candles` missing timeframe → 422
   - `GET /alerts` → 200 with paginated alerts
   - `GET /alerts?strategyId=abc` → filtered results
   - `GET /orders` → 200 with paginated orders
   - `GET /orders?status=filled` → filtered results
   - `pageSize=300` on any endpoint → clamped to 200
3. Implement route handlers (GREEN)
4. Refactor: extract shared pagination schema to a common helper

## Acceptance Criteria
- All 3 endpoints return paginated responses with correct `meta`
- Required query params enforced with 422 on missing values
- `pageSize` clamped to 200 maximum
- Filters are applied correctly (verified via mock call assertions)
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test apps/api/__tests__/data-routes.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Order creation / execution (decision engine concern)
- Alert creation / dispatch
- Candle ingestion
- WebSocket streaming for live candles
- Authentication guard (T-10-002 — not in EP08)
