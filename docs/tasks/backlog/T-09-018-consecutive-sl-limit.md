# T-09-018 Consecutive stop-loss limit enforcement

## Goal
Implement a `ConsecutiveSlLimiter` that tracks consecutive LOSS outcomes per strategy and suspends auto-trade when the configured threshold is exceeded. Manual reset is required to re-enable the strategy.

## Why
EP09 M2 — consecutive losses on a single strategy may indicate strategy drift or a market regime change that the strategy was not designed for. Automatically suspending auto-trade after N consecutive losses prevents compounding drawdown while prompting operator review. This is distinct from the daily loss limit — it catches sequences of small losses that might not breach the dollar threshold.

## Inputs
- `docs/exec-plans/09-risk-management.md` M2 (consecutive SL limit, default 5, manual reset)
- `packages/core/risk/loss-limit-tracker.ts` (T-09-002 — LOSS outcome type)
- `packages/db/repositories/` (T-09-007 — loss tracker DB service patterns)

## Dependencies
- T-09-002 (loss limit tracker — provides outcome recording pattern and LOSS type)
- T-09-007 (loss tracker DB service — provides DB persistence pattern for loss data)

## Expected Outputs
- `packages/core/risk/consecutive-sl-limiter.ts`
  - `ConsecutiveSlState` interface:
    ```ts
    interface ConsecutiveSlState {
      strategyId: string;
      consecutiveLosses: number;
      threshold: number;    // default 5
      suspended: boolean;
      suspendedAt: Date | null;
    }
    ```
  - `ConsecutiveSlDeps` interface:
    ```ts
    interface ConsecutiveSlDeps {
      loadState(strategyId: string): Promise<ConsecutiveSlState | null>;
      saveState(state: ConsecutiveSlState): Promise<void>;
      sendSuspensionAlert(strategyId: string, consecutiveLosses: number): Promise<void>;
    }
    ```
  - `recordOutcome(strategyId: string, outcome: "WIN" | "LOSS", deps: ConsecutiveSlDeps): Promise<ConsecutiveSlState>`
    - Loads existing state (or creates default with threshold=5)
    - WIN → resets `consecutiveLosses` to 0
    - LOSS → increments `consecutiveLosses`; if count reaches threshold: sets `suspended: true`, `suspendedAt: new Date()`, calls `deps.sendSuspensionAlert`
    - Saves and returns updated state
  - `resetSuspension(strategyId: string, deps: ConsecutiveSlDeps): Promise<ConsecutiveSlState>`
    - Loads state, sets `suspended: false`, `consecutiveLosses: 0`, `suspendedAt: null`
    - Saves and returns updated state
    - Throws `ConsecutiveSlNotSuspendedError` if strategy is not currently suspended
  - `isSuspended(state: ConsecutiveSlState): boolean` — pure predicate
  - `ConsecutiveSlNotSuspendedError` class extending `Error`
- `packages/core/risk/__tests__/consecutive-sl.test.ts`

## Deliverables
- `packages/core/risk/consecutive-sl-limiter.ts`
- `packages/core/risk/__tests__/consecutive-sl.test.ts`

## Constraints
- `packages/core/risk/consecutive-sl-limiter.ts` must not import CCXT, Drizzle, Elysia, or Slack
- `recordOutcome` and `resetSuspension` always persist via `deps.saveState` before returning
- `sendSuspensionAlert` is called exactly once on the threshold-crossing loss — not on subsequent losses after suspension
- Suspension does not auto-lift — `resetSuspension` is the only way to clear it
- WIN outcome always resets the consecutive counter, even if the strategy is currently suspended
- All tests use `bun:test`; mock deps are plain inline objects with closure-based state

## Steps
1. Write failing tests (RED):
   - `recordOutcome` WIN on fresh state → `consecutiveLosses: 0, suspended: false`
   - `recordOutcome` LOSS × 4 (below threshold 5) → `consecutiveLosses: 4, suspended: false`
   - `recordOutcome` LOSS × 5 (at threshold) → `suspended: true, suspendedAt` set
   - `recordOutcome` LOSS × 5 → `sendSuspensionAlert` called exactly once
   - `recordOutcome` LOSS × 6 (already suspended) → `sendSuspensionAlert` not called again
   - `recordOutcome` WIN after 3 losses → resets `consecutiveLosses: 0`
   - WIN followed by LOSS starts count from 1, not from previous total
   - `resetSuspension` on suspended strategy → `suspended: false, consecutiveLosses: 0`
   - `resetSuspension` on non-suspended strategy → throws `ConsecutiveSlNotSuspendedError`
   - `isSuspended` returns false for non-suspended state
   - `isSuspended` returns true for suspended state
   - `recordOutcome` calls `deps.saveState` on every call
   - Two strategies have independent counters (load/save per strategyId)
2. Implement `consecutive-sl-limiter.ts` (GREEN)
3. Refactor: add JSDoc to all exported functions and interfaces

## Acceptance Criteria
- LOSS counter increments correctly and triggers suspension at threshold
- WIN outcome always resets counter regardless of prior loss count
- `sendSuspensionAlert` called exactly once at the threshold-crossing event
- `resetSuspension` clears suspension and counter; throws on non-suspended strategy
- State is always persisted via `deps.saveState` before returning
- All 13 tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "consecutive-sl" && bun run typecheck
```

## Out of Scope
- DB repository implementation for ConsecutiveSlState (follow T-09-007 pattern separately)
- Auto-reset of the suspension (manual reset only)
- Configuring the threshold per strategy via the API (API/UI concern)
- Daily or weekly reset of the consecutive counter
- Wiring into the decision engine pipeline (worker concern)
