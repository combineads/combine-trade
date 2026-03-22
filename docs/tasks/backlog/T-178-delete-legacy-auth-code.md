# T-178 Delete legacy auth code

## Goal
Remove all legacy JWT/auth source files from `packages/shared/auth/` and `apps/api/src/`, then clean up every import that referenced them. After this task, only `encryption.ts` and `password.ts` remain in `packages/shared/auth/`.

## Why
After T-177 the legacy files are dead code: `jwt.ts`, `token.ts`, `middleware.ts`, and `service.ts` are no longer imported by any live path. Leaving them in place creates confusion about which auth implementation is active, wastes reader attention, and risks future developers accidentally using the wrong module. The legacy auth route (`apps/api/src/routes/auth.ts`) is also superseded by better-auth's built-in endpoints. The dead `apps/api/src/middleware/auth.ts` (`authPlugin`) was never wired into the server.

## Inputs
- `packages/shared/auth/jwt.ts` — to delete
- `packages/shared/auth/token.ts` — to delete
- `packages/shared/auth/middleware.ts` — to delete
- `packages/shared/auth/service.ts` — to delete
- `packages/shared/auth/types.ts` — review: keep only if still referenced after deletion; otherwise delete
- `packages/shared/auth/__tests__/jwt.test.ts` — to delete (tests for deleted module)
- `packages/shared/auth/__tests__/token.test.ts` — to delete
- `packages/shared/auth/__tests__/middleware.test.ts` — to delete
- `packages/shared/auth/__tests__/service.test.ts` — to delete
- `apps/api/src/middleware/auth.ts` — to delete (dead code; `authPlugin` never used in server)
- `apps/api/src/routes/auth.ts` — to delete (replaced by better-auth endpoints)
- `apps/api/src/server.ts` — remove the import of `authRoutes` and its `.use()` call (T-177 already removed authGuardPlugin)

## Dependencies
- T-177 (server must be switched to better-auth before legacy routes/middleware can be safely deleted)

## Expected Outputs
- The following files no longer exist:
  - `packages/shared/auth/jwt.ts`
  - `packages/shared/auth/token.ts`
  - `packages/shared/auth/middleware.ts`
  - `packages/shared/auth/service.ts`
  - `packages/shared/auth/types.ts` (if no remaining consumers)
  - `packages/shared/auth/__tests__/jwt.test.ts`
  - `packages/shared/auth/__tests__/token.test.ts`
  - `packages/shared/auth/__tests__/middleware.test.ts`
  - `packages/shared/auth/__tests__/service.test.ts`
  - `apps/api/src/middleware/auth.ts`
  - `apps/api/src/routes/auth.ts`
- `apps/api/src/server.ts` — `authRoutes` import and `.use(authRoutes(...))` call removed
- `bun run typecheck` passes with zero errors after all deletions

## Deliverables
- File deletions as listed above
- Updated `apps/api/src/server.ts` with `authRoutes` import and `.use()` call removed
- Removal of `ApiServerDeps` fields that only existed for the old auth route (any remaining after T-177 cleanup)

## Constraints
- `packages/shared/auth/encryption.ts` must NOT be touched
- `packages/shared/auth/password.ts` must NOT be touched
- `packages/shared/auth/__tests__/encryption.test.ts` must NOT be touched
- `packages/shared/auth/__tests__/password.test.ts` must NOT be touched
- Do not delete `packages/shared/auth/better-auth.ts` (created in T-176)
- After deletion, `bun run typecheck` must pass — no dangling imports allowed
- If `types.ts` exports types still used elsewhere (e.g., `JwtPayload`, `TokenPair`), migrate those consumers to better-auth types or inline them before deleting `types.ts`

## Steps
1. Write failing test: assert that the legacy files do NOT exist at their paths (RED — they still exist)
2. Audit all imports of the files to delete: use grep/typecheck to find any remaining references outside the deleted files themselves
3. Fix any remaining import references found in step 2 (migrate to better-auth types or remove)
4. Delete all listed files
5. Remove `authRoutes` import and `.use(authRoutes(...))` from `apps/api/src/server.ts`
6. Run `bun run typecheck` — must pass (GREEN)
7. Confirm the "files do not exist" test now passes
8. Run full test suite — only deleted tests should be gone; all remaining tests pass (REFACTOR)

## Acceptance Criteria
- `ls packages/shared/auth/` shows only: `better-auth.ts`, `encryption.ts`, `password.ts`, `__tests__/` (with only `encryption.test.ts`, `password.test.ts`)
- `apps/api/src/middleware/auth.ts` does not exist
- `apps/api/src/routes/auth.ts` does not exist
- `apps/api/src/server.ts` has no import of `authRoutes` or any legacy auth module
- `bun run typecheck` passes
- `bun test` passes (no failures from removed tests — they are simply gone)

## Validation
```bash
bun run typecheck
bun test

# File existence checks
ls packages/shared/auth/
# Expected: better-auth.ts  encryption.ts  password.ts  __tests__/

test -f packages/shared/auth/jwt.ts && echo "FAIL: jwt.ts still exists" || echo "OK: jwt.ts gone"
test -f packages/shared/auth/token.ts && echo "FAIL: token.ts still exists" || echo "OK: token.ts gone"
test -f apps/api/src/routes/auth.ts && echo "FAIL: auth route still exists" || echo "OK: auth route gone"
test -f apps/api/src/middleware/auth.ts && echo "FAIL: auth middleware still exists" || echo "OK: auth middleware gone"
```

## Out of Scope
- Updating `TECH_STACK.md` or `SECURITY.md` documentation — T-183
- Marking `docs/exec-plans/10-auth.md` as deprecated — T-183
- Changing any business route logic — T-181
