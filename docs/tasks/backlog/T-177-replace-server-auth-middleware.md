# T-177 Replace server auth middleware

## Goal
Replace the inline `authGuardPlugin` in `apps/api/src/server.ts` with the better-auth Elysia plugin. Apply `@elysiajs/helmet` security headers and tighten the CORS configuration to an origin allowlist. Remove the legacy `jwtSecret` and `findUserByUsername` fields from `ApiServerDeps`.

## Why
The existing `authGuardPlugin` wraps two competing JWT implementations and a no-op logout. The CORS config uses wildcard `cors()` which allows any origin, and `@elysiajs/helmet` is listed in `TECH_STACK.md` but never applied. This task makes the server the single, correct enforcement point for all three concerns: authentication, security headers, and CORS.

## Inputs
- `apps/api/src/server.ts` — current server with `authGuardPlugin`, `cors()` wildcard, no helmet
- `packages/shared/auth/better-auth.ts` — `auth` instance (output of T-176)
- `docs/exec-plans/18-better-auth-multiuser.md` § M2 — better-auth Elysia plugin pattern, CORS config, helmet config
- `.env.example` — environment variable reference file to update

## Dependencies
- T-176 (better-auth instance must exist before it can be plugged in)

## Expected Outputs
- `apps/api/src/server.ts` — updated: better-auth Elysia plugin, helmet, CORS allowlist, `ApiServerDeps` cleaned up
- `.env.example` — `ALLOWED_ORIGIN` entry added
- Unit test confirming health route returns 200 without a token, and a protected route returns 401 without a token

## Deliverables

### `apps/api/src/server.ts` changes
```typescript
import { betterAuthPlugin } from "better-auth/integrations/elysia";
import helmet from "@elysiajs/helmet";
import cors from "@elysiajs/cors";
import { auth } from "../../../packages/shared/auth/better-auth.js";

// Remove from ApiServerDeps:
//   jwtSecret: string
//   findUserByUsername: (username: string) => Promise<...>

export function createApiServer(deps: ApiServerDeps) {
  return new Elysia()
    .use(helmet())
    .use(cors({
      origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3001",
      credentials: true,
    }))
    .use(errorHandlerPlugin)
    .use(betterAuthPlugin(auth))
    // routes follow...
}
```

The `betterAuthPlugin` handles:
- `GET /api/auth/**` and `POST /api/auth/**` — forwarded to better-auth (sign-in, sign-out, get-session, etc.)
- Session validation middleware for all other routes (returns 401 when no valid session)
- Public path `/api/v1/health` must be configured to bypass session validation

### `.env.example`
Add:
```
ALLOWED_ORIGIN=http://localhost:3001
```

## Constraints
- `PUBLIC_PATHS` list and the old `authGuardPlugin` function must be fully removed — no dead code
- `cors()` with no arguments (wildcard) must be replaced — no wildcards
- `@elysiajs/helmet` must be applied before route definitions
- The `ApiServerDeps` interface must remove `jwtSecret` and `findUserByUsername` (they were only needed by the old auth route and authGuardPlugin)
- Running DB is NOT required for typecheck. Integration tests against `POST /api/auth/sign-in/email` require a running DB.
- Do not hardcode `ALLOWED_ORIGIN`; read from `process.env`

## Steps
1. Write failing test: create a test that verifies `GET /api/v1/health` returns 200 and that a request to a protected route without session cookies returns 401 (RED)
2. Update `apps/api/src/server.ts`: add helmet + cors allowlist + betterAuthPlugin, remove authGuardPlugin and PUBLIC_PATHS (GREEN)
3. Remove `jwtSecret` and `findUserByUsername` from `ApiServerDeps` and all call sites
4. Add `ALLOWED_ORIGIN` to `.env.example`
5. Run `bun run typecheck` — zero errors (REFACTOR)
6. Run unit tests

## Acceptance Criteria
- `GET /api/v1/health` returns 200 without authentication
- Any protected route without a valid session cookie returns 401
- `POST /api/auth/sign-in/email` route exists (handled by better-auth plugin)
- `POST /api/auth/sign-out` route exists
- `GET /api/auth/get-session` route exists
- CORS does not use wildcard origin
- All responses include `Strict-Transport-Security` and `X-Content-Type-Options` security headers
- `authGuardPlugin` function, `PUBLIC_PATHS` constant, and `verifyTokenFromShared` import are gone from `server.ts`
- `ApiServerDeps` no longer contains `jwtSecret` or `findUserByUsername`
- `bun run typecheck` passes

## Validation
```bash
bun run typecheck
bun test --filter "server|auth-guard|health"
# With running server + DB:
curl -s http://localhost:3000/api/v1/health | jq .
curl -s -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test"}' | jq .
curl -s http://localhost:3000/api/v1/strategies \
  -H "Authorization: Bearer invalid" | jq .status
```

## Out of Scope
- Deleting legacy auth source files — T-178
- Session extraction in individual route handlers — T-181
- Client-side auth — T-182
- Rate limiting verification — T-183
