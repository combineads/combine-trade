# T-152 Add global auth middleware to API server

## Goal
Apply the `createAuthGuard` middleware to all API routes as an Elysia plugin, exempting only the three public paths: `/api/v1/health`, `/api/v1/auth/login`, and `/api/v1/auth/refresh`.

## Why
Every protected endpoint currently lacks a centralized auth check. Without a global guard, individual route handlers must enforce auth independently, which creates gaps. A single global middleware ensures no endpoint is accidentally left unprotected after future route additions.

## Inputs
- `packages/shared/src/auth/middleware.ts` — `createAuthGuard` factory (from prior task)
- `apps/api/src/server.ts` — `createApiServer()` to modify
- `docs/SECURITY.md` — auth requirements, JWT validation rules
- `docs/ARCHITECTURE.md` — public path exceptions

## Dependencies
- T-151 (all routes mounted in server)

## Expected Outputs
- Updated `apps/api/src/server.ts` — auth guard plugin registered before protected routes
- `apps/api/__tests__/auth-middleware.test.ts` — tests for unauthenticated and authenticated paths

## Deliverables

### 1. Auth guard integration
```typescript
// apps/api/src/server.ts
import { createAuthGuard } from 'packages/shared/src/auth/middleware';

const PUBLIC_PATHS = [
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
];

export function createApiServer(deps: ApiServerDeps): Elysia {
  return new Elysia()
    .use(createAuthGuard({ publicPaths: PUBLIC_PATHS, secret: deps.jwtSecret }))
    // all route mounts follow...
}
```

### 2. Auth guard behavior
- Requests to public paths: pass through regardless of Authorization header
- Requests to protected paths without valid JWT: respond HTTP 401 `{ error: 'Unauthorized' }`
- Requests to protected paths with valid JWT: set `context.user` and pass through
- Guard is registered as Elysia `derive`/`beforeHandle` plugin before any route mount

### 3. Tests
- Unauthenticated request to protected route → 401
- Unauthenticated request to `/api/v1/health` → 200
- Unauthenticated request to `/api/v1/auth/login` → 200 (or route's own response)
- Authenticated request (valid JWT) to protected route → passes through to route handler
- Expired/invalid JWT → 401

## Constraints
- Auth guard must be a reusable Elysia plugin — no inline `beforeHandle` in `createApiServer()`
- `PUBLIC_PATHS` list is defined once in `server.ts` and passed to the guard factory
- Do not modify individual route handlers — guard is applied globally
- JWT secret sourced from `deps.jwtSecret` — never hardcoded
- Tests use a test JWT signed with a known test secret

## Steps
1. Write failing tests (RED):
   - Unauthed request to protected route → 401
   - Unauthed request to public path → not 401
   - Valid JWT request → route handler reached
2. Register `createAuthGuard` as Elysia plugin in `createApiServer()` (GREEN)
3. Define `PUBLIC_PATHS` constant and wire to guard (GREEN)
4. Add `jwtSecret` to `ApiServerDeps` if not present (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- Unauthenticated request to any non-public endpoint returns exactly HTTP 401
- Requests to `/api/v1/health`, `/api/v1/auth/login`, `/api/v1/auth/refresh` bypass auth
- Valid JWT sets `context.user` and route handler executes normally
- `bun run typecheck` passes with updated `ApiServerDeps`

## Validation
```bash
bun test apps/api
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-23
- Files changed: `apps/api/src/server.ts`, `apps/api/__tests__/auth-middleware.test.ts`, `apps/api/__tests__/helpers/auth.ts`
- Tests: 5 new auth middleware tests, 12 existing tests updated with auth headers
- Validation: 1363 pass, 0 fail, typecheck clean

## Outputs
- Global auth guard plugin with PUBLIC_PATHS constant
- Test helper `apps/api/__tests__/helpers/auth.ts`

## Out of Scope
- JWT issuance / login endpoint implementation
- Role-based access control (RBAC)
- Rate limiting
