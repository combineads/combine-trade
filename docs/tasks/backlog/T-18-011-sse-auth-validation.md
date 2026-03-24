# T-18-011 SSE auth validation

## Goal
Add better-auth session validation to the SSE endpoint (`/api/v1/sse`) so that unauthenticated connections are rejected with 401, expired tokens during an active stream cause connection closure with a retry hint, and events are filtered to only those belonging to the authenticated user's strategies.

## Why
EP18 M6 — the SSE endpoint currently streams real-time pipeline events without any authentication check, allowing any unauthenticated client to receive decision, alert, and order events for all users. This violates the multi-user data isolation invariant introduced in EP18 M3–M4.

## Inputs
- `apps/api/src/routes/sse.ts` (or equivalent) — current SSE route registered in T-08-006
- `packages/shared/auth/better-auth.ts` — `auth` instance with `auth.api.getSession({ headers })` (T-18-001)
- `apps/api/src/server.ts` — better-auth Elysia plugin applied (T-18-002)
- `db/schema/strategies.ts` — `user_id` column added (T-18-004); strategies scoped by user
- EP18 M6 spec: SSE session validation, 401 on invalid session, connection closure on expiry, user-scoped filtering

## Dependencies
- T-18-001 (better-auth setup — `auth.api.getSession` available)
- T-18-002 (replace server auth middleware — better-auth plugin on server)
- T-08-006 (api-wiring-sse — SSE route exists and is the target of this change)

## Expected Outputs
- Updated SSE route handler: validate better-auth session from `Authorization: Bearer <token>` header or `combine-trade.session_token` cookie before upgrading to SSE stream
- Invalid / missing session → HTTP 401 response (connection never upgraded)
- Session validation extracted into reusable `requireSession(request: Request): Promise<Session>` helper in `apps/api/src/lib/auth-helpers.ts`
- Token expiry detected during active stream: close the SSE connection and send a final `event: auth_expired\ndata: {"retryAfter":0}\n\n` frame before closing
- User-scoped event filtering: SSE handler only forwards events where `event.strategyId` belongs to the authenticated user (query `strategies` table with `user_id` filter)
- Periodic session re-validation every 60 seconds on active connections (configurable interval)

## Deliverables
- `apps/api/src/routes/sse.ts` (modified — add session validation and user-scoped filtering)
- `apps/api/src/lib/auth-helpers.ts` (new — `requireSession` helper)
- `apps/api/src/__tests__/sse-auth.test.ts` (new)

## Constraints
- Session check must happen before any SSE upgrade (before writing `Content-Type: text/event-stream`)
- Use `auth.api.getSession({ headers: request.headers })` — do not re-implement JWT parsing
- Bearer token takes precedence over cookie if both are present
- User-scoped filtering: load the user's strategy IDs once at connection time; re-load on periodic re-validation
- Periodic re-validation: if session is no longer valid, close the stream gracefully (send `auth_expired` event first)
- Re-validation interval: 60 seconds default, configurable via `SSE_AUTH_REVALIDATION_INTERVAL_S` env var
- Must not break existing SSE event format for authenticated clients
- No direct Drizzle calls inside the SSE route — use the strategy repository (injected dep)
- Elysia route handler must remain within the `apps/api` package

## Steps
1. Write failing tests in `apps/api/src/__tests__/sse-auth.test.ts` (RED):

   **Test A — No session header → 401**
   - Request to `/api/v1/sse` with no auth → response status 401, no SSE stream opened

   **Test B — Invalid bearer token → 401**
   - Request with `Authorization: Bearer invalid` → `auth.api.getSession` returns null → 401

   **Test C — Valid bearer token → SSE connection opened**
   - Mock `auth.api.getSession` returning a valid session → response status 200 with `Content-Type: text/event-stream`

   **Test D — Valid cookie session → SSE connection opened**
   - Mock session from cookie → 200 + text/event-stream

   **Test E — Event for authenticated user's strategy is forwarded**
   - Session userId = "user-1"; strategy "strat-a" belongs to "user-1"; event for "strat-a" → forwarded to stream

   **Test F — Event for another user's strategy is filtered out**
   - Session userId = "user-1"; event for "strat-b" (belongs to "user-2") → NOT forwarded

   **Test G — Periodic re-validation: expired session closes stream**
   - Active connection; advance fake timer past re-validation interval; mock `getSession` returns null → `auth_expired` event sent, connection closed

   **Test H — requireSession helper extracts Bearer token**
   - `requireSession` with `Authorization: Bearer tok` header → calls `getSession` with that header

2. Implement `apps/api/src/lib/auth-helpers.ts` (GREEN)
3. Modify `apps/api/src/routes/sse.ts` to add session gate, user-scoped filter, periodic re-validation (GREEN)
4. Refactor: extract strategy-ID-set reload into a named function; add JSDoc to `requireSession`

## Acceptance Criteria
- All 8 tests pass
- Unauthenticated requests receive 401 before SSE upgrade
- Authenticated requests receive `Content-Type: text/event-stream`
- Events belonging to other users' strategies are not emitted to the stream
- Expired / revoked sessions during active streams result in `auth_expired` event followed by connection close
- `requireSession` usable by other route handlers (exported from `auth-helpers.ts`)
- Zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test --filter "sse-auth" && bun run typecheck
```

## Out of Scope
- WebSocket authentication (separate transport)
- Per-event-type permission checks (all authenticated users have access to their own events)
- SSE reconnection handling on the client side
- Rate limiting on SSE connections (separate concern)
- Migrating SSE to a different transport protocol
