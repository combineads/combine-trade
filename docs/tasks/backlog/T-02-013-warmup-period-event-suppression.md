# T-02-013 Warm-up period event suppression

## Goal
Suppress strategy events during the warm-up period in both real-time and backtest modes so that unreliable signals generated before indicators have sufficient data are never vectorized or acted upon.

## Why
Strategies need N candles for indicator warm-up. Events emitted before warm-up completes are based on partial indicator windows and produce vectors that distort the similarity search. Both the real-time strategy-worker and the backtest replay engine must apply the same suppression logic to keep vector quality consistent across execution paths.

## Inputs
- `packages/core/strategy/warmup.ts` — warm-up detection from T-02-008
- `packages/core/strategy/api.ts` — sandbox context and strategy API
- `workers/strategy-worker/` — real-time worker that processes candle_closed events
- `packages/backtest/engine.ts` — replay engine that drives strategy execution during backtest
- EP02 M5 spec (warm-up period handling)

## Dependencies
- T-02-008 (multi-timeframe access and warm-up period handling — defines warm-up detection infrastructure)

## Expected Outputs
- Updated `packages/core/strategy/sandbox.ts` (or equivalent context module)
  - `warmupComplete: boolean` flag surfaced on the sandbox execution context
  - Candle counter incremented on each execution tick
  - Event emission blocked when `warmupComplete === false`
- Updated `workers/strategy-worker/` handler
  - Logs warm-up progress: `"warm-up in progress (N/M bars)"` at INFO level
  - Logs `"warm-up complete"` once suppression lifts
- Updated `packages/backtest/engine.ts`
  - Honours warm-up suppression when replaying candles (events produced during warm-up not added to result)
- `packages/core/strategy/__tests__/warmup-suppression.test.ts`
- `packages/backtest/__tests__/warmup-suppression.test.ts`

## Deliverables
- Updated `packages/core/strategy/sandbox.ts` (or context module)
- Updated `workers/strategy-worker/` handler module
- Updated `packages/backtest/engine.ts`
- `packages/core/strategy/__tests__/warmup-suppression.test.ts`
- `packages/backtest/__tests__/warmup-suppression.test.ts`

## Constraints
- `warmupComplete` flag must be derived from candle count vs. required warm-up period — not from wall clock time
- Required warm-up period comes from the existing `calculateWarmupPeriod` (or equivalent) from T-02-008
- Suppression must be stateless across restarts: candle count resets to 0 on worker restart; warm-up re-applies
- No events may be emitted (and no vectors may be stored) for candles processed during warm-up
- Strategy code must not be able to observe or override the `warmupComplete` flag directly
- Warm-up logging must not be emitted on every candle — only at the first candle and when complete
- Must work for both the real-time path (strategy-worker) and the backtest replay path (engine)
- No changes to the public Strategy API shape visible to user-authored strategy code

## Steps
1. Write failing tests for real-time suppression in `packages/core/strategy/__tests__/warmup-suppression.test.ts` (RED):
   - Strategy with warm-up period 5 → candles 1–5 produce no events; candle 6 produces events
   - `warmupComplete` flag transitions from `false` to `true` exactly at candle N+1
   - Event emitted on candle 1 of 1 (warm-up period = 1) is included (edge case)
2. Implement `warmupComplete` tracking in sandbox context (GREEN)
3. Block event emission path when `warmupComplete === false`
4. Write failing tests for backtest suppression in `packages/backtest/__tests__/warmup-suppression.test.ts` (RED):
   - Replay 10 candles with warm-up period 3 → `BacktestResult.events` omits events from candles 1–3
   - `BacktestResult.totalCandles` still equals 10 (warm-up candles counted, not skipped)
5. Update `packages/backtest/engine.ts` to suppress warm-up events (GREEN)
6. Add warm-up progress and completion log lines to strategy-worker handler
7. Export `warmupComplete` status from sandbox context for worker-level logging
8. Refactor: extract `createWarmupTracker(period: number)` helper used by both paths

## Acceptance Criteria
- A strategy with warm-up period N emits zero events for the first N candles in both real-time and backtest modes
- `BacktestResult.totalCandles` is not reduced by warm-up suppression — all candles are counted
- `BacktestResult.events` contains only post-warm-up events
- Strategy-worker logs `"warm-up in progress (N/M bars)"` on the first warm-up candle
- Strategy-worker logs `"warm-up complete"` when suppression lifts
- Warm-up period = 1 edge case: first candle events are suppressed, second candle events are included
- No TypeScript errors, no lint warnings

## Validation
```bash
bun test -- --filter "warmup"
bun run typecheck
bun run lint
```

## Out of Scope
- Persistent warm-up state across worker restarts (warm-up always re-applies after restart)
- Dynamic warm-up period changes mid-run (version change triggers new worker instance)
- UI display of warm-up status
- Warm-up for labeler or vector workers (only strategy event emission is suppressed here)
