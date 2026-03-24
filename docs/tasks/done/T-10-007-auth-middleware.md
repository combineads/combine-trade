# T-10-007 Implement Elysia authentication middleware

## Goal
Build an Elysia middleware that validates JWT tokens on all API requests, with exception routes for public endpoints.

## Why
EP10 M2 — all API endpoints must be protected. Without middleware, any network request can access trading APIs.

## Inputs
- T-10-005 (JWT token service)
- `apps/api/` (existing Elysia routes)

## Dependencies
- T-10-005 (JWT token service)

## Expected Outputs
- Elysia `beforeHandle` hook that validates Bearer token
- Public route exceptions: /api/v1/auth/login, /api/v1/auth/refresh, /api/v1/health
- 401 response for missing/invalid/expired tokens

## Deliverables
- `packages/shared/auth/middleware.ts`
- `packages/shared/auth/__tests__/middleware.test.ts`

## Constraints
- Extract token from `Authorization: Bearer <token>` header
- Public routes bypass validation
- Invalid token → 401 with JSON error body
- Expired token → 401 with "token_expired" error code
- Decoded user ID attached to request context

## Steps
1. Write tests for middleware behavior (valid token, no token, expired, public routes)
2. Implement createAuthMiddleware() factory
3. Return middleware function compatible with Elysia beforeHandle
4. Attach userId to context on success

## Acceptance Criteria
- Protected routes without token → 401
- Valid token → request proceeds with userId in context
- Expired token → 401 with token_expired code
- Public routes → no auth required
- Invalid Bearer format → 401

## Validation
```bash
bun test packages/shared/auth/__tests__/middleware.test.ts
bun run typecheck
```

## Out of Scope
- Login/refresh/logout endpoints (T-10-008)
- Rate limiting
- RBAC

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/shared/auth/middleware.ts` (new), `packages/shared/auth/__tests__/middleware.test.ts` (new — 9 tests)
- **Approach**: TDD. Created `createAuthGuard()` factory function returning a pure guard function (path, authorization) → AuthGuardResult. Framework-agnostic — not coupled to Elysia directly. Public path check via `startsWith`. Bearer token parsing. Token verification delegated to injected `verifyToken` dep. Expired token detection via jose error message pattern matching.
- **Validation**: 9/9 tests pass, typecheck clean, 1028 total tests.

## Outputs
- `createAuthGuard(deps)` factory → returns `(path, authorization) → Promise<AuthGuardResult>`
- `AuthGuardDeps` interface: `verifyToken`, `publicPaths`
- `AuthGuardResult` interface: `allowed`, `userId?`, `error?`
