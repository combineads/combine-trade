# T-153 Journal API routes

## Goal
Create four journal API endpoints: paginated list, detail with entry snapshot, search with multiple filters, and tag-based analytics (winrate/expectancy).

## Why
The journal feature is a core trader tool. Without API routes, the frontend has no way to list, search, or analyze trade journals. These endpoints expose the `packages/core/journal` logic over HTTP so web and desktop clients can consume it.

## Inputs
- `packages/core/src/journal/` — `assembleJournal()`, `generateTags()`, journal types
- `apps/api/src/server.ts` — route mounting pattern from T-151
- `docs/ARCHITECTURE.md` — API route conventions, pagination pattern
- `docs/PRODUCT.md` — journal feature description

## Dependencies
- T-151 (route mounting infrastructure in place)

## Expected Outputs
- `apps/api/src/routes/journals.ts` — route factory `createJournalsRoute(deps)`
- `apps/api/__tests__/journals.test.ts` — tests for all 4 endpoints
- Updated `apps/api/src/server.ts` — `JournalRouteDeps` added, route mounted
- Updated `apps/api/src/index.ts` — stub deps wired

## Deliverables

### 1. Route definitions
```typescript
// GET /api/v1/journals
// Query: page, pageSize, strategyId, symbol
// Response: { data: Journal[], total: number, page: number, pageSize: number }

// GET /api/v1/journals/:id
// Response: { journal: Journal, entrySnapshot: EntrySnapshot }

// GET /api/v1/journals/search
// Query: strategyId?, symbol?, direction?, dateFrom?, dateTo?, tags?
// Response: { data: Journal[], total: number }

// GET /api/v1/journals/analytics
// Query: strategyId?, symbol?, tags?
// Response: { tagStats: TagStat[], overallWinrate: number, overallExpectancy: number }
```

### 2. JournalRouteDeps interface
```typescript
export interface JournalRouteDeps {
  listJournals(query: JournalListQuery): Promise<{ data: Journal[]; total: number }>;
  getJournal(id: string): Promise<{ journal: Journal; entrySnapshot: EntrySnapshot } | null>;
  searchJournals(filter: JournalSearchFilter): Promise<{ data: Journal[]; total: number }>;
  getJournalAnalytics(filter: JournalAnalyticsFilter): Promise<JournalAnalytics>;
}
```

### 3. Response shapes
- List: `{ data: Journal[], total: number, page: number, pageSize: number }`
- Detail: `{ journal: Journal, entrySnapshot: EntrySnapshot }` or 404
- Search: `{ data: Journal[], total: number }`
- Analytics: `{ tagStats: TagStat[], overallWinrate: number, overallExpectancy: number }`

### 4. Tests
- List returns paginated response with correct shape
- Detail returns journal + snapshot for known id
- Detail returns 404 for unknown id
- Search filters correctly (at least one filter type tested)
- Analytics returns tag stats with winrate and expectancy

## Constraints
- Route logic must delegate to `JournalRouteDeps` — no business logic in route handlers
- Pagination: default `page=1`, `pageSize=20`, max `pageSize=100`
- All query params validated via Elysia's `t.Object` schema
- No direct DB calls in route layer
- Tests use stub deps — no real DB

## Steps
1. Write failing tests (RED):
   - List endpoint returns correct shape
   - Detail endpoint returns 404 for unknown id
   - Search filters produce filtered result
   - Analytics returns tag stats
2. Create `JournalRouteDeps` interface and `createJournalsRoute()` factory (GREEN)
3. Implement all 4 route handlers delegating to deps (GREEN)
4. Add to `ApiServerDeps` and mount in `createApiServer()` (GREEN)
5. Wire stub deps in `apps/api/src/index.ts` (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `GET /api/v1/journals` returns `{ data, total, page, pageSize }`
- `GET /api/v1/journals/:id` returns journal + snapshot or 404
- `GET /api/v1/journals/search` respects all filter query params
- `GET /api/v1/journals/analytics` returns `{ tagStats, overallWinrate, overallExpectancy }`
- `bun run typecheck` passes

## Validation
```bash
bun test apps/api
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-23
- Files changed: `apps/api/src/routes/journals.ts`, `apps/api/__tests__/journals.test.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Tests: 5 journal route tests
- Validation: 1363 pass, 0 fail, typecheck clean

## Outputs
- `JournalRouteDeps` interface with 4 methods
- 4 endpoints: list, detail, search, analytics mounted at `/api/v1/journals`

## Out of Scope
- Journal write endpoints (create/update/delete) — read-only in this task
- Journal worker (T-163)
- Authentication for these routes (T-152 handles globally)
