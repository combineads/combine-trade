# T-151 Wire remaining API routes to server

## Goal
Mount events, orders, candles, alerts, and backtest routes in the Elysia API server by adding their dependency types to `ApiServerDeps` and registering them in `createApiServer()`.

## Why
The API server currently only mounts a subset of routes. Events, orders, candles, alerts, and backtest endpoints exist as route factories but are not reachable from the running server. Without mounting them, all downstream features — charting, trade execution, backtesting — have no HTTP surface area to connect to.

## Inputs
- `apps/api/src/server.ts` — current `createApiServer()` and `ApiServerDeps` definition
- `apps/api/src/index.ts` — DI entry point that instantiates deps
- Existing route factories: `createEventsRoute`, `createOrdersRoute`, `createCandlesRoute`, `createAlertsRoute`, `createBacktestRoute`
- `docs/ARCHITECTURE.md` — route mounting conventions

## Dependencies
- T-138 (base API server scaffold with first routes mounted)

## Expected Outputs
- Updated `apps/api/src/server.ts` — `ApiServerDeps` extended, all 5 routes mounted
- Updated `apps/api/src/index.ts` — stub deps wired for each new route group
- `apps/api/__tests__/routes-mount.test.ts` — integration tests verifying each route returns correct response shape

## Deliverables

### 1. Extended ApiServerDeps
```typescript
// apps/api/src/server.ts
export interface ApiServerDeps {
  // existing deps...
  eventRouteDeps: EventRouteDeps;
  orderRouteDeps: OrderRouteDeps;
  candleRouteDeps: CandleRouteDeps;
  alertRouteDeps: AlertRouteDeps;
  backtestRouteDeps: BacktestRouteDeps;
}
```

### 2. Route mounting in createApiServer()
```typescript
export function createApiServer(deps: ApiServerDeps): Elysia {
  return new Elysia()
    // existing routes...
    .use(createEventsRoute(deps.eventRouteDeps))
    .use(createOrdersRoute(deps.orderRouteDeps))
    .use(createCandlesRoute(deps.candleRouteDeps))
    .use(createAlertsRoute(deps.alertRouteDeps))
    .use(createBacktestRoute(deps.backtestRouteDeps));
}
```

### 3. Stub deps in apps/api/src/index.ts
- Each route dep group gets a minimal stub satisfying the interface
- Stubs return sensible empty/default responses without real service calls

### 4. Route mount tests
- Each of the 5 route groups: at least one endpoint returns HTTP 200 with correct response shape
- Tests use Elysia's `.handle()` for unit-level route testing (no real network)

## Constraints
- Do not inline route logic in `createApiServer()` — route factories must remain separate
- Stub deps must satisfy TypeScript interfaces exactly — no `as any` casts
- Follow existing route mounting pattern established in T-138
- No real DB or exchange calls in tests — use stubs

## Steps
1. Write failing tests (RED):
   - Each route group responds with correct shape on its primary endpoint
   - TypeScript compilation passes with extended deps interface
2. Add `EventRouteDeps`, `OrderRouteDeps`, `CandleRouteDeps`, `AlertRouteDeps`, `BacktestRouteDeps` to `ApiServerDeps` (GREEN)
3. Mount all 5 route factories in `createApiServer()` (GREEN)
4. Wire stub deps in `apps/api/src/index.ts` (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- `ApiServerDeps` includes all 5 new dep group types
- All 5 route groups are mounted and reachable via `createApiServer()`
- `apps/api/src/index.ts` compiles without errors with stub deps wired
- Each mounted route returns HTTP 200 with correct response shape in tests
- `bun run typecheck` passes

## Validation
```bash
bun test apps/api
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-23
- Files changed: `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/events.ts`, `apps/api/__tests__/routes-wiring.test.ts`, `apps/api/__tests__/events.test.ts`
- Approach: Extended `ApiServerDeps` with 5 new dep groups, mounted all route factories, wired stub deps. Fixed Elysia route param conflict (`strategyId` → `id` in events.ts to match strategies route `:id` segment).
- Validation: 1346 pass, 0 fail, typecheck clean

## Outputs
- `ApiServerDeps` now includes `eventDeps`, `orderDeps`, `candleDeps`, `alertDeps`, `backtestDeps`
- All 5 route groups reachable via HTTP

## Out of Scope
- Real service implementations behind the route deps (stubs only)
- Auth middleware (T-152)
- Journal and paper trading routes (T-153, T-154)
