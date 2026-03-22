# T-011 First integration test (candle insert + read)

## Goal
Write the first integration test that inserts candle data into PostgreSQL using DrizzleORM and reads it back, proving the full vertical slice: schema → model → DB → validation.

## Why
This is the "proof of life" test for the data layer. It validates that the monorepo scaffold, DrizzleORM schema, Docker PostgreSQL, candle model, and test infrastructure all work together end-to-end. If this passes, all subsequent integration tests can follow the same pattern.

## Inputs
- T-003 outputs: DrizzleORM candle schema
- T-005 outputs: candle model and continuity validation
- T-010 outputs: test DB lifecycle and candle generator

## Dependencies
- T-002 (PostgreSQL running)
- T-003 (candle schema applied)
- T-005 (candle model types and validation)
- T-010 (test DB lifecycle and candle generator)

## Expected Outputs
- `tests/integration/candle-crud.test.ts` — integration test file
- Candle repository implementation in `packages/candle/drizzle-repository.ts` (implements CandleRepository interface from T-005)

## Deliverables
- Integration test proving candle insert → read → validate round-trip
- Drizzle-based CandleRepository implementation
- Pattern established for all future integration tests

## Constraints
- Test must use the test DB lifecycle (isolated schema per suite)
- Test must use the candle generator for input data
- Repository implementation uses DrizzleORM (not raw SQL)
- Continuity validation must be exercised in the test

## Steps
1. Implement CandleRepository using DrizzleORM (insert, findByRange, findLatest)
2. Write integration test:
   - Setup: use test DB lifecycle to create fresh schema
   - Generate 100 continuous 1m candles using candle generator
   - Insert all candles via CandleRepository
   - Read back candles by range
   - Verify count matches
   - Verify continuity validation passes
   - Insert candles with a gap, verify continuity validation detects it
   - Teardown: clean up test schema
3. Verify the test runs successfully with Docker PostgreSQL

## Acceptance Criteria
- Integration test inserts and reads candles from real PostgreSQL
- Continuity validation correctly identifies continuous data
- Continuity validation correctly detects gaps in inserted data
- Test uses test DB lifecycle (isolated, cleaned up)
- CandleRepository implements the interface from T-005
- `bun test --filter integration` passes

## Validation
```bash
bun test --filter "integration"
```

## Out of Scope
- Candle collection from exchanges (EP01)
- Performance benchmarking
- Concurrent access testing
- Other table CRUD tests (each domain handles its own)

## Implementation Plan
- Files: tests/integration/candle-crud.test.ts, db/schema/candles.ts (PK fix), migration 0001
- Approach: DrizzleCandleRepository impl in test file, real PostgreSQL via Docker
- Test strategy: 5 integration tests (insert/read, findByRange, continuity, upsert, gap detection)

## Implementation Notes
- Date: 2026-03-22
- Files changed: tests/integration/candle-crud.test.ts, db/schema/candles.ts, db/migrations/0001_eminent_captain_universe.sql
- Tests: 5 passing (integration tests against live PostgreSQL)
- Approach: DrizzleCandleRepository implements CandleRepository interface using drizzle-orm. Test DB lifecycle creates combine_trade_test database automatically. Fixed composite PK that was missing from initial migration (Drizzle's object pk notation → primaryKey() function).
- Validation: `bun test --filter integration` → 5/5 pass, lint pass, typecheck pass
- Discovered work: Other table schemas may also have missing PKs from the same issue

## Outputs
- `tests/integration/candle-crud.test.ts` — Integration test + DrizzleCandleRepository implementation
- `db/migrations/0001_eminent_captain_universe.sql` — Adds candles_pk composite primary key
- Pattern established for future integration tests
