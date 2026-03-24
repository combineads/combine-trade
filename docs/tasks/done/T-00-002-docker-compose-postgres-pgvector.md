# T-00-002 Docker compose for PostgreSQL + pgvector

## Goal
Create a Docker Compose configuration that runs PostgreSQL with the pgvector extension, ready for DrizzleORM schema application and development use.

## Why
All database-dependent tasks (schema, integration tests, event bus) require a running PostgreSQL instance with pgvector. This must be available before any DB work can begin.

## Inputs
- `docs/ARCHITECTURE.md` § "Database schema" and § "DB connection pool sizing"
- `docs/TECH_STACK.md` § "PostgreSQL"

## Dependencies
None — Docker compose is independent infrastructure.

## Expected Outputs
- `docker-compose.yml` with PostgreSQL + pgvector service
- PostgreSQL accessible on localhost:5432
- pgvector extension auto-enabled on startup
- Health check configured
- Volume for data persistence across restarts

## Deliverables
- `docker-compose.yml` at project root
- Init script that creates the database and enables pgvector extension
- Documentation in `.env.example` for DB connection variables

## Constraints
- Use official `pgvector/pgvector:pg17` image (PostgreSQL 17 + pgvector)
- `max_connections = 30` (per ARCHITECTURE.md pool sizing)
- Named volume for data persistence
- Health check must verify PostgreSQL is accepting connections

## Steps
1. Create `docker-compose.yml` with PostgreSQL + pgvector service
2. Create `db/init/` directory with initialization SQL script (CREATE EXTENSION vector)
3. Configure environment variables (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB)
4. Add health check (pg_isready)
5. Add named volume for data persistence
6. Update `.env.example` with DATABASE_URL
7. Test: `docker compose up -d` and verify pgvector is available

## Acceptance Criteria
- `docker compose up -d` starts PostgreSQL successfully
- pgvector extension is available (`SELECT * FROM pg_extension WHERE extname = 'vector'`)
- Database is accessible via DATABASE_URL from `.env.example`
- Container health check passes

## Validation
```bash
docker compose up -d && sleep 3 && docker compose exec -T postgres psql -U combine -d combine_trade -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

## Out of Scope
- DrizzleORM schema (T-00-003)
- Migration infrastructure (T-00-003)
- WAL archiving / backup (deferred to later epic)
- Production PostgreSQL tuning

## Implementation Plan

### Files to create
1. `docker-compose.yml` — PostgreSQL + pgvector service
2. `db/init/01-extensions.sql` — init script for pgvector + test DB

### Approach
- pgvector/pgvector:pg17 official image
- max_connections=30 via postgres command args
- Named volume `pgdata` for persistence
- pg_isready health check
- Init script creates pgvector extension in both main and test DBs

## Implementation Notes

- **Date**: 2026-03-22
- **Files created**: docker-compose.yml, db/init/01-extensions.sql
- **Tests written**: N/A (infrastructure validation via Docker commands)
- **Approach**: Used pgvector/pgvector:pg17 image with postgres command args for max_connections=30. Init script enables vector extension in both combine_trade and combine_trade_test databases.
- **Validation results**:
  - `docker compose up -d`: PASS
  - pgvector extension: PASS (v0.8.2)
  - max_connections: PASS (30)
  - Health check: PASS (pg_isready)
- **Discovered work**: None
- **Blockers**: None

## Outputs

- `docker-compose.yml` — PostgreSQL 17 + pgvector service on localhost:5432
- `db/init/01-extensions.sql` — auto-creates pgvector extension + test database
- PostgreSQL credentials: combine/combine on combine_trade database
- Test database: combine_trade_test (with pgvector enabled)
