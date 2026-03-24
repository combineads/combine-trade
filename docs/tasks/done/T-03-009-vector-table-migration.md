# T-03-009 Vector Table Schema Migration Utility

## Goal
Implement a `migrateTable` function in `packages/core/vector/table-migrator.ts` that safely migrates a vector table's schema when the embedding dimension changes.

## Steps
1. Write tests (RED) in `packages/core/vector/__tests__/table-migrator.test.ts`
2. Implement `packages/core/vector/table-migrator.ts`
3. Run tests + typecheck (GREEN)
4. Refactor if needed

## Spec
- `migrateTable(tableName, newDimension, executor, options?)` — migrate a vector table to a new dimension
- Migration flow: create new table → copy compatible data (same dimension only) → drop old table → rename new
- If dimension changes, old vectors are incompatible — archive them by renaming the old table instead of deleting
- Safety: require explicit `{ confirmed: true }` option — throw `ERR_MIGRATION_NOT_CONFIRMED` otherwise
- Never auto-delete rows; never silently drop the old table when dimension has changed

## Constraints
- Must use mock SQL executor (no real DB in tests)
- No imports from Elysia, CCXT, Drizzle, or Slack (packages/core domain isolation)
- HNSW config: m=16, ef_construction=64 (match table-manager.ts)
