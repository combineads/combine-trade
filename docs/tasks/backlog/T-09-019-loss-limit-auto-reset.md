# T-09-019 Loss limit auto reset

## Goal
Implement a `LossLimitResetScheduler` service that automatically resets daily loss counters at UTC 00:00 and weekly loss counters at Monday UTC 00:00. The consecutive SL counter is NOT reset automatically — manual reset only.

## Why
EP09 M2 — daily and weekly loss counters must be reset on schedule to prevent permanent lockout after a loss event. Without automatic reset, a trader who hits the daily loss limit would be locked out indefinitely until manual intervention. The consecutive SL counter remains manual-only because consecutive losses may indicate a systematic problem requiring human review.

## Inputs
- EP09 M2 spec — daily reset at UTC 00:00, weekly reset at Monday UTC 00:00
- `packages/core/risk/types.ts` — existing loss limit types from T-09-002 / T-09-007
- Architecture guardrail: `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack

## Dependencies
- T-09-002 (daily realized loss tracking service)
- T-09-007 (daily/weekly loss limit enforcement)

## Expected Outputs
- `packages/core/risk/loss-limit-reset-scheduler.ts`
  - `LossLimitResetScheduler` class
  - `start(): void` — registers cron-style timers for daily and weekly resets
  - `stop(): void` — cancels all registered timers
  - `resetDaily(): void` — resets daily loss counter; emits log event
  - `resetWeekly(): void` — resets weekly loss counter; emits log event
  - Constructor accepts `LossLimitStore` interface (injected) and optional `clock` for testability
- `packages/core/risk/types.ts` additions:
  - `LossLimitStore` interface: `{ getDailyLoss(): string; resetDailyLoss(): void; getWeeklyLoss(): string; resetWeeklyLoss(): void; }`
  - `ResetEvent` type: `{ type: 'daily' | 'weekly'; resetAt: Date; previousValue: string; }`
- `packages/core/risk/__tests__/loss-limit-reset-scheduler.test.ts`

## Deliverables
- `packages/core/risk/loss-limit-reset-scheduler.ts`
- Updated `packages/core/risk/types.ts`
- `packages/core/risk/__tests__/loss-limit-reset-scheduler.test.ts`

## Constraints
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- Consecutive SL counter must NOT be reset by this scheduler (manual only)
- Scheduler must be testable without real timers — accept a `clock` abstraction
- All reset events must be logged (emit a `ResetEvent` or call an injected logger)
- Weekly reset fires on Monday only — scheduler must check `getDay() === 1` inside the daily tick
- All tests use `bun:test`

## Steps
1. Add `LossLimitStore` interface and `ResetEvent` type to `packages/core/risk/types.ts`
2. Write failing tests in `packages/core/risk/__tests__/loss-limit-reset-scheduler.test.ts` (RED):
   - `resetDaily()` calls `store.resetDailyLoss()` and emits a `ResetEvent` with `type: 'daily'`
   - `resetWeekly()` calls `store.resetWeeklyLoss()` and emits a `ResetEvent` with `type: 'weekly'`
   - `resetDaily()` does NOT call `store.resetWeeklyLoss()`
   - `resetWeekly()` does NOT call `store.resetDailyLoss()`
   - Consecutive SL counter is never touched by either reset method
   - `start()` schedules daily tick; `stop()` cancels it without error
   - Weekly reset does NOT fire on a non-Monday UTC midnight tick
   - Weekly reset fires on a Monday UTC midnight tick
3. Implement `packages/core/risk/loss-limit-reset-scheduler.ts` (GREEN)
4. Refactor: add JSDoc to `LossLimitResetScheduler`, `resetDaily`, `resetWeekly`

## Acceptance Criteria
- `resetDaily()` resets only the daily counter and logs a `ResetEvent` with `type: 'daily'`
- `resetWeekly()` resets only the weekly counter and logs a `ResetEvent` with `type: 'weekly'`
- Consecutive SL counter is never touched by the scheduler
- Weekly reset does not fire on non-Monday midnight ticks
- `stop()` cleanly cancels all timers without throwing
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "loss-limit-reset" && bun run typecheck
```

## Out of Scope
- Consecutive SL counter auto-reset (manual only by design)
- Per-strategy vs global reset distinction (caller concern — scheduler resets what the store exposes)
- Persistence of reset events to DB (logging only)
- Timezone conversion beyond UTC (UTC 00:00 is the single reference)
