# T-078 Auth foundation (JWT + password hashing)

## Goal
Create a pure auth module in `packages/shared/auth/` providing JWT sign/verify and password hash/compare utilities, with no framework dependencies.

## Why
Auth logic (JWT generation, verification, password hashing) is pure cryptographic computation with no IO. Placing it in `packages/shared/auth/` makes it usable by both `apps/api/` and any future workers without importing Elysia or any server framework. Keeping it pure also makes it trivially testable without spinning up any server.

## Inputs
- `jose` library for JWT (RS256 or HS256)
- Bun's built-in `Bun.password` for Argon2id password hashing (available since Bun 1.x)
- Auth types: `JwtPayload`, `TokenPair`, `HashedPassword`

## Dependencies
None.

## Expected Outputs
- `packages/shared/auth/types.ts`
  - `JwtPayload`: `{ sub: string; role: string; iat?: number; exp?: number }`
  - `TokenPair`: `{ accessToken: string; refreshToken: string }`
- `packages/shared/auth/jwt.ts`
  - `signAccessToken(payload: JwtPayload, secret: string, expiresIn?: string): Promise<string>`
  - `signRefreshToken(payload: JwtPayload, secret: string, expiresIn?: string): Promise<string>`
  - `verifyToken(token: string, secret: string): Promise<JwtPayload>`
  - `decodeToken(token: string): JwtPayload | null` — decode without verification (for expired token inspection)
  - Throws `UnauthorizedError`-compatible object `{ status: 401, code: "INVALID_TOKEN" }` on verify failure (plain object, no Elysia import)
- `packages/shared/auth/password.ts`
  - `hashPassword(plain: string): Promise<string>` — Argon2id via `Bun.password`
  - `comparePassword(plain: string, hash: string): Promise<boolean>`
- `packages/shared/auth/__tests__/jwt.test.ts`
- `packages/shared/auth/__tests__/password.test.ts`

## Deliverables
- `packages/shared/auth/types.ts`
- `packages/shared/auth/jwt.ts`
- `packages/shared/auth/password.ts`
- `packages/shared/auth/__tests__/jwt.test.ts`
- `packages/shared/auth/__tests__/password.test.ts`

## Constraints
- `packages/shared/auth/` must not import Elysia, CCXT, Drizzle, or Bun-specific server APIs
- `Bun.password` is allowed (runtime dependency, not framework)
- JWT algorithm: HS256 with a shared secret (no RSA key pair in this task)
- Access token default expiry: `"15m"`, refresh token default expiry: `"7d"`
- `verifyToken` must throw (not return null) on invalid/expired token — throw a plain `{ status: 401, code: "INVALID_TOKEN", message: string }` object
- All tests use `bun:test`

## Steps
1. Write failing tests (RED):
   - JWT tests:
     - `signAccessToken` returns a non-empty JWT string
     - `verifyToken` returns correct payload for a valid token
     - `verifyToken` throws `{ code: "INVALID_TOKEN" }` for wrong secret
     - `verifyToken` throws `{ code: "INVALID_TOKEN" }` for expired token
     - `decodeToken` returns payload without verifying (even for wrong-secret token)
     - `decodeToken` returns null for malformed string
     - `signRefreshToken` generates token distinct from access token (different `exp`)
   - Password tests:
     - `hashPassword` returns a string that is not the plain password
     - `comparePassword` returns true for correct plain password
     - `comparePassword` returns false for wrong password
     - `hashPassword` called twice with same input produces different hashes (salted)
2. Implement `types.ts` (GREEN)
3. Implement `jwt.ts` (GREEN)
4. Implement `password.ts` (GREEN)
5. Refactor: add JSDoc to all exported functions

## Acceptance Criteria
- JWT sign/verify round-trip works correctly
- Wrong secret causes `verifyToken` to throw with `code: "INVALID_TOKEN"`
- Expired token causes `verifyToken` to throw with `code: "INVALID_TOKEN"`
- `decodeToken` is safe (never throws, returns null for garbage input)
- Password hashing is salted (two hashes of same plaintext differ)
- `comparePassword` correctly distinguishes correct vs wrong passwords
- No Elysia or framework imports anywhere in `packages/shared/auth/`
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/auth/__tests__/jwt.test.ts
bun test packages/shared/auth/__tests__/password.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- RSA/ECDSA key pair rotation
- Refresh token blacklisting / revocation storage
- User repository / DB access
- Elysia middleware (T-079)
- Role-based access control beyond a simple `role` claim
