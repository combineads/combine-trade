# T-112 Implement JWT token service

## Goal
Build a JWT access/refresh token service with issuance, verification, and revocation.

## Why
EP10 M1 — foundation for API authentication. All API endpoints require JWT validation.

## Inputs
- `docs/SECURITY.md` (token specs: access 15min, refresh 7 days)
- `db/schema/users.ts` (users table exists)

## Dependencies
None

## Expected Outputs
- `signAccessToken(userId)` → signed JWT (15min expiry)
- `signRefreshToken(userId)` → signed JWT (7d expiry) + DB storage
- `verifyToken(token)` → decoded payload or throw
- `revokeRefreshToken(tokenId)` → mark as revoked in DB

## Deliverables
- `packages/shared/auth/token.ts`
- `packages/shared/auth/__tests__/token.test.ts`

## Constraints
- Use `jose` library (already in Bun ecosystem) for JWT
- Access token: 15 min expiry, contains userId, iat, exp
- Refresh token: 7 day expiry, stored in DB for revocation
- JWT secret from env var `JWT_SECRET`
- HS256 algorithm
- No plaintext storage of tokens

## Steps
1. Write tests for sign/verify/revoke
2. Implement signAccessToken and signRefreshToken
3. Implement verifyToken with expiry check
4. Implement revokeRefreshToken (deps-injected DB call)

## Acceptance Criteria
- Access token verifies correctly within 15 min
- Expired tokens rejected
- Revoked refresh tokens rejected
- Invalid signatures rejected

## Validation
```bash
bun test packages/shared/auth/__tests__/token.test.ts
bun run typecheck
```

## Out of Scope
- Password hashing (T-113)
- HTTP middleware
- Client-side token storage

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/shared/auth/token.ts` (new), `packages/shared/auth/__tests__/token.test.ts` (new — 11 tests)
- **Approach**: TDD. Uses `jose` library for JWT sign/verify. HS256 algorithm. Access tokens 15min, refresh tokens 7d with DB-backed revocation.
- **Validation**: 11/11 tests pass, typecheck clean.

## Outputs
- `signAccessToken(userId, deps)` → JWT string (15min)
- `signRefreshToken(userId, deps)` → JWT string (7d) + DB save
- `verifyToken(token, deps)` → `TokenPayload` or throw
- `TokenDeps` interface for DI
