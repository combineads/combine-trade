# T-115 Implement login, refresh, logout API endpoints

## Goal
Build authentication API endpoints: login (email + password → tokens), refresh (refresh token → new access token), logout (revoke refresh token).

## Why
EP10 M2 — clients need endpoints to authenticate and manage session lifecycle.

## Inputs
- T-112 (JWT token service)
- T-113 (password hashing)
- T-114 (auth middleware — for protected logout endpoint)

## Dependencies
- T-112 (JWT token service)
- T-113 (password hashing)

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
