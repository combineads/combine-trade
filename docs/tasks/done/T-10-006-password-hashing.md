# T-10-006 Implement password hashing with Argon2id

## Goal
Build a password hashing service using Argon2id per SECURITY.md specification.

## Why
EP10 M1 — secure password storage for user authentication.

## Inputs
- `docs/SECURITY.md` (Argon2id: memory 64MB, iterations 3, parallelism 4)

## Dependencies
None

## Expected Outputs
- `hashPassword(plaintext)` → hashed string
- `verifyPassword(plaintext, hash)` → boolean

## Deliverables
- `packages/shared/auth/password.ts`
- `packages/shared/auth/__tests__/password.test.ts`

## Constraints
- Argon2id with memory=65536 (64MB), timeCost=3, parallelism=4
- Use Bun built-in `Bun.password.hash` (uses argon2id internally)
- Never log or return plaintext passwords
- Timing-safe comparison

## Steps
1. Write tests for hash/verify
2. Implement using Bun.password API
3. Test: correct password verifies, wrong password fails
4. Test: different hashes for same password (salted)

## Acceptance Criteria
- hashPassword produces different output each time (salted)
- verifyPassword returns true for correct password
- verifyPassword returns false for wrong password
- Argon2id algorithm used

## Validation
```bash
bun test packages/shared/auth/__tests__/password.test.ts
bun run typecheck
```

## Out of Scope
- User CRUD
- JWT tokens
- Login flow

## Implementation Notes
- **Date**: 2026-03-22
- **Discovery**: Already implemented in `packages/shared/auth/password.ts` with `hashPassword()` and `comparePassword()` using `Bun.password.hash/verify` (Argon2id). 4 existing tests passing.
- **Note**: Function is named `comparePassword` (not `verifyPassword` as spec'd) — functionally identical.
- **Validation**: 4/4 tests pass, typecheck clean.

## Outputs
- `hashPassword(plain: string): Promise<string>` — Argon2id hashing
- `comparePassword(plain: string, hash: string): Promise<boolean>` — verification
