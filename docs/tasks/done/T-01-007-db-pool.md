# T-01-007 db/pool.ts — PostgreSQL connection pool

## Goal
Create the PostgreSQL connection pool module at `src/db/pool.ts` using the `postgres` (porsager) driver with Drizzle ORM integration. This provides the shared database connection used by all data-access code.

## Why
All database operations — migrations, queries, config loading — need a connection pool. The pool must be created once and shared across modules. Using `postgres` driver (porsager) with Drizzle ORM provides type-safe queries with minimal abstraction overhead, as specified in TECH_STACK.md.

## Inputs
- `docs/TECH_STACK.md` — postgres 3.4.8, drizzle-orm 0.45.2
- `docs/ARCHITECTURE.md` — db module is L1, depends only on core
- `.env.example` (T-01-001) — DATABASE_URL format

## Dependencies
T-01-001 (project initialization — postgres and drizzle-orm must be installed)

## Expected Outputs
- `src/db/pool.ts` — connection pool factory, Drizzle instance, cleanup function
- All DB-dependent modules import from this module

## Deliverables
- `src/db/pool.ts`

## Constraints
- L1 module: may only import from `core/`
- Connection string from `DATABASE_URL` environment variable
- Pool must support connection limits (default: 10)
- Must provide graceful shutdown (close all connections)
- Must handle connection errors with descriptive messages
- Must export both raw `sql` client and Drizzle `db` instance

## Steps
1. Import `postgres` from `postgres` package
2. Import `drizzle` from `drizzle-orm/postgres-js`
3. Create `createPool(databaseUrl?: string)` function:
   - Read `DATABASE_URL` from env if not provided
   - Throw descriptive error if no URL available
   - Create postgres connection with configurable pool size
   - Wrap with Drizzle ORM instance
4. Export singleton getter: `getDb(): DrizzleInstance`
5. Export `getPool(): PostgresClient` for raw SQL access (migrations)
6. Export `closePool(): Promise<void>` for graceful shutdown
7. Export `initDb(url?: string): Promise<void>` — initialize pool, verify connectivity
8. Add connection health check: `isHealthy(): Promise<boolean>` — runs `SELECT 1`
9. Write tests (using test database URL from env)
10. Verify `bun run typecheck` passes

## Acceptance Criteria
- `initDb()` connects to PostgreSQL using DATABASE_URL
- `getDb()` returns a Drizzle instance ready for type-safe queries
- `getPool()` returns raw postgres client for migrations
- `closePool()` cleanly shuts down all connections
- `isHealthy()` returns true when DB is reachable
- Missing DATABASE_URL throws descriptive error
- Connection failure produces a clear error message
- `bun run typecheck` passes

## Test Scenarios
- initDb() with valid DATABASE_URL → connects successfully, isHealthy() returns true
- initDb() with missing DATABASE_URL → throws error with message containing 'DATABASE_URL'
- initDb() with invalid URL → throws connection error
- getDb() before initDb() → throws error indicating DB not initialized
- closePool() after init → subsequent queries throw connection closed error
- isHealthy() with active connection → returns true
- getPool() returns client that can execute raw SQL `SELECT 1`

## Validation
```bash
bun run typecheck
bun test --grep "db/pool"
```

## Out of Scope
- Schema definitions (T-01-008)
- Migration runner (T-01-009)
- Specific query builders for entities
- Connection retry logic (added in reliability epic)
