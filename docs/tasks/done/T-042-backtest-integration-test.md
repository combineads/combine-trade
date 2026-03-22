# T-042 Backtest integration test

## Goal
Write end-to-end integration tests that validate the complete backtest pipeline: CSV parsing → replay engine → labeling → statistics report. Uses fixture candle data and a mock strategy sandbox. Verifies mathematical correctness of the full chain and absence of look-ahead bias.

## Why
Unit tests verify each module in isolation. This integration test catches wiring bugs, interface mismatches, and data flow errors that only appear when the modules are composed. It also serves as a living specification of the expected pipeline behaviour.

## Inputs
- T-038 `parseBinanceVisionCsv` — CSV → Candle[]
- T-039 `runBacktest`, `BacktestEngineDeps`, `BacktestResult` — replay engine
- T-040 `labelBacktestEvent`, `ResultConfig` — inline labeler
- T-041 `computeReport`, `LabeledEvent`, `BacktestReport` — statistics report
- T-035 `LabelResult` — label type
- T-037 integration test as structural reference (`tests/integration/label-decision.test.ts`)

## Dependencies
- T-039 (replay engine)
- T-040 (labeler integration)
- T-041 (statistics report)

## Expected Outputs
- `tests/integration/backtest-pipeline.test.ts`

## Deliverables
- `tests/integration/backtest-pipeline.test.ts`

## Constraints
- No real database or network calls — all external deps mocked via `BacktestEngineDeps`
- Fixture CSV string defined inline in the test file (30+ candle rows for cold start coverage)
- Mock strategy emits an event on every 5th candle (deterministic, predictable event count)
- `saveCheckpoint` and `loadCheckpoint` use an in-memory store (plain object closure)
- All assertions must use exact equality or computed expected values — no "approximately" checks for counts
- Mathematical assertions on `winrate`, `expectancy`, `maxConsecutiveLoss` must be manually computed against the fixture and hardcoded in the test
- `packages/backtest` must not import Elysia, Drizzle, or CCXT — verify by checking that the test file's import graph only touches allowed packages

## Steps
1. Create fixture CSV string with 50 BTCUSDT 1m candles (deterministic prices that trigger known TP/SL outcomes for LONG strategy):
   - Candles 0-4: rising, candle 5 triggers TP for event at candle 5 → WIN
   - Candles 5-9: flat, candle 10 triggers SL for event at candle 10 → LOSS
   - Candles 10-44: mix of WIN/LOSS/TIME_EXIT as needed for 10 events total (mock emits on every 5th candle: 0, 5, 10, 15, 20, 25, 30, 35, 40, 45)
2. Write tests (RED):

   **Test A — Full pipeline produces correct event count**
   - Parse CSV → 50 candles
   - Run `runBacktest` with mock that emits on every 5th candle → `result.events.length === 10`
   - `result.totalCandles === 50`

   **Test B — Labels computed for all events**
   - Label each event with `labelBacktestEvent` using `resultConfig = { tpPct: 1.0, slPct: 0.5, maxHoldBars: 10 }`
   - All 10 events have a `LabelResult` with defined `resultType`
   - Manually verify the first event's label matches expected TP/SL outcome from fixture prices

   **Test C — Statistics report correctness**
   - Call `computeReport` with all 10 labeled events
   - `report.totalEvents === 10`
   - `report.winrate` matches manually computed value from fixture outcomes
   - `report.expectancy` matches `winrate * avgWin - (1 - winrate) * avgLoss`
   - `report.coldStartEvents === 10` (fewer than 30 total events → cold start covers all)
   - `report.coldStartEndTime === null` (never reached 30 samples)

   **Test D — Checkpoint save/resume**
   - Run backtest with `checkpointEveryN = 3` → `saveCheckpoint` called at least 3 times (10 events / 3 = 3+ checkpoints)
   - Load last checkpoint and resume from it → `resumeFromCheckpoint` returns same final events (no duplicates)

   **Test E — Look-ahead bias: forward candles never include event candle**
   - Instrument `labelBacktestEvent` calls to capture `fromIndex` values
   - For each labeled event, verify `forwardCandles[0].open` does NOT equal `allCandles[event.candleIndex].open`
   - i.e. forward slice starts at `event.candleIndex + 1`, not at `event.candleIndex`

   **Test F — Empty candle list**
   - `runBacktest([], deps)` → `result.events.length === 0`, `result.totalCandles === 0`, no crash

3. Implement minimal test helpers (fixture builder, mock deps factory) in the same file
4. Run full project validation

## Acceptance Criteria
- All 6 tests pass
- `result.events.length === 10` for the 50-candle / every-5th fixture
- `report.winrate` and `report.expectancy` match manually verified values
- `saveCheckpoint` call count matches `Math.floor(events / checkpointEveryN)`
- Resume produces identical events to a fresh run
- No candle at `event.candleIndex` appears in the forward scan slice
- `bun test && bun run typecheck` both pass (project-wide clean)

## Validation
```bash
bun test tests/integration/backtest-pipeline.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Real pgvector integration
- Vector normalization / storage (not part of the replay engine core)
- Performance benchmarks (< 5 min for 3yr run — separate task)
- HNSW REINDEX trigger
- Strategy sandbox execution (mocked)
- Downloading real Binance Vision archives
