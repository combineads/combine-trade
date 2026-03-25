# T-07-008 Metrics DB flush

## Goal
Implement a periodic flush service that drains in-memory pipeline metrics snapshots to a `pipeline_metrics` database table on a 60-second interval, with a 30-day retention policy and a non-blocking cleanup job.

## Why
The in-memory `PipelineMetrics` collector from T-07-004 provides zero-overhead measurement on the hot path but has no persistence — snapshots are lost on worker restart. Without DB flush, historical latency trends, error rates, and throughput data are unavailable for dashboards and post-incident analysis. Persisting snapshots at a coarse interval (60 s) keeps storage growth bounded while preserving sufficient granularity for operational review.

## Inputs
- T-07-004 `PipelineMetrics`, `MetricsSnapshot`, `StageMetrics` from `packages/shared/pipeline`
- `packages/core/db/` — Drizzle schema and connection patterns (reference for migration style)
- EP07 M4 spec — metrics flush, retention policy

## Dependencies
- T-07-004 (pipeline metrics collector — defines the snapshot shape that is flushed)

## Expected Outputs
- `packages/core/db/schema/pipeline-metrics.ts` — Drizzle table definition
  - `pipeline_metrics` table: `id` (serial PK), `capturedAt` (timestamp), `stage` (text), `p50` (numeric), `p95` (numeric), `p99` (numeric), `count` (integer), `errors` (integer), `events` (integer)
- `packages/core/db/migrations/` — generated migration file (via `bun run db:generate`)
- `packages/shared/pipeline/metrics-flush.ts`
  - `MetricsFlushDeps` — DI interface:
    - `getSnapshot(): MetricsSnapshot` — pull current snapshot from `PipelineMetrics`
    - `resetMetrics(): void` — clear collector after flush
    - `batchInsert(rows: MetricsRow[]): Promise<void>` — write rows to DB
    - `deleteOlderThan(cutoffMs: number): Promise<number>` — delete rows older than cutoff, return count deleted
    - `now(): number` — injectable clock (`Date.now` in production)
  - `MetricsRow` — `{ capturedAt: number; stage: string; p50: number; p95: number; p99: number; count: number; errors: number; events: number }`
  - `MetricsFlushService` class:
    - `constructor(deps: MetricsFlushDeps, intervalMs?: number, retentionMs?: number)`
    - `start(): void` — schedules flush loop via `setInterval`; idempotent (second call is a no-op)
    - `stop(): void` — clears the interval; idempotent
    - `flush(): Promise<void>` — public, callable directly for testing; performs snapshot → rows → batchInsert → resetMetrics
    - `runRetentionCleanup(): Promise<number>` — deletes rows older than `retentionMs` (default 30 days), returns count deleted
- `packages/shared/pipeline/__tests__/metrics-flush.test.ts`
- Updated `packages/shared/pipeline/index.ts` barrel exports

## Deliverables
- `packages/core/db/schema/pipeline-metrics.ts`
- `packages/shared/pipeline/metrics-flush.ts`
- `packages/shared/pipeline/__tests__/metrics-flush.test.ts`
- Updated `packages/shared/pipeline/index.ts`

## Constraints
- `flush()` must be fire-and-forget from the interval perspective: the `setInterval` callback calls `flush()` without `await` — failures are logged but do not crash the worker
- `flush()` itself is `async` and awaitable for direct calls (testing, graceful shutdown)
- `resetMetrics()` is called only after `batchInsert` resolves successfully — a failed insert does not clear the collector
- `batchInsert` receives one row per stage in the snapshot; stages with `count: 0` and `errors: 0` and `events: 0` are omitted from the batch (no-op stages not written to DB)
- Default `intervalMs` = 60_000 (60 seconds); default `retentionMs` = 30 * 24 * 60 * 60 * 1000 (30 days)
- `start()` called twice must not create two intervals — second call is a silent no-op
- `runRetentionCleanup()` must not be called from within the flush interval automatically — callers schedule it separately (e.g., daily cron in supervisor)
- `packages/shared/pipeline/metrics-flush.ts` must not import Drizzle, Elysia, CCXT, or Slack — all DB access via `MetricsFlushDeps.batchInsert`
- All tests use `bun:test` with in-memory mock deps (no real DB)
- `packages/core/db/schema/pipeline-metrics.ts` may import Drizzle ORM

## Steps
1. Define `MetricsRow`, `MetricsFlushDeps` types and `MetricsFlushService` class skeleton in `packages/shared/pipeline/metrics-flush.ts` (RED prerequisite)
2. Write failing tests in `packages/shared/pipeline/__tests__/metrics-flush.test.ts` (RED):
   - `flush()` calls `getSnapshot()` once, `batchInsert` once with correct rows, `resetMetrics()` once
   - Snapshot with 3 active stages → `batchInsert` receives 3 rows with correct field mapping
   - Snapshot stage with `count: 0`, `errors: 0`, `events: 0` → that stage row omitted from batch
   - `batchInsert` throws → `resetMetrics()` not called
   - `start()` called twice → only one interval active (mock `setInterval` call count = 1)
   - `stop()` clears the interval (mock `clearInterval` called once)
   - `runRetentionCleanup()` calls `deleteOlderThan` with `now() - retentionMs`
   - `runRetentionCleanup()` returns the count from `deleteOlderThan`
3. Implement `MetricsFlushService` (GREEN)
4. Create `packages/core/db/schema/pipeline-metrics.ts` Drizzle table definition
5. Update `packages/shared/pipeline/index.ts` barrel exports
6. Refactor: extract `snapshotToRows(snapshot: MetricsSnapshot): MetricsRow[]` pure helper

## Acceptance Criteria
- `flush()` omits stages where all of `count`, `errors`, `events` are zero
- `resetMetrics()` not called when `batchInsert` rejects
- `start()` idempotent: two calls produce exactly one active interval
- `stop()` idempotent: two calls do not throw
- `runRetentionCleanup()` passes `now() - retentionMs` (default 30 days in ms) to `deleteOlderThan`
- Drizzle schema defines all required columns with correct types
- All tests pass, zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test -- --filter "metrics-flush"
bun run typecheck
bun run lint
```

## Out of Scope
- Prometheus metrics exposition
- Gauge metrics (CPU, memory)
- Real-time streaming of metrics to a dashboard
- Per-symbol or per-strategy breakdown in the metrics table
- Automatic scheduling of `runRetentionCleanup` (supervisor concern)
- Thread-safety for concurrent flush calls (Bun workers are single-threaded)
