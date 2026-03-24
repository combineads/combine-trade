# T-08-001 API error handling and response helpers

## Goal
Create standardized API error responses and an Elysia error handler plugin in `apps/api/src/lib/errors.ts` and `apps/api/src/lib/response.ts`.

## Why
Every API route needs a consistent error shape and a uniform success envelope. Without shared helpers, each route author invents their own format, leading to inconsistent client contracts, harder frontend integration, and duplicated try/catch boilerplate. Centralizing error handling in an Elysia plugin ensures all unhandled exceptions are caught and serialized uniformly before they reach the client.

## Inputs
- Existing Elysia app entry point in `apps/api/src/`
- Elysia docs for `onError` hook and plugin pattern

## Dependencies
None.

## Expected Outputs
- `apps/api/src/lib/errors.ts`
  - `ApiError` class: `constructor(status: number, code: string, message: string)`
  - Well-known subclasses: `NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`
  - `errorHandlerPlugin` — Elysia plugin that registers an `onError` hook serializing all errors into `{ error: { code, message } }` with correct HTTP status
- `apps/api/src/lib/response.ts`
  - `ok<T>(data: T): { data: T }` — wraps successful payload
  - `paginated<T>(items: T[], total: number, page: number, pageSize: number): { data: T[], meta: { total, page, pageSize, totalPages } }`
- `apps/api/__tests__/errors.test.ts`

## Deliverables
- `apps/api/src/lib/errors.ts`
- `apps/api/src/lib/response.ts`
- `apps/api/__tests__/errors.test.ts`

## Constraints
- `ApiError` must be a proper `Error` subclass (set `this.name`)
- `errorHandlerPlugin` must handle both `ApiError` instances and unexpected `Error` instances (unexpected → 500 with code `INTERNAL_ERROR`, message hidden in non-dev environments)
- Response helpers are pure functions — no Elysia imports
- All tests use `bun:test`

## Steps
1. Write failing tests (RED):
   - `ApiError` constructor sets `status`, `code`, `message`, `name`
   - `NotFoundError` defaults to status 404 and code `NOT_FOUND`
   - `UnauthorizedError` defaults to status 401 and code `UNAUTHORIZED`
   - `ValidationError` defaults to status 422 and code `VALIDATION_ERROR`
   - `ForbiddenError` defaults to status 403 and code `FORBIDDEN`
   - `ConflictError` defaults to status 409 and code `CONFLICT`
   - `ok(data)` returns `{ data }`
   - `paginated(items, 25, 2, 10)` returns correct `meta.totalPages = 3`
   - `errorHandlerPlugin` — mount on a test Elysia app, throw `NotFoundError` in a route, assert response status 404 and body shape
   - `errorHandlerPlugin` — throw unexpected `Error`, assert response status 500 and `code: "INTERNAL_ERROR"`
2. Implement `errors.ts` (GREEN)
3. Implement `response.ts` (GREEN)
4. Refactor: add JSDoc to all exports

## Acceptance Criteria
- All `ApiError` subclasses carry correct default status and code
- `errorHandlerPlugin` serializes every thrown error to `{ error: { code, message } }`
- Unexpected errors map to 500 / `INTERNAL_ERROR`
- `ok` and `paginated` return correct shapes
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test apps/api/__tests__/errors.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Request body validation (handled per-route via Elysia schemas)
- Logging / Slack alerting on errors
- Rate-limit error type
