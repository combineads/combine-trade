# T-079 Auth middleware + login/refresh API

## Goal
Implement an Elysia auth middleware plugin and auth endpoints in `apps/api/src/middleware/auth.ts` and `apps/api/src/routes/auth.ts`:
- `POST /auth/login` — validate credentials, return token pair
- `POST /auth/refresh` — exchange a valid refresh token for a new token pair
- `POST /auth/logout` — invalidate refresh token (server-side blocklist or cookie clear)
- `authPlugin` — Elysia plugin that validates the `Authorization: Bearer <token>` header and attaches `ctx.user` to the request context

## Why
All API endpoints (except health, login, refresh) require authentication. Centralizing auth in a reusable Elysia plugin means routes declare `use(authPlugin)` once and receive a typed `ctx.user` — no ad-hoc token parsing in each route handler. The login/refresh endpoints are the entry point for the entire auth flow.

## Inputs
- T-073: `ApiError`, `UnauthorizedError`, `ok` helpers
- T-078: `signAccessToken`, `signRefreshToken`, `verifyToken`, `hashPassword`, `comparePassword`, `JwtPayload`, `TokenPair`
- `UserRepository` interface (or equivalent user lookup mechanism) from `packages/core/` or `packages/shared/`
- JWT secrets from environment variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)

## Dependencies
- T-073
- T-078

## Expected Outputs
- `apps/api/src/middleware/auth.ts`
  - `authPlugin` — Elysia plugin that:
    - Reads `Authorization: Bearer <token>` header
    - Calls `verifyToken` from T-078
    - On success: derives and attaches `ctx.user: JwtPayload` to request context
    - On failure: throws `UnauthorizedError`
  - Plugin must be composable: routes that need auth do `app.use(authPlugin)`, public routes do not
- `apps/api/src/routes/auth.ts`
  - `POST /auth/login`: body `{ username: string; password: string }` → `TokenPair` (200) or 401
  - `POST /auth/refresh`: body `{ refreshToken: string }` → new `TokenPair` (200) or 401
  - `POST /auth/logout`: clears refresh token (200, no body)
- `apps/api/__tests__/auth.test.ts`
  - In-memory mock of `UserRepository`
  - Tests for login success, wrong password, unknown user
  - Tests for refresh with valid token, expired token, tampered token
  - Tests for `authPlugin`: valid token passes, missing header returns 401, invalid token returns 401

## Deliverables
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/__tests__/auth.test.ts`

## Constraints
- JWT secrets must be read from `process.env.JWT_ACCESS_SECRET` and `process.env.JWT_REFRESH_SECRET` — never hardcoded
- `authPlugin` must not be applied to `/health`, `/auth/login`, `/auth/refresh` routes
- Passwords are never logged — only hashes are stored/compared
- Login endpoint must not reveal whether username or password was wrong — always return generic 401 (`INVALID_CREDENTIALS`)
- Refresh tokens are single-use or bound to a server-side session store (minimal: in-memory map is acceptable for this task)
- All tests use `bun:test` with in-memory mocks and test JWT secrets
- No real DB access in tests

## Steps
1. Write failing tests (RED):
   - `POST /auth/login` with valid credentials → 200 with `{ data: { accessToken, refreshToken } }`
   - `POST /auth/login` with wrong password → 401 with `INVALID_CREDENTIALS`
   - `POST /auth/login` with unknown username → 401 with `INVALID_CREDENTIALS`
   - `POST /auth/login` missing body fields → 422
   - `POST /auth/refresh` with valid refresh token → 200 with new `TokenPair`
   - `POST /auth/refresh` with expired token → 401
   - `POST /auth/refresh` with tampered token → 401
   - `POST /auth/logout` → 200
   - `authPlugin`: request with valid `Authorization: Bearer <token>` → passes, `ctx.user` populated
   - `authPlugin`: request without `Authorization` header → 401
   - `authPlugin`: request with malformed token → 401
   - `authPlugin`: request with expired token → 401
2. Implement `middleware/auth.ts` (GREEN)
3. Implement `routes/auth.ts` (GREEN)
4. Refactor: extract token generation logic into a private helper; add JSDoc

## Acceptance Criteria
- Login returns a valid `TokenPair` for correct credentials
- Login always returns 401 `INVALID_CREDENTIALS` for wrong credentials (no username/password distinction)
- Refresh produces a new `TokenPair` for a valid refresh token
- Tampered or expired refresh tokens return 401
- `authPlugin` populates `ctx.user` for valid tokens
- `authPlugin` returns 401 for missing, invalid, or expired tokens
- Secrets are read from env, never hardcoded
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test apps/api/__tests__/auth.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Refresh token rotation storage in DB (in-memory map acceptable)
- Role-based access control / permission checks per route
- OAuth / third-party SSO
- Two-factor authentication
- Applying `authPlugin` to existing routes T-074 through T-077 (separate task after all routes exist)
