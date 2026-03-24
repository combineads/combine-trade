# T-18-011 SSE auth validation

## Goal
Add session authentication and user-scoped event filtering to the `/api/v1/stream` SSE endpoint. The endpoint must reject unauthenticated connections (401), filter events to only the authenticated user's strategies, and send an `auth_expired` event followed by stream closure when a periodic re-validation detects a dead session.

## Why
The SSE stream endpoint was left unauthenticated in the initial implementation. Any unauthenticated client could connect and receive all events broadcast on the bus, including decision and order events belonging to other users. This task closes that gap as the final piece of EP18 auth coverage.

## Inputs
- `apps/api/src/routes/sse.ts` — SSE route (unauthenticated)
- `apps/api/src/server.ts` — `AuthLike` interface, server wiring
- `packages/core/strategy/repository.ts` — `StrategyRepository.findActive(userId)`

## Dependencies
- T-18-002 (better-auth plugin in server)
- T-18-005 (repository user isolation)
- T-18-006 (route session extraction pattern)

## Deliverables

### `apps/api/src/lib/auth-helpers.ts` (new)
Exports `requireSession(request, auth)` — thin wrapper around `auth.api.getSession({ headers: request.headers })`. Passes all request headers to better-auth so Bearer and cookie resolution happens inside better-auth's own logic.

### `apps/api/src/routes/sse.ts` (modified)
- `SseRouteDeps` extended with `auth: AuthLike`, `strategyRepository: StrategyRepository`, and optional `revalidateIntervalMs` (default 60 000 ms) and `triggerRevalidate` test hook.
- Route handler calls `requireSession` before creating the stream; returns 401 JSON response on failure.
- `shouldForwardEvent(event, userStrategyIds)` — filters events with a `strategyId` field to only user-owned strategies; all other events pass through.
- Periodic re-validation via `setInterval(revalidate, revalidateIntervalMs)`. On session expiry: sends `auth_expired` event, stops timers, unsubscribes, closes the stream.
- `triggerRevalidate` hook written into `deps` after stream starts so tests can force an immediate re-validation cycle.

### `apps/api/__tests__/sse-auth.test.ts` (new)
14 tests covering:
- `requireSession`: valid Bearer, no auth, null session, Bearer > cookie precedence, cookie fallback
- Connection rejection: no session, empty Bearer, null session, valid Bearer, cookie
- Event filtering: user's strategy forwarded, other user's strategy filtered, non-strategy events always forwarded
- `auth_expired` event on re-validation failure

### `apps/api/__tests__/sse.test.ts` (updated)
Updated existing 4 tests to pass `auth` and `strategyRepository` in deps (now required). Added 1 new test confirming 401 without auth.

### `apps/api/src/server.ts` (updated)
`sseRoutes` call now passes `auth` and `strategyRepository` from server deps.

## Acceptance Criteria
- `GET /api/v1/stream` without credentials returns 401
- `GET /api/v1/stream` with valid Bearer token returns 200 text/event-stream
- Events with `strategyId` belonging to another user are not forwarded
- Non-strategy events (orders, alerts, heartbeats) are always forwarded
- `auth_expired` SSE event is sent when re-validation detects no session
- `bun run typecheck` passes
- All tests pass

## Validation
```bash
bun test --filter "sse-auth"   # 14 pass
bun test --filter "sse"        # 30 pass (including updated sse.test.ts)
bun test                       # full suite, 0 fail
bun run typecheck              # 0 errors
```

## Implementation Notes

### requireSession design
`requireSession` is a thin one-liner: it passes the full `request.headers` to `auth.api.getSession()`. No manual Bearer parsing — better-auth handles resolution order (Bearer > cookie) internally.

### Event filtering
`shouldForwardEvent` checks if `event.data` has a string `strategyId`. If yes, the ID must be in the user's active strategy set (loaded at connection time, refreshed on each re-validation). Events without `strategyId` (orders, alerts, heartbeats, auth_expired) always pass through.

### triggerRevalidate test hook
The revalidate function is assigned to `deps.triggerRevalidate` inside `ReadableStream.start()`. Since `start()` runs when the first read happens, the test reads the initial heartbeat first, then calls `deps.triggerRevalidate()` to force a re-validation cycle synchronously.

### Validation results
```
bun run typecheck  → 0 errors
bun test           → 1656 pass, 0 fail (full suite)
biome check        → 0 errors (modified files)
```
