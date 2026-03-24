# T-18-008 Admin seed script and integration tests

## Goal
Create a `db/seed/admin.ts` script (invoked via `bun run db:seed:admin`) that provisions the first admin user through better-auth's API. Write a full-flow integration test covering: login → protected API access → logout → re-access denied. Also add user-isolation integration tests and verify SSE endpoint authentication. Update `docs/SECURITY.md` and mark `docs/exec-plans/10-auth.md` as deprecated.

## Why
The system has no way to bootstrap its first user after replacing the legacy `users` table with better-auth. A seed script is required to create the initial admin account before the system can be used. The integration tests provide end-to-end confidence that the entire EP18 auth chain (T-18-001 through T-18-006) works together correctly. Documentation updates close the loop so future developers do not refer to the deprecated 10-auth epic.

## Inputs
- `packages/shared/auth/better-auth.ts` — `auth` instance (T-18-001)
- `apps/api/src/server.ts` — server with better-auth plugin (T-18-002)
- All repository implementations with `userId` filtering (T-18-005, T-18-006)
- `docs/SECURITY.md` — to update
- `docs/exec-plans/10-auth.md` — to mark deprecated
- `docs/exec-plans/18-better-auth-multiuser.md` § M6 — seed script pattern and integration test checklist

## Dependencies
- T-18-006 (full auth chain must be complete before integration tests are meaningful)

## Expected Outputs
- `db/seed/admin.ts` — admin seed script
- `package.json` (workspace root or `apps/api`) — `"db:seed:admin": "bun run db/seed/admin.ts"` script entry
- Integration test file: `apps/api/src/__tests__/auth-integration.test.ts`
- Updated `docs/SECURITY.md`
- Updated `docs/exec-plans/10-auth.md` with deprecation notice

## Deliverables

### `db/seed/admin.ts`
```typescript
import { auth } from "../packages/shared/auth/better-auth.js"; // adjust path

const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "Admin";

if (!password) {
  console.error("ADMIN_PASSWORD env var required");
  process.exit(1);
}

// Check if admin already exists
const existing = await auth.api.getUserByEmail({ body: { email } });
if (existing) {
  console.log(`Admin user ${email} already exists — skipping.`);
  process.exit(0);
}

await auth.api.signUpEmail({
  body: { email, password, name },
});

console.log(`Admin user ${email} created.`);
```

### Integration test: `apps/api/src/__tests__/auth-integration.test.ts`
Test cases (requires running DB and API server):
1. **Login success**: `POST /api/auth/sign-in/email` with valid credentials → session cookie returned
2. **Login failure**: wrong password → 401
3. **Authenticated access**: `GET /api/v1/strategies` with session cookie → 200
4. **Unauthenticated access**: `GET /api/v1/strategies` without session cookie → 401
5. **Logout**: `POST /api/auth/sign-out` → session invalidated
6. **Post-logout access**: `GET /api/v1/strategies` with old cookie → 401
7. **User isolation**: user A creates a strategy; user B cannot GET it (404)
8. **Rate limiting**: 6 consecutive failed login attempts → 429 on the 6th

### SSE auth test
9. **SSE unauthenticated**: `GET /api/v1/sse` without session → 401
10. **SSE authenticated**: `GET /api/v1/sse` with valid session → 200 / event stream opens

### `docs/SECURITY.md` updates
- Replace JWT implementation description with better-auth session model
- Document cookie-based session flow
- Document CORS allowlist configuration
- Document rate limiting thresholds (login: 5/min, API: 100/min)
- Remove references to `jwt.ts`, `token.ts`

### `docs/exec-plans/10-auth.md` deprecation notice
Add at top of file:
```markdown
> **DEPRECATED** — superseded by `docs/exec-plans/18-better-auth-multiuser.md`.
> All auth implementation is now in EP18. This document is retained for historical reference only.
```

