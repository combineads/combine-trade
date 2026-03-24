# T-16-009 Macro analytics API routes

## Goal
Add API endpoints for macro event browsing, macro-based trade analytics, and retrospective report retrieval.

## Why
EP16 M6 — traders need API access to browse economic events, analyze how macro conditions affect trading performance, and read retrospective reports.

## Inputs
- `packages/core/macro/types.ts` (T-16-001 outputs: EconomicEvent, NewsItem)
- `apps/api/src/lib/errors.ts` (existing error types)

## Dependencies
T-16-001

## Expected Outputs
- 3 API route factories with deps interfaces
- Elysia route plugins

## Deliverables
- `apps/api/src/routes/macro.ts`
- `apps/api/__tests__/macro.test.ts`

## Constraints
- `GET /api/v1/macro/events` — economic events with date range + impact filter
- `GET /api/v1/journals/macro-analytics` — aggregate performance by macro tag
- `GET /api/v1/journals/:id/retrospective` — individual retrospective report
- All routes use DI (deps interface, no direct DB import)
- JWT auth required (use existing auth middleware pattern)
- Report null → `{ report: null, pending: true }`

## Steps
1. Define `MacroRouteDeps` interface with query methods
2. Implement `GET /api/v1/macro/events` with date range and impact filtering
3. Implement `GET /api/v1/journals/macro-analytics` with tag-based aggregation
4. Implement `GET /api/v1/journals/:id/retrospective` with pending state handling
5. Write tests with mock deps

## Acceptance Criteria
- Date range filter works correctly for event listing
- Impact filter (HIGH/MEDIUM/LOW) filters correctly
- Analytics endpoint returns per-tag performance metrics
- Retrospective endpoint returns report or `{ report: null, pending: true }`
- 404 for unknown journal ID
- All tests use mock dependencies

## Validation
```bash
bun test apps/api/__tests__/macro.test.ts
bun run typecheck
```

## Out of Scope
- DrizzleORM repository implementations
- Auth middleware wiring (tested separately)
- Frontend UI for analytics
