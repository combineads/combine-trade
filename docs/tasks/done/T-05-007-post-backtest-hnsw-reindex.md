# T-05-007 Post-Backtest HNSW REINDEX

## Goal
Implement `reindexTable(tableName, executor)` in `packages/core/vector/hnsw-reindex.ts` to trigger HNSW index rebuild after a backtest inserts many vectors.

## Steps
1. Write tests (RED) in `packages/core/vector/__tests__/hnsw-reindex.test.ts`
2. Implement `packages/core/vector/hnsw-reindex.ts`
3. Run tests + typecheck (GREEN)
4. Refactor if needed

## Spec
- `reindexTable(tableName, executor)` — drops and recreates the HNSW index for a vector table
- Match existing HNSW config from table-manager.ts: m=16, ef_construction=64
- Also recreates the symbol index
- Returns a result object with the index name and config used
- Tests with mock SQL executor

## Constraints
- No imports from Elysia, CCXT, Drizzle, or Slack (packages/core domain isolation)
- Must use the same HNSW config as VectorTableManager (m=16, ef_construction=64)
