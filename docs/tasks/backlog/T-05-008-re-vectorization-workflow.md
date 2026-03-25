# T-05-008 Re-vectorization workflow

## Goal
Implement a workflow that re-vectorizes all historical strategy events when a strategy version changes, creating a fresh vector table for the new version and replaying all stored events through the updated sandbox to produce correctly-dimensioned vectors.

## Why
A new strategy version may change feature dimensions (different indicators, different feature extractors), making existing vectors in the old version's table incompatible with the new version's similarity search. Without re-vectorization, the decision engine would compare apples to oranges or fail to find a usable vector table. Re-vectorization ensures that the new version's vector space is populated and consistent before live trading begins.

## Inputs
- T-05-002 `runBacktest`, `BacktestEngineDeps` — replay engine used to drive re-vectorization
- T-03-009 `migrateTable` — table migrator used to provision the new version's vector table
- `packages/core/vector/table-manager.ts` — vector table naming convention (`{strategyId}_{version}`)
- `packages/core/strategy/` — strategy sandbox for re-executing events
- `workers/strategy-worker/` — active version pointer update path
- Strategy events table — source of historical events to re-vectorize

## Dependencies
- T-05-002 (backtest replay engine — provides the event replay mechanism)
- T-03-009 (vector table migration utility — provisions new dimension-correct table)

## Expected Outputs
- `packages/backtest/re-vectorize.ts`
  - `ReVectorizeDeps` — DI interface:
    - `loadEvents(strategyId: string, version: number): Promise<StoredEvent[]>` — fetch all historical events for old version
    - `executeStrategy(event: StoredEvent): Promise<FeatureVector | null>` — run event through new version's sandbox
    - `storeVector(vector: FeatureVector, tableName: string): Promise<void>` — persist to new table
    - `migrateTable: typeof migrateTable` — injected table migrator
    - `updateActiveVersion(strategyId: string, newVersion: number): Promise<void>` — flip the live pointer
    - `log: (msg: string) => void` — progress logger
  - `ReVectorizeConfig` — `{ strategyId: string; oldVersion: number; newVersion: number; confirmed: true }`
  - `ReVectorizeResult` — `{ reVectorized: number; skipped: number; durationMs: number; newTableName: string }`
  - `runReVectorize(deps: ReVectorizeDeps, config: ReVectorizeConfig): Promise<ReVectorizeResult>`
- `packages/backtest/__tests__/re-vectorize.test.ts`
- Updated `packages/backtest/index.ts` barrel exports

## Deliverables
- `packages/backtest/re-vectorize.ts`
- `packages/backtest/__tests__/re-vectorize.test.ts`
- Updated `packages/backtest/index.ts`

## Constraints
- Re-vectorization must run offline / out-of-band — the live trading path (strategy-worker, decision-engine) must not be paused or blocked during re-vectorization
- `updateActiveVersion` is called only after all vectors are successfully stored in the new table — never mid-run
- Requires `{ confirmed: true }` in config (same safety gate pattern as T-03-009 `migrateTable`) — throw `ERR_REVECTORIZE_NOT_CONFIRMED` if absent
- If `executeStrategy` returns `null` for an event, that event is counted in `skipped` and not stored — not an error
- If `storeVector` throws, the error is propagated immediately and `updateActiveVersion` is not called
- Old version's vector table is not deleted by this workflow — archival is a separate operational concern
- `packages/backtest` may import from `@combine/core` and `@combine/shared` only — no Elysia, Drizzle, CCXT, or Slack imports
- All monetary/price values remain strings — no native float arithmetic

## Steps
1. Define `ReVectorizeDeps`, `ReVectorizeConfig`, `ReVectorizeResult`, `StoredEvent`, `FeatureVector` in `packages/backtest/re-vectorize.ts` stub (RED prerequisite)
2. Write failing tests in `packages/backtest/__tests__/re-vectorize.test.ts` (RED):
   - 5 historical events → `executeStrategy` called 5 times, `storeVector` called 5 times, `reVectorized: 5`
   - `executeStrategy` returns null for 2 events → `skipped: 2`, `storeVector` called 3 times
   - Missing `confirmed: true` → throws `ERR_REVECTORIZE_NOT_CONFIRMED` before any dep is called
   - `storeVector` throws → error propagated, `updateActiveVersion` never called
   - `updateActiveVersion` called exactly once with `newVersion` after all vectors stored
   - `migrateTable` called once with the correct new table name and `{ confirmed: true }`
   - `durationMs` is a positive number
   - `newTableName` matches the `{strategyId}_{newVersion}` naming convention
3. Implement `runReVectorize` in `packages/backtest/re-vectorize.ts` (GREEN)
4. Update `packages/backtest/index.ts` barrel exports
5. Refactor: extract `buildTableName(strategyId, version): string` pure helper

## Acceptance Criteria
- `updateActiveVersion` is never called if any `storeVector` call fails
- `updateActiveVersion` is called exactly once at the end of a successful run
- Events returning null from `executeStrategy` are silently skipped (counted in `skipped`, not `reVectorized`)
- Missing `{ confirmed: true }` throws before any side effect occurs
- `newTableName` in result uses `{strategyId}_{newVersion}` convention matching vector table manager
- Live trading path is not referenced or paused by this module
- All tests pass, zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test -- --filter "re-vectori"
bun run typecheck
bun run lint
```

## Out of Scope
- Scheduling or triggering re-vectorization automatically on version change (operational concern)
- Deletion or archival of old version vector tables
- UI or API endpoint for triggering re-vectorization
- Partial resume / checkpoint support (re-vectorization is assumed fast enough for full replay)
- HNSW REINDEX on the new table after population (see T-05-007)
