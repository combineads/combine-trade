# T-034 Vector pipeline integration test

## Goal
Write integration tests that verify the complete vector pipeline: strategy event → feature normalization → vector storage → L2 search → statistics → decision, using in-memory mocks for the full flow.

## Why
Integration tests validate that all EP03 components work together correctly. This catches interface mismatches and integration bugs that unit tests miss.

## Inputs
- All EP03 components (T-027 through T-033)
- Existing integration test patterns from `tests/integration/strategy-sandbox.test.ts`

## Dependencies
- T-033 (vector worker, which integrates all components)

## Expected Outputs
- `tests/integration/vector-pipeline.test.ts` — integration test suite

## Deliverables
- `tests/integration/vector-pipeline.test.ts`

## Constraints
- Tests use in-memory mocks (no real database required)
- Must verify vector isolation (cross-strategy search returns nothing)
- Must verify threshold filtering behavior
- Must verify decision output correctness

## Steps
1. Write integration tests (RED → GREEN):
   a. Full pipeline: features → normalize → store → search → stats → decision
   b. Vector isolation: strategy A vectors never appear in strategy B search
   c. Threshold filtering: distant vectors excluded from statistics
   d. INSUFFICIENT gate: < 30 valid results → PASS decision
   e. Decision correctness: high winrate + positive expectancy → LONG
   f. Mixed normalization: features with different normalizers processed correctly
2. Create test helpers for generating fixture data (events, labels, vectors)
3. Verify all tests pass
4. Run full project validation

## Acceptance Criteria
- Full pipeline integration test passes end-to-end
- Vector isolation test: cross-strategy search returns empty
- Threshold test: high-distance vectors excluded
- INSUFFICIENT test: < 30 samples → PASS
- Decision test: correct LONG/SHORT/PASS based on statistics
- No cross-strategy or cross-symbol contamination in any test

## Validation
```bash
bun test -- --filter "vector-pipeline"
bun test
bun run typecheck
bun run lint
```

## Out of Scope
- Performance benchmarks
- Real pgvector database tests
- Label creation/worker tests
