# T-08-008 Implement API server bootstrap with full route wiring

## Goal
Create the server bootstrap module that wires all route factories to real dependencies (DB repositories, auth, risk services) and starts the complete Elysia server.

## Why
EP08 M1 — route factories exist but aren't connected to real deps. The current `apps/api/src/index.ts` only mounts the health route. All other routes need DI wiring.

## Inputs
- `apps/api/src/index.ts` (current minimal server)
- All route factories in `apps/api/src/routes/`
- `apps/api/src/middleware/auth.ts` (auth plugin)
- T-08-007 (DrizzleStrategyRepository)
- T-09-006, T-09-007 (risk DB services)

## Dependencies
- T-08-007 (strategy repository)
- T-09-006 (kill switch DB service)

## Expected Outputs
- Complete server bootstrap that wires:
  - Auth middleware on protected routes
  - Strategy routes → DrizzleStrategyRepository
  - Event/candle/alert/order routes → query functions
  - Auth routes → auth service
  - SSE routes → event bus subscriber
  - Kill switch routes → risk services
  - Credential routes → encryption service

## Deliverables
- `apps/api/src/server.ts` (bootstrap module)
- `apps/api/src/deps.ts` (dependency container)
- Update `apps/api/src/index.ts` to use server bootstrap

## Constraints
- All DB connections from env vars (DATABASE_URL)
- All secrets from env vars (JWT_SECRET, MASTER_ENCRYPTION_KEY)
- Graceful shutdown on SIGTERM/SIGINT
- Auth middleware guards all routes except: /api/v1/health, /api/v1/auth/login, /api/v1/auth/refresh
- Use Drizzle with postgres-js driver

## Steps
1. Create deps.ts with dependency container construction
2. Create server.ts that builds Elysia app with all route factories
3. Wire auth middleware to protected route groups
4. Update index.ts to use new bootstrap
5. Validate server starts and all routes respond

## Acceptance Criteria
- Server starts with all routes mounted
- Protected routes require valid JWT
- Public routes (health, login, refresh) work without auth
- Graceful shutdown cleans up DB connections
- All env vars validated on startup

## Validation
```bash
bun run typecheck
bun test apps/api/
```

## Out of Scope
- Docker deployment
- Process management
- Rate limiting
