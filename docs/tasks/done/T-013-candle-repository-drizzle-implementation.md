# T-013 Implement DrizzleCandleRepository as a proper module

## Goal
Extract the `DrizzleCandleRepository` class from `tests/integration/candle-crud.test.ts` into a proper importable module at `workers/candle-collector/repository.ts`, add an `upsertBatch` method for bulk backfill, and register it in the IoC container token set. The CandleRepository interface in `packages/candle/repository.ts` remains unchanged.

## Why
The integration test in T-011 proved the DrizzleORM mapping works correctly but left the implementation inline in a test file — not importable by the candle-collector worker. T-015 (candle-collector) needs a real repository instance it can resolve from the IoC container. This task promotes the implementation from test artifact to production module following the architectural rule that workers own Drizzle implementations (not domain packages).

## Inputs
- `tests/integration/candle-crud.test.ts` — existing DrizzleCandleRepository implementation to extract
- `packages/candle/repository.ts` — CandleRepository interface to implement
- `packages/candle/types.ts` — Candle, CandleKey types
- `db/schema/candles.ts` — Drizzle table schema (exchange, symbol, timeframe, openTime, open, high, low, close, volume, isClosed, source, createdAt, updatedAt)
- `packages/shared/di/tokens.ts` — IoC token registry to extend
- `docs/ARCHITECTURE.md` § "Database schema access" — only apps/ and workers/ may import from db/schema/
- `docs/ARCHITECTURE.md` § "Worker → Package import rules" — candle-collector allowed: packages/candle, packages/exchange, packages/shared
- T-011 outputs: DrizzleCandleRepository pattern + 5 passing integration tests

## Dependencies
- T-005 (CandleRepository interface)
- T-011 (DrizzleCandleRepository proof-of-concept + integration test patterns)

## Expected Outputs
- `workers/candle-collector/repository.ts` — DrizzleCandleRepository class implementing CandleRepository + upsertBatch
- `workers/candle-collector/index.ts` — barrel export (or update if exists)
- `packages/shared/di/tokens.ts` — CandleRepository token added
- `tests/integration/candle-repository.test.ts` — integration tests for the extracted module (replaces inline test; original candle-crud.test.ts unchanged)

## Deliverables
- DrizzleCandleRepository promoted to workers/candle-collector/repository.ts
- `upsertBatch(candles: Candle[]): Promise<void>` — bulk upsert using a single INSERT ... ON CONFLICT DO UPDATE for efficient backfill (no per-candle loop)
- `findLatestOpenTime(exchange, symbol, timeframe): Promise<Date | null>` — query for startup gap calculation in T-015
- IoC token `Tokens.CandleRepository` added to packages/shared/di/tokens.ts
- Integration tests covering all repository methods including upsertBatch and findLatestOpenTime

## Constraints
- `workers/candle-collector/repository.ts` may import from `db/schema/candles.ts` (workers are allowed per ARCHITECTURE.md)
- `packages/candle/repository.ts` interface must NOT be modified — add upsertBatch and findLatestOpenTime only to the concrete class (or extend the interface if both methods belong to the domain contract — decide based on whether T-015 needs them injected)
- Upsert conflict target: composite key (exchange, symbol, timeframe, openTime)
- Upsert conflict update set: open, high, low, close, volume, isClosed, updatedAt
- `source` column: set to `"rest"` for backfill writes, `"ws"` for live writes (pass as parameter)
- All price fields stored as TEXT strings (Candle type uses string for OHLCV prices per ARCHITECTURE.md)
- Volume stored as TEXT (consistent with existing schema)
- `upsertBatch` must be transactionally atomic for the entire batch
- Do NOT import Elysia, CCXT, or Slack in workers/candle-collector/

## Steps
1. Write failing integration tests first (RED):
   - Test: upsert creates candle that doesn't exist
   - Test: upsert updates existing candle (same composite key, different close)
   - Test: upsertBatch inserts 500 candles atomically (verify count after)
   - Test: upsertBatch is idempotent (run twice, count stays 500)
   - Test: findLatestOpenTime returns null when no candles exist
   - Test: findLatestOpenTime returns the most recent openTime for a given (exchange, symbol, timeframe)
   - Test: source column is persisted correctly ("rest" vs "ws")
2. Implement DrizzleCandleRepository in workers/candle-collector/repository.ts (GREEN):
   - Copy insert, upsert, findByRange, findLatest from test file
   - Implement upsertBatch: use drizzle insert().values([...]).onConflictDoUpdate(...)
   - Implement findLatestOpenTime: SELECT openTime ORDER BY openTime DESC LIMIT 1
   - Accept `source?: string` parameter in upsert / upsertBatch; default `"ws"`
3. Add CandleRepository token to packages/shared/di/tokens.ts
4. Export from workers/candle-collector/index.ts
5. Refactor (REFACTOR): extract toCandle() row mapper as a module-level function
6. Verify original candle-crud.test.ts still passes (no regressions)

## Acceptance Criteria
- `workers/candle-collector/repository.ts` exports `DrizzleCandleRepository`
- All 6 new integration tests pass against live PostgreSQL
- `upsertBatch(500 candles)` completes and the table contains exactly 500 rows
- `findLatestOpenTime` returns `null` on empty table and the correct `Date` after inserts
- `source` column stored correctly for REST backfill vs WS live writes
- `bun test --filter "candle-repository"` passes
- `bun test --filter "integration"` still passes (no regressions in candle-crud.test.ts)
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test --filter "candle-repository"
bun test --filter "integration"
bun run typecheck
bun run lint
```

## Out of Scope
- CandleRepository implementation for packages other than workers/candle-collector (each worker owns its own Drizzle layer)
- Pagination / cursor-based findByRange (not needed at MVP scale)
- Read replicas or connection routing
- OKX-specific repository differences (same schema, same implementation)
- Gap counting query (used in continuity validation — stays in packages/candle/validation.ts)

## Implementation Notes
- Date: 2026-03-22
- Files changed: workers/candle-collector/src/repository.ts, packages/shared/di/tokens.ts, tests/integration/candle-repository.test.ts
- Tests: 7 integration tests passing
- Approach: Extracted DrizzleCandleRepository from test inline to workers layer. Added upsertBatch (bulk INSERT...ON CONFLICT), findLatestOpenTime (DESC LIMIT 1), source column tracking.
- Validation: all pass

## Outputs
- `workers/candle-collector/src/repository.ts` — DrizzleCandleRepository
- `Tokens.CandleRepository` — IoC token in packages/shared/di/tokens.ts
- `tests/integration/candle-repository.test.ts` — 7 integration tests
