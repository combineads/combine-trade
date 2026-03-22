# T-048 Pipeline correlation ID and timing

## Goal
Implement a correlation ID generator and pipeline timing tracker as pure functions with no I/O or external dependencies. Provides the foundation for tracing a single candle event through every stage of the pipeline and measuring per-stage latency.

## Why
EP07 M2 requires that every event from candle close to alert/execution carries a correlation ID so the full flow can be reconstructed from logs. Per-stage timing is required to enforce the < 1 second p99 latency budget and to surface which stage is the bottleneck. Keeping this as pure functions in `packages/shared` makes it importable by every worker without creating circular dependencies.

## Inputs
- EP07 M2 spec — correlation ID propagation, per-stage latency logging
- `packages/shared/index.ts` — existing barrel export to extend
- Existing `packages/shared/` module patterns (errors, di, event-bus) as structural reference

## Dependencies
None.

## Expected Outputs
- `packages/shared/pipeline/correlation.ts`
  - `CorrelationContext` interface: `{ correlationId: string; startedAt: number; stages: Map<string, { startMs: number; endMs: number | null }> }`
  - `generateCorrelationId(): string` — returns a UUID v4 string; no external lib (use `crypto.randomUUID()`)
  - `startStage(ctx: CorrelationContext, name: string): CorrelationContext` — records `startMs: Date.now()`, `endMs: null` for the named stage; returns new context (immutable)
  - `endStage(ctx: CorrelationContext, name: string): CorrelationContext` — fills `endMs: Date.now()` for the named stage; throws if stage was never started; returns new context (immutable)
  - `getStageDurationMs(ctx: CorrelationContext, name: string): number` — returns `endMs - startMs`; throws if stage not ended
  - `getPipelineLatencyMs(ctx: CorrelationContext): number` — returns `Date.now() - ctx.startedAt`
  - `createCorrelationContext(): CorrelationContext` — convenience factory that calls `generateCorrelationId()` and sets `startedAt: Date.now()`
- `packages/shared/pipeline/__tests__/correlation.test.ts`

## Deliverables
- `packages/shared/pipeline/correlation.ts`
- `packages/shared/pipeline/__tests__/correlation.test.ts`
- `packages/shared/pipeline/index.ts` barrel export for the pipeline module
- Updated `packages/shared/index.ts` to re-export from `./pipeline/index.js`

## Constraints
- Pure functions only — no I/O, no network, no DB, no filesystem
- No external dependencies — only Node.js/Bun built-ins (`crypto.randomUUID`)
- `generateCorrelationId()` must use `crypto.randomUUID()` — not `Math.random()`
- Context is treated as immutable: `startStage` and `endStage` return new `CorrelationContext` values (shallow clone with new `Map`)
- `endStage` on a stage that was never started must throw `Error` with a message containing the stage name
- `getStageDurationMs` on a stage whose `endMs` is `null` must throw `Error` with a message containing the stage name
- `packages/shared/pipeline` must not import from Elysia, Drizzle, CCXT, or any package outside `packages/shared`
- All tests use `bun:test` (`import { describe, it, expect } from "bun:test"`)

## Steps
1. Create `packages/shared/pipeline/correlation.ts` with the `CorrelationContext` interface and all function stubs that throw `"not implemented"` (RED anchor)
2. Write failing tests in `packages/shared/pipeline/__tests__/correlation.test.ts` (RED):
   - `generateCorrelationId()` returns a string matching UUID v4 format (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`)
   - `generateCorrelationId()` called twice returns different strings
   - `createCorrelationContext()` returns context with a valid `correlationId`, `startedAt` close to `Date.now()`, and empty `stages` map
   - `startStage` adds stage entry with `startMs` set and `endMs === null`; original context is unchanged (immutability)
   - `endStage` sets `endMs` for the stage; original context is unchanged (immutability)
   - `endStage` on an unstarted stage throws with the stage name in the message
   - `getStageDurationMs` returns correct `endMs - startMs` value
   - `getStageDurationMs` on a stage with `endMs === null` throws with the stage name in the message
   - `getPipelineLatencyMs` returns a non-negative number
   - Full sequence: `createCorrelationContext → startStage("normalize") → endStage("normalize") → getStageDurationMs` returns a number >= 0
3. Implement all functions in `packages/shared/pipeline/correlation.ts` (GREEN)
4. Create `packages/shared/pipeline/index.ts` barrel exporting all types and functions
5. Add `export * from "./pipeline/index.js";` to `packages/shared/index.ts`
6. Refactor: add JSDoc to each exported function and interface

## Acceptance Criteria
- `generateCorrelationId()` always returns a valid UUID v4 string
- Two consecutive calls to `generateCorrelationId()` never return the same value
- `startStage` and `endStage` are immutable — the original `CorrelationContext` is never mutated
- `endStage` on an unstarted stage throws with the stage name in the error message
- `getStageDurationMs` on a not-yet-ended stage throws with the stage name in the error message
- Full timing sequence produces `getStageDurationMs >= 0`
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/pipeline/__tests__/correlation.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Distributed tracing integration (OpenTelemetry, Jaeger)
- Persistent correlation ID storage in DB
- Log emission (callers log the context — this module only produces it)
- Worker-to-worker ID propagation over the event bus (done in the event payload types)
