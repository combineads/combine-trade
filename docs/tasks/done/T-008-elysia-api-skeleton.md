# T-008 Elysia API skeleton with health endpoint

## Goal
Create the Elysia API server in `apps/api/` with a working health endpoint at `GET /api/v1/health` and basic middleware setup.

## Why
The API server is the single communication layer for all UI clients (web and desktop). A working health endpoint proves the API framework is correctly configured and provides a target for deployment verification.

## Inputs
- `docs/ARCHITECTURE.md` § "Elysia" and § "API versioning"
- `docs/TECH_STACK.md` § "API Framework"
- T-001 outputs: `apps/api/` directory

## Dependencies
- T-001 (monorepo structure with apps/api/)

## Expected Outputs
- `apps/api/src/index.ts` — Elysia server entry point
- `apps/api/src/routes/health.ts` — Health endpoint (GET /api/v1/health)
- `apps/api/src/routes/index.ts` — Route barrel
- `apps/api/package.json` — with elysia, @elysiajs/cors dependencies
- Unit test for health endpoint

## Deliverables
- Working Elysia server that starts and responds to health checks
- URL-prefix versioned routes (/api/v1/)
- CORS middleware configured
- Health endpoint returning `{ status: "ok", timestamp: ... }`

## Constraints
- URL-prefix versioning: `/api/v1/...`
- Health endpoint is public (no JWT required — per TECH_STACK.md)
- CORS enabled for localhost development
- Port configurable via environment variable (default 3000)
- Structured error responses following error taxonomy

## Steps
1. Install `elysia`, `@elysiajs/cors` in apps/api
2. Create `apps/api/src/index.ts` — Elysia app with CORS plugin, listen on PORT
3. Create `apps/api/src/routes/health.ts` — GET /api/v1/health returning status + timestamp
4. Create route barrel `apps/api/src/routes/index.ts`
5. Add `dev` and `start` scripts to apps/api/package.json
6. Write test for health endpoint using Elysia's built-in test support
7. Verify server starts and responds

## Acceptance Criteria
- `bun run --cwd apps/api dev` starts the server
- `GET /api/v1/health` returns `{ status: "ok", timestamp: "..." }` with 200 status
- CORS headers present in responses
- Health endpoint test passes
- `bun test --filter health` passes

## Validation
```bash
bun test --filter "health"
```

## Out of Scope
- JWT authentication middleware (EP10)
- Database connection from API (EP01+)
- Eden treaty client setup (EP08)
- SSE streaming endpoints (EP07)
- Other API routes (domain-specific epics)

## Implementation Plan
- Files: apps/api/src/index.ts, routes/health.ts, routes/index.ts, __tests__/health.test.ts
- Approach: Elysia with CORS plugin, health route returning status+timestamp
- Test strategy: 3 tests using Elysia's built-in handle() for request simulation

## Implementation Notes
- Date: 2026-03-22
- Files changed: apps/api/src/index.ts, src/routes/health.ts, src/routes/index.ts, __tests__/health.test.ts, apps/api/package.json
- Tests: 3 passing (200 OK, valid timestamp, 404 unknown)
- Approach: Elysia v1.4.28, @elysiajs/cors v1.4.1. Health returns { status, timestamp }. PORT from env or 3000.
- Validation: `bun test --filter health` → 3/3 pass, lint pass, typecheck pass

## Outputs
- `apps/api/src/index.ts` — Elysia server entry point (exported as `app`)
- `apps/api/src/routes/health.ts` — GET /api/v1/health
- `apps/api/src/routes/index.ts` — route barrel export
