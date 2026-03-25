# T-05-009 Backtest performance benchmark

## Goal
Implement a reproducible performance benchmark suite that measures backtest replay throughput (events/sec), memory usage, and total wall-clock time, and asserts that a 3-year dataset completes within the 5-minute target.

## Why
The backtest pipeline must handle large datasets (3 years of 1-minute candles ≈ 1.57M candles) within an acceptable time budget to be operationally useful. Without a benchmark, regressions in replay speed go undetected. A reproducible benchmark (fixed seed, deterministic fixture data) enables meaningful comparison across code changes and catches performance regressions in CI.

## Inputs
- T-05-002 `runBacktest`, `BacktestEngineDeps`, `BacktestConfig`, `BacktestResult` from `packages/backtest`
- `packages/backtest/__tests__/` — existing test patterns for fixture setup
- Bun's `performance.now()` for wall-clock timing
- `process.memoryUsage()` for heap measurement

## Dependencies
- T-05-002 (backtest replay engine — the subject under benchmark)

## Expected Outputs
- `packages/backtest/__tests__/benchmark.test.ts`
  - Deterministic candle fixture generator: `generateCandles(count: number, seed?: number): Candle[]`
  - Benchmark cases with assertions on throughput and memory
  - JSON benchmark report written to `packages/backtest/benchmark-report.json` after each run
- `packages/backtest/benchmark-report.json` (generated artifact, gitignored)

## Deliverables
- `packages/backtest/__tests__/benchmark.test.ts`
- `.gitignore` entry for `packages/backtest/benchmark-report.json`

## Constraints
- Benchmark data must be fully deterministic: `generateCandles` uses a seeded linear-congruential PRNG — same seed always produces same candle sequence
- No real DB, no real network — `BacktestEngineDeps` satisfied by in-memory mocks
- `executeStrategy` mock must do non-trivial work (at least one array allocation per call) to avoid JIT elision
- Strategy emits an event on every 10th candle (10% event rate) — realistic density assumption
- 3-year target: 1_577_836 candles (365.25 days × 24h × 60min, rounded) processed in < 300 seconds (5 min)
- Small benchmark (10_000 candles) must complete in < 2 seconds — used as fast smoke check in CI
- Memory assertion: heap increase during small benchmark must be < 100 MB
- Benchmark report JSON schema: `{ runAt: string; cases: Array<{ name, candles, eventsEmitted, durationMs, eventsPerSec, heapDeltaMb, passed: boolean }> }`
- Report is written with `Bun.write` — no Drizzle, no network
- All tests use `bun:test`; benchmark cases use `test.skip` for the 3-year case in CI unless `BENCHMARK_FULL=1` env var is set

## Steps
1. Implement `generateCandles(count, seed?)` as a module-private helper in `benchmark.test.ts`:
   - Produces `Candle[]` with monotonically increasing `openTime` (1-minute steps from a fixed epoch)
   - OHLCV values derived from PRNG to avoid trivially identical candles
2. Write benchmark test cases (RED — assertions will initially fail until thresholds are verified):
   - **Case A — small (10_000 candles)**: assert `durationMs < 2_000`, `heapDeltaMb < 100`
   - **Case B — medium (100_000 candles)**: assert `eventsPerSec > 50_000`
   - **Case C — large / 3yr (1_577_836 candles)**: `test.skip` unless `BENCHMARK_FULL=1`; assert `durationMs < 300_000`
3. Implement benchmark harness:
   - Record `heapUsed` before and after via `process.memoryUsage()`
   - Compute `eventsPerSec = eventsEmitted / (durationMs / 1000)`
   - Accumulate case results into report array
4. Write benchmark report to `packages/backtest/benchmark-report.json` using `Bun.write` in an `afterAll` hook
5. Add `packages/backtest/benchmark-report.json` to root `.gitignore`
6. Refactor: extract `runBenchmarkCase(name, candles, config)` helper to reduce test body repetition

## Acceptance Criteria
- `generateCandles(10_000, 42)` always produces the same sequence (seed determinism)
- Case A passes: 10_000-candle replay completes in < 2 s with heap delta < 100 MB
- Case B passes: 100_000-candle replay sustains > 50_000 events/sec
- Case C is skipped by default; when `BENCHMARK_FULL=1`, 3yr replay completes in < 300 s
- `benchmark-report.json` is written and contains all three cases with correct schema
- `benchmark-report.json` is listed in `.gitignore`
- No TypeScript errors, no lint warnings

## Validation
```bash
bun test -- --filter "benchmark"
bun run typecheck
bun run lint
```

## Out of Scope
- Profiling or flame-graph generation
- Comparison across git commits (CI trend tracking)
- Benchmarking labeler, statistics, or report stages (only the replay engine is the subject here)
- Benchmarking with a real PostgreSQL vector store
- Warm-up period suppression interaction (mocked strategy always returns deterministically)
