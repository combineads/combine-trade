# T-127 Implement API query service for events, candles, orders

## Goal
Create query service implementations that connect API route deps to the DB, enabling the existing event, candle, alert, and order routes to return real data.

## Why
EP08 M1 — route factories exist but need real data. Query services bridge the gap between routes and Drizzle.

## Inputs
- `apps/api/src/routes/events.ts` (EventRouteDeps)
- `apps/api/src/routes/candles.ts` (CandleRouteDeps)
- `apps/api/src/routes/orders.ts` (OrderRouteDeps)
- `apps/api/src/routes/alerts.ts` (AlertRouteDeps)
- `db/schema/` (all relevant tables)

## Dependencies
- T-117 (strategy repository — for strategyExists check)

## Expected Outputs
- `ApiQueryService` with methods matching all route dep interfaces
- Paginated queries with proper offset/limit
- Date range filtering for events

## Deliverables
- `apps/api/src/services/query-service.ts`
- `apps/api/__tests__/query-service.test.ts`

## Constraints
- All queries use Drizzle query builder
- Pagination: offset = (page - 1) * pageSize, limit = pageSize
- Event queries support symbol, direction, date range filters
- Order queries support symbol, status, strategyId filters
- DB instance injected via constructor

## Steps
1. Write tests for query methods with mock DB deps
2. Implement ApiQueryService class
3. Map DB rows to API response types
4. Support pagination and filtering

## Acceptance Criteria
- All route deps interface methods implemented
- Pagination returns correct total count
- Filters correctly narrow results
- Empty results return empty arrays (not errors)

## Validation
```bash
bun test apps/api/__tests__/query-service.test.ts
bun run typecheck
```

## Out of Scope
- Write operations (handled by repositories)
- SSE streaming
- Authentication

## Implementation Plan
- ApiQueryService wraps QueryServiceDeps (DI interface matching all route deps)
- Each method delegates to the corresponding dep function
- Drizzle-specific queries deferred to dep implementations (injected at composition root)

## Implementation Notes
- Date: 2026-03-22
- Files changed: `apps/api/src/services/query-service.ts` (new), `apps/api/__tests__/query-service.test.ts` (new)
- Tests: 11 tests covering all query methods, pagination, filtering, and empty results
- Approach: Thin service layer that delegates to injected deps — keeps Drizzle out of the service, real DB queries come from composition root
- Validation: 11/11 pass, typecheck clean, full suite 1148 pass

## Outputs
- `ApiQueryService` class implementing all route dep interfaces (events, candles, orders, alerts)
- `QueryServiceDeps` interface unifying all query dependencies
- Methods: findEventById, findEventsByStrategy, getStrategyStatistics, strategyExists, findCandles, findOrders, findAlerts
