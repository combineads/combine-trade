# T-09-002 Loss limit tracker

## Goal
Implement a `LossTracker` that accumulates realized PnL records and enforces configurable daily, weekly, and consecutive-stop-loss limits. All monetary arithmetic uses Decimal.js. Persistence is injected via DI so the tracker remains a pure computation layer.

## Why
EP09 requires that a daily loss limit breach immediately suspends auto-trading. To satisfy this, the system needs a reliable PnL accumulator that can answer "has today's loss exceeded the daily limit?" and "have we hit N consecutive stop-losses?" in real time. Keeping this logic pure — with storage injected — means it can be unit-tested exhaustively with synthetic PnL sequences and swapped to any storage backend without touching the business rules.

## Inputs
- EP09 M2 spec — daily loss limit, weekly loss limit, consecutive SL limit, immediate suspension on breach
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia, or Slack
- `packages/core/risk/types.ts` (T-09-001) — shared risk type file; add `DailyLossConfig` here
- Decimal.js is already available in the monorepo

## Dependencies
None.

## Expected Outputs
- Updated `packages/core/risk/types.ts` (add `DailyLossConfig`, `PnlRecord`, `LimitCheckResult`)
  - `DailyLossConfig`:
    ```ts
    interface DailyLossConfig {
      dailyLimitPct: number;   // e.g. 3 means 3% of balance
      weeklyLimitPct: number;  // e.g. 10 means 10% of balance
      maxConsecutiveSl: number; // e.g. 3 means 3 consecutive stop-losses halt trading
    }
    ```
  - `PnlRecord`: `{ id: string; pnl: string; closedAt: Date }` — pnl is a Decimal.js string (negative = loss)
  - `LimitCheckResult`: `{ breached: boolean; reason?: string }`
- `packages/core/risk/loss-tracker.ts`
  - `LossTrackerDeps` interface:
    ```ts
    interface LossTrackerDeps {
      loadTodayRecords(): Promise<PnlRecord[]>;
      loadWeekRecords(): Promise<PnlRecord[]>;
      saveRecord(record: PnlRecord): Promise<void>;
    }
    ```
  - `addLoss(pnl: string, deps: LossTrackerDeps): Promise<PnlRecord>` — creates a `PnlRecord` with `crypto.randomUUID()` id and `new Date()` timestamp, persists via `deps.saveRecord`, returns the record
  - `getTodayLoss(deps: LossTrackerDeps): Promise<string>` — returns the sum of all negative PnL records from today as a Decimal.js string (always non-negative absolute value); positive PnL records are included in the net (reduces the loss figure)
  - `getWeekLoss(deps: LossTrackerDeps): Promise<string>` — same calculation over the current week's records
  - `getConsecutiveLosses(deps: LossTrackerDeps): Promise<number>` — counts the trailing run of records where `pnl < 0`; resets to 0 on the first non-negative record encountered scanning backwards through today's records
  - `checkLimits(balance: string, config: DailyLossConfig, deps: LossTrackerDeps): Promise<LimitCheckResult>` — checks daily loss, weekly loss, and consecutive SL in that order; returns the first breach found with a descriptive `reason` string; returns `{ breached: false }` if all limits are within bounds
- `packages/core/risk/__tests__/loss-tracker.test.ts`

## Deliverables
- Updated `packages/core/risk/types.ts`
- `packages/core/risk/loss-tracker.ts`
- `packages/core/risk/__tests__/loss-tracker.test.ts`

## Constraints
- All PnL arithmetic must use Decimal.js — no native float addition or comparison on monetary values
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- No direct DB or network access — all persistence goes through `LossTrackerDeps`
- `getTodayLoss` and `getWeekLoss` compute the net realized loss (positive PnL entries reduce the loss figure); the return value is always expressed as the absolute net loss (non-negative string)
- `getConsecutiveLosses` scans the records returned by `deps.loadTodayRecords()` in reverse chronological order (latest first)
- `checkLimits` compares `todayLoss / balance` against `dailyLimitPct / 100`, and `weekLoss / balance` against `weeklyLimitPct / 100`; the consecutive SL check compares directly against `maxConsecutiveSl`
- All tests use `bun:test`; mock deps return hard-coded arrays of `PnlRecord` fixtures

## Steps
1. Add `DailyLossConfig`, `PnlRecord`, `LimitCheckResult` to `packages/core/risk/types.ts`
2. Write failing tests in `packages/core/risk/__tests__/loss-tracker.test.ts` (RED):
   - `getTodayLoss` with no records → `"0"`
   - `getTodayLoss` with records `["-100", "-50", "30"]` → `"120"` (net loss = 100 + 50 - 30)
   - `getWeekLoss` with records `["-200", "50"]` → `"150"`
   - `getConsecutiveLosses` with records latest-first `["-10", "-20", "5", "-30"]` → `2` (stops at the positive record)
   - `getConsecutiveLosses` with all losses → count equals the total number of records
   - `getConsecutiveLosses` with no records → `0`
   - `getConsecutiveLosses` with latest record being positive → `0`
   - `checkLimits` — daily limit not breached → `{ breached: false }`
   - `checkLimits` — daily loss exceeds limit → `{ breached: true, reason: <string containing "daily"> }`
   - `checkLimits` — weekly loss exceeds limit → `{ breached: true, reason: <string containing "weekly"> }`
   - `checkLimits` — consecutive SL exceeds limit → `{ breached: true, reason: <string containing "consecutive"> }`
   - `checkLimits` — daily breach takes priority over weekly breach (order check)
   - `addLoss` calls `deps.saveRecord` exactly once and returns the persisted record
3. Implement `packages/core/risk/loss-tracker.ts` (GREEN)
4. Refactor: add JSDoc to all exported functions and the `LossTrackerDeps` interface

## Acceptance Criteria
- `getTodayLoss` uses Decimal.js net arithmetic and returns a non-negative string
- `getConsecutiveLosses` correctly resets the count at the first non-negative record scanning backwards
- `checkLimits` evaluates daily → weekly → consecutive SL in that order and returns the first breach
- `addLoss` calls `deps.saveRecord` exactly once per invocation
- All 13 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/risk/__tests__/loss-tracker.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Drizzle persistence adapter (worker or API layer concern)
- PnL source — this tracker receives pre-computed realized PnL strings from the order executor
- Reset-on-day-boundary scheduling (scheduler concern)
- Alerting on breach (risk gate T-09-004 and alert-worker concern)
- Unrealized PnL tracking (separate feature)
