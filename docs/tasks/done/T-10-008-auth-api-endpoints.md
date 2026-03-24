# T-10-008 Implement login, refresh, logout API endpoints

## Goal
Build authentication API endpoints: login (email + password → tokens), refresh (refresh token → new access token), logout (revoke refresh token).

## Why
EP10 M2 — clients need endpoints to authenticate and manage session lifecycle.

## Inputs
- T-10-005 (JWT token service)
- T-10-006 (password hashing)
- T-10-007 (auth middleware — for protected logout endpoint)

## Dependencies
- T-10-005 (JWT token service)
- T-10-006 (password hashing)

## Expected Outputs
- `POST /api/v1/auth/login` → { accessToken, refreshToken }
- `POST /api/v1/auth/refresh` → { accessToken }
- `POST /api/v1/auth/logout` → revoke refresh token

## Deliverables
- `packages/shared/auth/service.ts` (auth service logic)
- `packages/shared/auth/__tests__/service.test.ts`

## Constraints
- Login: validate email + password → issue tokens
- Login failure: 401 with generic "invalid credentials" (no email/password leak)
- Refresh: validate refresh token → issue new access token
- Refresh with revoked token → 401
- Logout: revoke the provided refresh token
- All deps injected (user repo, token service, password hasher)

## Steps
1. Write tests for login/refresh/logout flows
2. Implement AuthService with login/refresh/logout methods
3. Handle edge cases: user not found, wrong password, revoked token

## Acceptance Criteria
- Login with correct credentials → tokens returned
- Login with wrong password → 401
- Login with non-existent user → 401 (same error message)
- Refresh with valid token → new access token
- Refresh with revoked token → 401
- Logout → refresh token revoked

## Validation
```bash
bun test packages/shared/auth/__tests__/service.test.ts
bun run typecheck
```

## Out of Scope
- User registration (single-user system — admin seed only)
- Email verification
- Password reset

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/shared/auth/service.ts` (new), `packages/shared/auth/__tests__/service.test.ts` (new — 13 tests)
- **Approach**: TDD. AuthService class with DI for all deps (user repo, password hasher, token service). Login returns same error for user-not-found and wrong-password (no information leak). Refresh verifies token then issues new access token. Logout extracts jti from refresh token and revokes it. All methods return discriminated union results (ok: true/false).
- **Validation**: 13/13 tests pass, typecheck clean, 1057 total tests.

## Outputs
- `AuthService` class with `login()`, `refresh()`, `logout()` methods
- `AuthServiceDeps` interface for DI
- `AuthUser` interface
- Result types: `LoginResult`, `RefreshResult`, `LogoutResult`
