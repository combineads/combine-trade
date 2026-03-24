# T-08-002 Strategy CRUD API routes

## Goal
Implement strategy CRUD endpoints in `apps/api/src/routes/strategies.ts`:
- `GET /strategies` — list all strategies
- `POST /strategies` — create a strategy
- `GET /strategies/:id` — get one strategy
- `PUT /strategies/:id` — update strategy name/description
- `PUT /strategies/:id/mode` — switch strategy mode (live/paper/disabled)

## Why
Strategies are the top-level domain object. The UI and backtest tooling need full CRUD access. By wiring routes through the DI container's `StrategyRepository` interface, the API layer stays decoupled from database internals and remains fully testable with an in-memory mock.

## Inputs
- `StrategyRepository` interface from `packages/core/` (or `packages/shared/`)
- DI container wiring in `apps/api/src/container.ts` (or equivalent)
- T-08-001 error helpers (`ApiError`, `NotFoundError`, `ok`, `paginated`)

## Dependencies
- T-08-001

## Expected Outputs
- `apps/api/src/routes/strategies.ts`
  - Elysia router plugin mounted at `/strategies`
  - Type-safe request/response schemas (Elysia `t` / TypeBox)
  - Uses `StrategyRepository` injected via DI container
  - Returns `NotFoundError` when strategy ID is not found
- `apps/api/__tests__/strategies.test.ts`
  - In-memory mock of `StrategyRepository`
  - Tests for all 5 endpoints covering success and error paths

## Deliverables
- `apps/api/src/routes/strategies.ts`
- `apps/api/__tests__/strategies.test.ts`

## Constraints
- No direct DB access — only through `StrategyRepository` interface
- All route handlers must use `ok()` / `paginated()` from T-08-001 for responses
- All errors must throw `ApiError` subclasses (never `res.status(...)` manually)
- All tests use `bun:test` with an in-memory mock repository — no real DB
- Elysia type-safe schemas required for all request bodies and query params

## Steps
1. Identify `StrategyRepository` interface methods available
2. Write failing tests (RED):
   - `GET /strategies` → 200 with paginated list
   - `POST /strategies` with valid body → 201 with created strategy
   - `POST /strategies` with missing required fields → 422
   - `GET /strategies/:id` with existing ID → 200 with strategy
   - `GET /strategies/:id` with unknown ID → 404
   - `PUT /strategies/:id` with valid update → 200 with updated strategy
   - `PUT /strategies/:id/mode` with valid mode → 200
   - `PUT /strategies/:id/mode` with invalid mode value → 422
3. Implement route handlers (GREEN)
4. Refactor: extract schema definitions to top of file

## Acceptance Criteria
- All 5 endpoints respond with correct status codes and `{ data }` envelope
- Unknown strategy ID returns 404 with `{ error: { code: "NOT_FOUND" } }`
- Invalid request body returns 422
- Mode endpoint only accepts valid enum values
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test apps/api/__tests__/strategies.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Strategy version management
- Strategy source code upload
- Backtest triggering (T-08-005)
- Authentication guard (T-10-002)
