# T-13-008 Journal List/Detail/Search API

## Goal
Build journal list, detail, and search API endpoints so the web and desktop UI can browse and search trade journal entries with pagination, filtering, and text search.

## Why
Traders need to review their trade history in detail. Without API endpoints, the web/desktop UI has no way to display journal entries, apply filters by symbol or strategy, or search notes and tags. These endpoints form the foundation for all journal UI screens.

## Inputs
- `packages/shared/db/schema/trade_journals.ts` — trade_journals table schema (T-13-006)
- `apps/api/src/routes/` — Elysia router structure
- `packages/shared/db/index.ts` — DrizzleORM instance
- `docs/exec-plans/13-journal-analytics.md` — EP13 journal API spec

## Dependencies
- T-13-006 (trade journal schema and writer — provides the table and base types)

## Expected Outputs
- `apps/api/src/routes/journals/list.ts` — list endpoint handler
- `apps/api/src/routes/journals/detail.ts` — detail endpoint handler
- `apps/api/src/routes/journals/search.ts` — search endpoint handler
- `apps/api/src/routes/journals/index.ts` — Elysia router grouping all journal routes
- `apps/api/__tests__/routes/journals.test.ts` — test suite
- Updated `apps/api/src/routes/index.ts` — registers journal router

## Deliverables
- `GET /api/v1/journals` — paginated list with filters:
  - Query params: `page` (default 1), `limit` (default 20, max 100), `strategyId`, `symbol`, `side` (`LONG`|`SHORT`), `outcome` (`WIN`|`LOSS`|`PASS`), `from` (ISO date), `to` (ISO date)
  - Response: `{ data: JournalEntry[]; total: number; page: number; limit: number }`
  - User isolation: always filters by `userId` from JWT
- `GET /api/v1/journals/:id` — full journal entry detail:
  - Response: `JournalEntry` with full context (pattern vector, match stats, decision, execution)
  - Returns 404 if journal not found or belongs to different user
- `GET /api/v1/journals/search` — text search:
  - Query params: `q` (search term), `page`, `limit`
  - Searches across: tags (array contains), symbol (ilike), notes (ilike)
  - User isolation enforced
  - Response same shape as list endpoint

## Constraints
- All endpoints require JWT authentication; userId extracted from token
- User isolation: never return journals belonging to a different userId
- Pagination: `limit` must be capped at 100 to prevent large result sets
- Route must not expose internal DB row IDs beyond the journal `id` field
- Follow existing Elysia AOP decorator patterns for auth and transaction

## Steps
1. Write failing tests first (RED):
   - Test: `GET /api/v1/journals` returns paginated list for authenticated user
   - Test: filters by strategyId, symbol, side, outcome, date range
   - Test: user isolation — user A cannot see user B's journals
   - Test: `GET /api/v1/journals/:id` returns full detail for own journal
   - Test: `GET /api/v1/journals/:id` returns 404 for another user's journal
   - Test: `GET /api/v1/journals/search?q=BTC` matches symbol and notes
   - Test: `GET /api/v1/journals/search?q=tag:breakout` matches tags
   - Test: pagination respects `limit` cap of 100
2. Implement list, detail, search handlers (GREEN)
3. Register routes in `apps/api/src/routes/journals/index.ts` and mount at `/api/v1/journals`
4. Refactor (REFACTOR): extract shared query builder helpers for reuse across list and search

## Acceptance Criteria
- `GET /api/v1/journals` returns paginated results filtered by all supported params
- `GET /api/v1/journals/:id` returns 404 for missing or cross-user access
- `GET /api/v1/journals/search` returns results matching tags, symbol, and notes
- User isolation enforced on all three endpoints
- `bun test -- --filter "journal-api"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "journal-api"
bun run typecheck
bun run lint
```

## Out of Scope
- Journal write/create endpoints (T-13-006)
- Notes and custom tag mutation endpoints (T-13-011)
- Analytics aggregation (T-13-009)
- UI components for journal browser (EP22)
