# T-03-003 Implement dynamic vector table manager

## Goal
Build the table manager that creates/drops per-strategy dynamic vector tables (`vectors_{strategy_id}_v{version}`) with pgvector HNSW indexes, and maintains the vector_table_registry.

## Why
Physical table separation per strategy+version is a critical invariant — it mechanically prevents cross-strategy vector contamination. The table manager is the single access point for all dynamic vector table operations.

## Inputs
- EP03 M2 spec (dynamic table management)
- `db/schema/vector-table-registry.ts` (registry schema from EP00)
- ARCHITECTURE.md §Dynamic vector table exception

## Dependencies
- None within EP03 (uses existing vector_table_registry schema)

## Expected Outputs
- `packages/core/vector/table-manager.ts` — VectorTableManager class
- SQL executor interface for testability
- Comprehensive tests with mock SQL executor

## Deliverables
- `packages/core/vector/table-manager.ts`
- `packages/core/vector/sql-types.ts` (SQL executor interface)
- `packages/core/vector/__tests__/table-manager.test.ts`

## Constraints
- Uses raw SQL (not DrizzleORM) — architecture decision for dynamic tables
- Table naming: `vectors_{strategyId}_v{version}` (sanitized, no SQL injection)
- pgvector `vector(dimension)` column + HNSW index with L2 distance
- HNSW params: m=16, ef_construction=64 (configurable)
- Table creation must be idempotent (IF NOT EXISTS)
- Max 1000 dynamic tables per deployment (ERR_USER_TABLE_LIMIT)
- Table manager is the SINGLE access point — no other module creates dynamic tables
- SQL executor interface for dependency injection (testable without DB)

## Steps
1. Create `packages/core/vector/sql-types.ts` with SqlExecutor interface
2. Write failing tests for table creation, drop, existence check, registry (RED)
3. Implement VectorTableManager:
   - `ensureTable(strategyId, version, dimension)` — CREATE TABLE IF NOT EXISTS + HNSW index + registry entry
   - `dropTable(strategyId, version)` — DROP TABLE + registry cleanup
   - `tableExists(strategyId, version)` — check with in-memory cache
   - `getTableName(strategyId, version)` — returns sanitized name
   - `getTableCount()` — for limit enforcement
4. Implement registry operations (insert, update row_count, set status)
5. Add table name sanitization (prevent SQL injection via strategy ID)
6. Add table count guard (max 1000)
7. Make tests pass (GREEN)
8. Refactor

## Acceptance Criteria
- Table creation generates correct SQL: `CREATE TABLE IF NOT EXISTS vectors_{id}_v{ver} (id UUID PRIMARY KEY, event_id UUID NOT NULL, symbol TEXT NOT NULL, timeframe TEXT NOT NULL, embedding vector({dim}) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
- HNSW index created: `CREATE INDEX IF NOT EXISTS ... USING hnsw (embedding vector_l2_ops) WITH (m=16, ef_construction=64)`
- Idempotent: calling ensureTable twice doesn't error
- Table count > 1000 → throws ERR_USER_TABLE_LIMIT
- Registry updated on create/drop
- Table existence cached (avoids repeated DB checks)
- Strategy ID sanitized in table name (alphanumeric + hyphens only)

## Validation
```bash
bun test -- --filter "table-manager"
bun run typecheck
bun run lint
```

## Out of Scope
- Schema migration utility (dimension change) — deferred
- HNSW tuning benchmark (recall@10 test) — deferred
- Orphan table cleanup policy — deferred
