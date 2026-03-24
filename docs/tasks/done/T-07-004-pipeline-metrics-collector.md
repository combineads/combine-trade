# T-07-004 Pipeline metrics collector

## Goal
Implement an in-memory metrics collector for pipeline performance. Tracks latency histograms, error counts, and event counts per pipeline stage. Exposes a snapshot with p50/p95/p99 latency percentiles. Pure in-memory — no DB writes, no network calls.

## Why
EP07 M4 requires that pipeline latency, error rate, and worker status are continuously measured. The collector is the in-process accumulation layer: workers record observations into it, and a periodic flush (separate task) drains the snapshot to the DB. Keeping the collector pure and in-memory means it introduces zero latency to the hot path, is fully synchronous, and is trivially testable.

## Inputs
- EP07 M4 spec — latency histogram, error counter, event counter per stage, p50/p95/p99 snapshot
- EP07 M2 — per-stage timing as the source of latency observations (the collector receives `ms` values, not contexts)

## Dependencies
None.

## Expected Outputs
- `packages/shared/pipeline/metrics.ts`
  - `StageMetrics` interface: `{ latency: { p50: number; p95: number; p99: number; count: number }; errors: number; events: number }`
  - `MetricsSnapshot` interface: `{ stages: Record<string, StageMetrics>; capturedAt: number }`
  - `PipelineMetrics` class:
    - `recordLatency(stage: string, ms: number): void` — appends `ms` to the stage's latency sample list
    - `recordError(stage: string): void` — increments error counter for the stage
    - `recordEvent(stage: string): void` — increments event counter for the stage
    - `getSnapshot(): MetricsSnapshot` — computes p50/p95/p99 from sorted sample lists for each stage; returns `capturedAt: Date.now()`
    - `reset(): void` — clears all samples, counters, and stage entries
  - `computePercentile(sortedSamples: number[], percentile: number): number` — exported pure helper; returns 0 for empty arrays; uses nearest-rank method
- `packages/shared/pipeline/__tests__/metrics.test.ts`
- Updated `packages/shared/pipeline/index.ts` to export new types and class

## Deliverables
- `packages/shared/pipeline/metrics.ts`
- `packages/shared/pipeline/__tests__/metrics.test.ts`
- Updated `packages/shared/pipeline/index.ts`

## Constraints
- Pure in-memory only — no DB access, no network, no filesystem, no `setTimeout`
- `PipelineMetrics` is a plain class with no constructor arguments; instantiation: `new PipelineMetrics()`
- `computePercentile` uses the nearest-rank method: index = `Math.ceil((percentile / 100) * samples.length) - 1`, clamped to `[0, samples.length - 1]`
- `getSnapshot` must not mutate internal state — it reads and computes only
- `reset` clears all internal Maps and arrays to their initial empty state
- A stage that has never received any `recordLatency` call returns `{ p50: 0, p95: 0, p99: 0, count: 0 }` in the snapshot
- A stage that has only had `recordError` or `recordEvent` calls (but no latency) returns `count: 0` with zero percentiles, but correct `errors` and `events` counts
- `ms` values are assumed non-negative; no validation required (callers are responsible)
- `packages/shared/pipeline/metrics.ts` must not import Elysia, Drizzle, CCXT, or any package outside `packages/shared`
- All tests use `bun:test`

## Steps
1. Create `packages/shared/pipeline/metrics.ts` with class skeleton and `computePercentile` stub (RED anchor)
2. Write failing tests in `packages/shared/pipeline/__tests__/metrics.test.ts` (RED):
   - `computePercentile([], 50)` → `0`
   - `computePercentile([10], 50)` → `10`
   - `computePercentile([10, 20, 30], 50)` → `20`
   - `computePercentile([10, 20, 30, 40], 95)` → `40` (nearest-rank for 4 elements: ceil(3.8)-1 = 3)
   - `computePercentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 99)` → `100`
   - `new PipelineMetrics().getSnapshot()` → `{ stages: {}, capturedAt: <number> }`
   - `recordLatency("normalize", 10)` then `getSnapshot()` → stage `"normalize"` has `count: 1`, `p50: 10`, `p95: 10`, `p99: 10`
   - `recordLatency` called 100 times with values 1–100 → `p50` ≈ 50, `p95` ≈ 95, `p99` ≈ 99 (within ±1 of nearest-rank)
   - `recordError("normalize")` → snapshot shows `errors: 1` for that stage
   - `recordEvent("normalize")` three times → snapshot shows `events: 3`
   - Stage with only `recordError` (no latency) → `count: 0`, `p50: 0`, `errors: 1`
   - `getSnapshot` does not mutate internal state (call twice → same results if no new records)
   - `reset()` clears everything → subsequent `getSnapshot()` returns `{ stages: {} }`
   - Two independent `PipelineMetrics` instances do not share state
3. Implement `packages/shared/pipeline/metrics.ts` (GREEN)
4. Update `packages/shared/pipeline/index.ts` with new exports
5. Refactor: add JSDoc to `PipelineMetrics`, `computePercentile`, and all public methods

## Acceptance Criteria
- `computePercentile` uses nearest-rank method and returns 0 for empty input
- `getSnapshot` correctly computes p50/p95/p99 for 100-sample inputs with ±1 tolerance
- `getSnapshot` does not mutate internal state
- `reset` returns all counters and sample lists to empty
- Separate `PipelineMetrics` instances are fully isolated
- All 14 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/pipeline/__tests__/metrics.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- DB flush / persistence (separate task, EP07 M4)
- Gauge metrics (memory, CPU)
- Metrics exposition in Prometheus format
- Worker heartbeat tracking (health aggregation in EP07 M4)
- Thread-safety / concurrent write protection (Bun workers are single-threaded per process)
- Sliding window / time-bucketed histograms
