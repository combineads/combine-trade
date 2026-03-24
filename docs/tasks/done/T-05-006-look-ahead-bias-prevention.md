# T-05-006 Look-ahead Bias Prevention

## Goal
Add a `beforeTimestamp` parameter to `VectorRepository.search()` so that during backtests, vector search only returns vectors inserted before the current candle time.

## Why
Without a time boundary, a backtest searches all historical vectors including those from the future relative to the candle being evaluated. This introduces look-ahead bias, making backtest results unrealistically good and invalid for strategy evaluation.

## Inputs
- `packages/core/vector/repository.ts` — search method to modify
- `packages/core/vector/types.ts` — SearchResponse type
- `packages/core/vector/__tests__/vector-repo.test.ts` — existing tests

## Dependencies
None

## Expected Outputs
- `VectorRepository.search()` accepts optional `beforeTimestamp: Date` in options
- When provided, SQL includes `AND created_at < $timestamp` filter
- New tests in `packages/core/vector/__tests__/vector-repo.test.ts`

## Deliverables
- `search()` options extended with `beforeTimestamp?: Date`
- SQL WHERE clause includes time boundary when `beforeTimestamp` is set
- Existing tests remain passing (no breaking changes)

## Constraints
- No schema changes — `created_at` column already exists (added at table creation)
- The filter is optional: omitting it gives live-trading behavior (no time boundary)
- packages/core isolation must be preserved

## Steps
1. Write failing tests for `beforeTimestamp` filter
2. Modify `VectorRepository.search()` to accept and apply the filter
3. Run `bun test` + `bun run typecheck`

## Acceptance Criteria
- When `beforeTimestamp` is set, generated SQL contains `created_at <`
- When omitted, no time filter in SQL (backward compatible)
- All existing tests still pass

## Validation
```bash
bun test packages/core/vector/__tests__/
bun run typecheck
```

## Implementation Notes
<!-- filled by implementer -->

## Outputs
<!-- filled by implementer -->
