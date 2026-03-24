# T-05-002 Backtest replay engine core

## Goal
Implement the core replay loop that iterates candles sequentially, executes a strategy sandbox callback for each candle, and collects raw events. Supports checkpoint save/resume every N events so that long-running backtests survive failures without restarting from scratch.

## Why
The replay engine is the backbone of the backtest pipeline. All downstream steps (labeling, statistics, report) depend on the ordered stream of events it produces. Keeping the core engine free of labeling and statistics logic ensures each concern can be tested and replaced independently.

## Inputs
- T-05-001 `parseBinanceVisionCsv` output — `Candle[]` passed as input data
- EP05 M2 spec (backtest replay engine, look-ahead bias prevention, checkpoint system)
- `packages/backtest/package.json` (existing package skeleton)
- Candle type from `@combine/candle`

## Dependencies
- T-05-001 (CSV parser — defines `Candle[]` input shape)

## Expected Outputs
- `packages/backtest/types.ts`
  - `BacktestEvent` — one emitted event: `{ eventId, strategyId, version, symbol, exchange, timeframe, entryPrice, direction, openTime, candleIndex }`
  - `BacktestCheckpoint` — serialisable state: `{ lastCandleIndex, events: BacktestEvent[], startedAt }`
  - `BacktestEngineDeps` — DI interface for all external operations
  - `BacktestConfig` — engine configuration: `{ checkpointEveryN?, onProgress? }`
  - `BacktestResult` — engine return: `{ events, totalCandles, durationMs }`
- `packages/backtest/engine.ts`
  - `runBacktest(candles: Candle[], deps: BacktestEngineDeps, config?: BacktestConfig): Promise<BacktestResult>`
  - `createCheckpoint(state): BacktestCheckpoint`
  - `resumeFromCheckpoint(candles, checkpoint, deps, config): Promise<BacktestResult>`
- `packages/backtest/__tests__/engine.test.ts`

## Deliverables
- `packages/backtest/types.ts`
- `packages/backtest/engine.ts`
- `packages/backtest/__tests__/engine.test.ts`

## Constraints
- `BacktestEngineDeps` must define interfaces (not concrete classes) for:
  - `executeStrategy(candle: Candle): Promise<StrategyOutput | null>` — returns null if no event emitted
  - `saveCheckpoint(checkpoint: BacktestCheckpoint): Promise<void>`
  - `loadCheckpoint(): Promise<BacktestCheckpoint | null>`
- `StrategyOutput` (in `types.ts`): `{ entryPrice: string; direction: "long" | "short" }`
- Candles are processed strictly in ascending `openTime` order — engine must sort before iterating
- Look-ahead bias: engine must NOT expose future candles to `executeStrategy`. Only the single current candle is passed.
- Checkpoint frequency default: every 1000 events (not candles)
- `onProgress` callback signature: `(processed: number, total: number) => void`
- `packages/backtest` may import from `@combine/candle` and `@combine/shared`
- No direct imports of Elysia, Drizzle, CCXT, or Slack in `packages/backtest`
- All monetary string values (prices) must remain strings — no native float arithmetic

## Steps
1. Create `packages/backtest/types.ts` with all interfaces listed above (RED prerequisite)
2. Write failing tests in `packages/backtest/__tests__/engine.test.ts` (RED):
   - 5 candles, strategy emits event on candle 2 and 4 → `events.length === 2`
   - Strategy that always returns null → `events.length === 0`
   - Candles out of order → engine sorts and processes in correct sequence
   - Checkpoint saved after every N events (mock `saveCheckpoint` call count)
   - `resumeFromCheckpoint` skips already-processed candles (by `candleIndex`), continues from checkpoint
   - `onProgress` called for each candle with correct `(processed, total)` values
   - `durationMs` is positive
3. Implement `packages/backtest/engine.ts` (GREEN)
4. Update `packages/backtest/index.ts` barrel exports
5. Refactor: extract `sortCandles`, `shouldCheckpoint` helpers

## Acceptance Criteria
- Events are emitted only for candles where `executeStrategy` returns non-null
- `events` array preserves order matching candle sequence
- Candle order is normalised to ascending `openTime` before processing
- `saveCheckpoint` called after every `checkpointEveryN` events (default 1000)
- `resumeFromCheckpoint`: resumes from `lastCandleIndex + 1`, does not reprocess earlier candles
- `onProgress` receives `(1, N)`, `(2, N)`, ..., `(N, N)` across candle iterations
- No future candle data leaked into `executeStrategy` call
- `BacktestResult.totalCandles` equals input `candles.length`

## Validation
```bash
bun test packages/backtest/__tests__/engine.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Strategy sandbox implementation (mocked via `BacktestEngineDeps`)
- Vector storage / normalization (T-05-003 integrates these)
- Label computation (T-05-003)
- Statistics report (T-05-004)
- HNSW REINDEX trigger (post-backtest step, future task)
- Partial state recovery cleanup utility
