# T-181 Route session extraction

## Goal
Extract `userId` from the better-auth session in every protected API route handler and thread it through to the corresponding repository call. When a route receives a request with no valid session (should be impossible after T-177's middleware, but treated as a defensive check), it must return 401. When a repository method returns `null` for an ID that belongs to a different user, the route must return 404.

## Why
T-177 enforces authentication at the middleware layer (reject if no session), and T-180 adds `userId` filtering to repositories. This task is the bridge: routes must read the authenticated user's id from the better-auth session and pass it into every repository call. Without this, the `userId` parameter added in T-180 would be unused, and data isolation would be broken.

## Inputs
- `apps/api/src/routes/strategies.ts` — needs `userId` extracted and passed to all repo calls
- `apps/api/src/routes/orders.ts` — same
- `apps/api/src/routes/kill-switch.ts` — same
- `apps/api/src/routes/paper.ts` — check if it uses any user-scoped repositories
- `apps/api/src/routes/backtest.ts` — check if it uses strategy repository
- `packages/shared/auth/better-auth.ts` — `auth` instance with `auth.api.getSession()` (output of T-176)
- `docs/exec-plans/18-better-auth-multiuser.md` § M4 — session extraction pattern

## Dependencies
- T-177 (better-auth plugin must be in the server before session extraction can work)
- T-180 (repository methods must accept `userId` before routes can pass it)

## Expected Outputs
- Updated route files: `strategies.ts`, `orders.ts`, `kill-switch.ts`, and any others that call user-scoped repositories
- Session extraction utility (inline or shared helper) using `auth.api.getSession({ headers: request.headers })`
- Integration tests: user A's resources are not accessible with user B's session token

## Deliverables

### Session extraction pattern (used in each route handler)
```typescript
import { auth } from "../../../../packages/shared/auth/better-auth.js";
import { UnauthorizedError, NotFoundError } from "../lib/errors.js";

// Inside a route handler:
const session = await auth.api.getSession({ headers: request.headers });
if (!session) throw new UnauthorizedError("No active session");
const userId = session.user.id;
```

### Updated `strategyRoutes` example
```typescript
.get("/", async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new UnauthorizedError();
  const strategies = await deps.strategyRepository.findAll(session.user.id);
  return ok(strategies);
})
.get("/:id", async ({ request, params }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new UnauthorizedError();
  const strategy = await deps.strategyRepository.findById(params.id, session.user.id);
  if (!strategy) throw new NotFoundError(`Strategy ${params.id} not found`);
  return ok(strategy);
})
```

### Routes to update
- `apps/api/src/routes/strategies.ts` — all handlers (GET /, GET /:id, POST /, PUT /:id, PUT /:id/mode, DELETE /:id)
- `apps/api/src/routes/orders.ts` — all handlers
- `apps/api/src/routes/kill-switch.ts` — activate, deactivate, getActiveStates, getAuditEvents
- `apps/api/src/routes/backtest.ts` — any handler that calls `strategyRepository`
- `apps/api/src/routes/paper.ts` — any handler that calls user-scoped repositories

### Routes explicitly NOT changed
- `apps/api/src/routes/health.ts` — public route
- `apps/api/src/routes/candles.ts` — not user-scoped
- `apps/api/src/routes/events.ts` — not user-scoped
- `apps/api/src/routes/alerts.ts` — check; if not user-scoped, leave as-is

## Constraints
- Session extraction must use `auth.api.getSession()` — do NOT re-implement token parsing
- Cross-user access must produce 404, not 403 (convert `null` from repository to `NotFoundError`)
- The `UnauthorizedError` check after `getSession()` is a defensive guard — the better-auth middleware in T-177 should have already rejected unauthenticated requests before reaching the handler
- Running DB is required for integration tests but NOT for unit tests using mocked repositories and sessions
- Do not move session extraction to a shared middleware decorator in this task — that is a future refactor

## Steps
1. Write failing integration test: user A logs in, creates a strategy; user B logs in, attempts to GET that strategy by id — expects 404 (RED)
2. Update `strategies.ts` routes — extract session, pass `userId` to all repository calls (GREEN)
3. Update `orders.ts`, `kill-switch.ts`, `backtest.ts`, `paper.ts` routes
4. Run `bun run typecheck` — zero errors
5. Add unit tests with mocked sessions and repositories (REFACTOR)
6. Run full test suite

## Acceptance Criteria
- `GET /api/v1/strategies` with user A's session returns only user A's strategies
- `GET /api/v1/strategies/:id` with user B's session for user A's strategy returns 404
- `POST /api/v1/strategies` creates a strategy owned by the authenticated user
- Kill switch activation does not affect a different user's strategies
- `bun run typecheck` passes
- All unit tests pass (with mocked dependencies)
- Integration test: cross-user 404 behavior confirmed (requires running DB)

## Validation
```bash
bun run typecheck
bun test --filter "route|user-isolation|strategy-auth|kill-switch-auth"
# With running server + DB (two users needed — use T-183 seed script):
# Sign in as user A, create strategy, get ID
# Sign in as user B, attempt GET /api/v1/strategies/:id
# Expect: 404
```

## Out of Scope
- SSE endpoint authentication — T-183
- Client-side session management — T-182
- Rate limiting enforcement — T-183
- Session extraction helper refactoring into a decorator — future task
