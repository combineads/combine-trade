# T-07-009 Pipeline latency benchmark

## Goal
Implement a pipeline latency benchmark harness that injects synthetic `candle_closed` events through a mock 5-stage pipeline, measures per-stage and end-to-end latency, and asserts that p99 end-to-end latency is below 1000 ms.

## Why
The system has a hard SLA: candle close → decision must complete within 1 second. Unit tests for individual pipeline modules cannot verify this end-to-end constraint because they do not compose all stages under realistic load. A dedicated benchmark provides a reproducible, assertable check that the full pipeline envelope stays within budget and catches regressions before they reach production.

## Inputs
- T-07-005 `createCorrelationContext`, `startStage`, `endStage`, `getStageDurationMs`, `getPipelineLatencyMs` from `packages/shared/pipeline` — timing primitives used to measure each stage
- T-07-004 `PipelineMetrics`, `computePercentile` from `packages/shared/pipeline` — accumulates latency samples and computes percentiles
- EP07 M4 latency budget spec: p99 < 1000 ms end-to-end

## Dependencies
- T-07-005 (pipeline integration test — confirms the timing and metrics APIs compose correctly; benchmark builds on the same composition pattern)

## Expected Outputs
- `packages/shared/pipeline/__tests__/latency-benchmark.test.ts`
  - `simulatePipelineEvent(stages: string[], stageDelayMs: Record<string, number>): Promise<number>` — drives one synthetic event through all stages using correlation + timing APIs, returns total pipeline latency in ms
  - Benchmark cases with p50/p95/p99 assertions
  - JSON benchmark report written to `packages/shared/pipeline/latency-benchmark-report.json` after each run
- `packages/shared/pipeline/latency-benchmark-report.json` (generated artifact, gitignored)

## Deliverables
- `packages/shared/pipeline/__tests__/latency-benchmark.test.ts`
- `.gitignore` entry for `packages/shared/pipeline/latency-benchmark-report.json`

## Constraints
- No real workers, no real DB, no real network — stages are simulated with `stageDelayMs` sleeps via `Bun.sleep`
- `stageDelayMs` is injected per stage so benchmark cases can model realistic vs. degraded conditions
- Benchmark must drive at least 200 events per case to produce statistically meaningful p99 estimates
- Realistic payload: each event carries a `symbol` (string), `openTime` (number), `close` (string Decimal), `correlationId` (uuid) — no actual candle processing, just the metadata
- p99 assertion threshold: 1000 ms end-to-end (sum of all stage delays + overhead)
- p50 assertion threshold for fast case (all stages 0 ms delay): p50 < 10 ms (overhead only)
- Memory: heap delta across 200 events must be < 50 MB
- Report JSON schema: `{ runAt: string; cases: Array<{ name, events, p50Ms, p95Ms, p99Ms, heapDeltaMb, passed: boolean }> }`
- Report written with `Bun.write` in `afterAll`
- Large cases (realistic 5-stage delays summing to ~800 ms) use `test.skip` unless `BENCHMARK_LATENCY=1` env var is set — avoids 200 × 800 ms = 160 s run in CI
- All tests use `bun:test`

## Steps
1. Implement `simulatePipelineEvent(stages, stageDelayMs)` as a module-private helper:
   - Creates a fresh `CorrelationContext` per event
   - Iterates stages: `startStage` → `Bun.sleep(stageDelayMs[stage] ?? 0)` → `endStage`
   - Returns `getPipelineLatencyMs(finalCtx)`
2. Write benchmark test cases (RED):
   - **Case A — zero-delay (200 events, all stages 0 ms)**: assert p50 < 10 ms, p99 < 50 ms, heapDeltaMb < 50
   - **Case B — fast path (200 events, stages: candle=5ms, strategy=50ms, vector=100ms, decision=20ms, alert=10ms = 185ms total)**: assert p99 < 500 ms
   - **Case C — realistic SLA (200 events, stages: candle=10ms, strategy=100ms, vector=200ms, decision=50ms, alert=30ms = 390ms total)**: `test.skip` unless `BENCHMARK_LATENCY=1`; assert p99 < 1000 ms
   - **Case D — degraded (200 events, vector=800ms)**: `test.skip` unless `BENCHMARK_LATENCY=1`; assert p99 > 800 ms (validates that the benchmark actually measures latency)
3. Accumulate latency samples into a `PipelineMetrics` instance; extract p50/p95/p99 via `computePercentile`
4. Write benchmark report to `packages/shared/pipeline/latency-benchmark-report.json` in `afterAll`
5. Add report file to root `.gitignore`
6. Refactor: extract `runBenchmarkCase(name, events, stages, delays)` helper

## Acceptance Criteria
- Case A passes: zero-delay overhead is p50 < 10 ms and p99 < 50 ms
- Case B passes: 185 ms realistic fast path is p99 < 500 ms
- Case C (when enabled): 390 ms realistic path is p99 < 1000 ms (SLA satisfied)
- Case D (when enabled): p99 > 800 ms (benchmark sensitivity confirmed)
- `latency-benchmark-report.json` written with all 4 case entries and correct schema
- `latency-benchmark-report.json` listed in `.gitignore`
- Each event uses a fresh `CorrelationContext` — no shared mutable state between events
- No TypeScript errors, no lint warnings

## Validation
```bash
bun test -- --filter "latency-benchmark"
bun run typecheck
bun run lint
```

## Out of Scope
- Benchmarking with real PostgreSQL vector search (network latency excluded)
- Profiling individual function call costs within a stage
- Continuous latency monitoring in production (alerting concern)
- Measuring worker-to-worker queue transit time (only in-process stage latency measured)
- Comparison across git commits (CI trend tracking)