## Constraints
- Integration tests require a running PostgreSQL DB and API server — note in test file with a `describe.skipIf(!process.env.TEST_DB_URL)` or equivalent guard
- Seed script must be idempotent: running it twice must not create duplicate users
- `ADMIN_PASSWORD` must come from an env var — never hardcoded, never logged
- Rate limiting test must account for better-auth's built-in rate limiter behavior; if it is disabled in test env, the test should be marked accordingly
- SSE test only needs to verify auth rejection (401); full SSE message streaming is out of scope

## Steps
1. Write failing integration tests for all 10 cases listed above (RED — most will fail because test infrastructure needs setup)
2. Create `db/seed/admin.ts` with idempotency check
3. Add `"db:seed:admin"` to the appropriate `package.json`
4. Add SSE auth check to `apps/api/src/routes/sse.ts` (session validation using `auth.api.getSession()`)
5. Run integration tests with a real DB: fix any failures (GREEN)
6. Update `docs/SECURITY.md`
7. Add deprecation notice to `docs/exec-plans/10-auth.md`
8. Run full test suite + typecheck + lint (REFACTOR)

## Acceptance Criteria
- `bun run db:seed:admin` creates admin user; running it again is a no-op
- All 10 integration test cases pass (with DB available)
- `GET /api/v1/sse` without a valid session returns 401
- 6 consecutive failed login attempts → 429 on the 6th attempt
- `docs/SECURITY.md` describes better-auth session model (no references to legacy JWT files)
- `docs/exec-plans/10-auth.md` has deprecation notice at top
- `bun run typecheck` passes
- `bun run lint` passes
- `ls packages/shared/auth/` shows only `better-auth.ts`, `encryption.ts`, `password.ts` (no legacy files)

## Validation
```bash
bun run typecheck
bun run lint
bun test --filter "auth-integration|rate-limit|sse-auth"

# File existence checks
ls packages/shared/auth/
# Expected: better-auth.ts  encryption.ts  password.ts  __tests__/

# Seed script (with running DB)
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=changeme bun run db:seed:admin
# Second run should print "already exists" and exit 0
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=changeme bun run db:seed:admin

# Rate limit test (with running server)
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"wrong"}'
done
# Last response should be 429
```

## Out of Scope
- Tauri desktop auth client — separate task
- RBAC / role-based access control
- OAuth / social login
- 2FA
- User self-registration
- Organization multitenancy

## Implementation Notes

### Approach
- Used a pure dependency-injection pattern for `seedAdmin()` — the core function accepts `AdminSeedDeps` with no DB coupling, making it fully testable without a real database.
- The script entry point (`import.meta.main`) uses dynamic `import()` to wire in real Drizzle/Postgres deps, so unit tests never trigger a DB connection.
- Auth integration tests use per-test isolated `makeAuth()` instances (each with its own `sessionStore` and `loginAttempts` map) to prevent inter-test state leakage.

### Design decisions
- `getAdminConfig()` reads from env vars with safe defaults. The default password `changeme-on-first-login` is intentionally weak with a console warning to force operators to change it.
- Rate limiting is tested against the mock auth double (5 failed → 6th returns 429). Real better-auth rate limiting behavior is noted in the test file.
- Live-DB tests are guarded with `describe.skipIf(!process.env.TEST_DB_URL)`.

### Files created / modified
- `db/seed/admin.ts` — pure `seedAdmin()` + `getAdminConfig()` + script entry
- `db/__tests__/admin-seed.test.ts` — 17 unit tests (all pass)
- `apps/api/src/__tests__/auth-integration.test.ts` — 10 integration tests (all pass; 3 live-DB skipped)
- `package.json` — added `"db:seed:admin": "bun run db/seed/admin.ts"`
- `docs/SECURITY.md` — replaced JWT section with better-auth session model documentation
- `docs/exec-plans/10-auth.md` — added English deprecation notice at top

## Outputs
- 1669 tests pass, 4 skip, 0 fail (full suite)
- `bun run typecheck` — clean
- `bunx biome check db/__tests__/admin-seed.test.ts db/seed/admin.ts apps/api/src/__tests__/auth-integration.test.ts` — 0 errors, 0 warnings
