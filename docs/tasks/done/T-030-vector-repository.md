# T-030 Build vector repository with L2 search and isolation

## Goal
Implement the vector repository that stores embeddings and performs L2 similarity search with strict strategy+version+symbol isolation, threshold filtering, and min_samples gating.

## Why
The core of the vector engine — stores normalized feature vectors and retrieves similar historical patterns. Isolation enforcement prevents cross-strategy contamination mechanically.

## Inputs
- EP03 M3 spec (vector storage & retrieval)
- T-029 table manager (provides table names and SQL executor)
- ARCHITECTURE.md §isolation principle
- PRODUCT.md §3 filtering logic

## Dependencies
- T-029 (table manager for table name resolution and SQL execution)

## Expected Outputs
- `packages/core/vector/repository.ts` — VectorRepository class
- Search result types with distance and filtering metadata
- Tests with mock SQL executor

## Deliverables
- `packages/core/vector/repository.ts`
- `packages/core/vector/__tests__/vector-repo.test.ts`

## Constraints
- L2 distance: `ORDER BY embedding <-> query_vector LIMIT top_k`
- top_k default: 50
- Similarity threshold: `√d × 0.3` where d = vector dimension
- Post-filtering: discard results where distance > threshold
- If valid results < min_samples (30) → return INSUFFICIENT status
- Isolation: queries only target `vectors_{strategyId}_v{version}` table + WHERE symbol = ?
- Vector storage must include event_id (for joining with labels)
- Idempotent writes: UNIQUE(event_id) constraint, ON CONFLICT DO NOTHING

## Steps
1. Define SearchResult and SearchResponse types (with SUFFICIENT/INSUFFICIENT status)
2. Write failing tests for store, search, threshold filtering, isolation, idempotency (RED)
3. Implement VectorRepository:
   - `store(strategyId, version, eventId, symbol, timeframe, embedding)` — INSERT with ON CONFLICT
   - `search(strategyId, version, symbol, queryVector, options?)` — L2 search + filtering
   - `computeThreshold(dimension)` — Math.sqrt(dimension) * 0.3
4. Search pipeline:
   a. Query pgvector: `ORDER BY embedding <-> $query LIMIT 50`
   b. Filter: discard where distance > threshold
   c. Count valid results
   d. If count < 30 → return { status: "INSUFFICIENT", results: [] }
   e. If count >= 30 → return { status: "SUFFICIENT", results: validResults }
5. Make tests pass (GREEN)
6. Refactor

## Acceptance Criteria
- Store generates correct INSERT SQL with ON CONFLICT DO NOTHING
- Search targets correct dynamic table (vectors_{id}_v{ver})
- Search includes WHERE symbol = ? (isolation)
- Threshold = √d × 0.3 (e.g., d=5 → threshold ≈ 0.671)
- Results with distance > threshold excluded
- < 30 valid results → INSUFFICIENT status
- ≥ 30 valid results → SUFFICIENT with event_ids and distances
- Duplicate event_id store is no-op (idempotent)
- Never queries across strategy/version boundaries (table-level isolation)

## Validation
```bash
bun test -- --filter "vector-repo"
bun run typecheck
bun run lint
```

## Out of Scope
- Actual pgvector database integration (uses mock SQL executor)
- Performance benchmarks (< 100ms)
- HNSW ef_search tuning
