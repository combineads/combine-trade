# T-09-021 Total exposure limit

## Goal
Implement an `ExposureLimitChecker` that sums all open position notional values across all strategies and rejects a new order if adding it would exceed a configurable `max_total_exposure` threshold (default: 80% of account balance). All arithmetic uses Decimal.js.

## Why
EP09 M3 — without a total exposure cap, multiple simultaneous strategies can each stay within their individual limits while the aggregate position size over-leverages the account. Enforcing a portfolio-level notional cap prevents systemic over-leveraging regardless of how many strategies are active.

## Inputs
- EP09 M3 spec — total exposure limit, default 80% of account balance
- `packages/core/risk/position-sizer.ts` (T-09-003) — existing `checkExposure` helper as reference
- `packages/core/risk/types.ts` — existing risk types
- T-09-010 (position sync service) — provides `OpenPosition[]` interface shape
- Architecture guardrail: `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack

## Dependencies
- T-09-003 (position sizer — checkExposure reference and Decimal.js patterns)
- T-09-010 (position sync service — defines `OpenPosition` interface shape)

## Expected Outputs
- `packages/core/risk/exposure-limit-checker.ts`
  - `OpenPosition` interface: `{ symbol: string; notionalUsd: string; }`
  - `ExposureLimitConfig` interface: `{ maxExposureRatio: number; /* default 0.8 */ }`
  - `ExposureLimitChecker` class with:
    - `constructor(config: ExposureLimitConfig)`
    - `getTotalExposure(positions: OpenPosition[]): string` — sums `notionalUsd` across all positions using Decimal.js
    - `check(positions: OpenPosition[], newNotionalUsd: string, accountBalance: string): void` — computes `maxAllowed = accountBalance × maxExposureRatio`, then checks `totalExposure + newNotionalUsd > maxAllowed`; throws `ExposureLimitError` if exceeded
  - `ExposureLimitError` class extending `Error` with `code: 'ERR_USER_EXPOSURE_LIMIT'` and current vs max values in message
- `packages/core/risk/__tests__/exposure-limit-checker.test.ts`

## Deliverables
- `packages/core/risk/exposure-limit-checker.ts`
- `packages/core/risk/__tests__/exposure-limit-checker.test.ts`

## Constraints
- All arithmetic must use Decimal.js — no native float on monetary values
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- `ExposureLimitError` must include `code: 'ERR_USER_EXPOSURE_LIMIT'`
- Default `maxExposureRatio` is `0.8` (80% of account balance)
- `getTotalExposure` must handle an empty positions array (returns `"0"`)
- All tests use `bun:test`

## Steps
1. Write failing tests in `packages/core/risk/__tests__/exposure-limit-checker.test.ts` (RED):
   - `getTotalExposure([])` → `"0"`
   - `getTotalExposure([{ notionalUsd: "500" }, { notionalUsd: "300" }])` → `"800"`
   - `check()` — total `"700"` + new `"200"` vs max `1000 * 0.8 = 800` → throws `ExposureLimitError`
   - `check()` — total `"500"` + new `"100"` vs max `1000 * 0.8 = 800` → no throw
   - `check()` — exactly at limit (`total + new === max`) → no throw (equal is allowed)
   - `ExposureLimitError.code === 'ERR_USER_EXPOSURE_LIMIT'`
   - `ExposureLimitError` message contains current exposure and max allowed values
   - Custom `maxExposureRatio: 0.5` is respected
2. Implement `packages/core/risk/exposure-limit-checker.ts` (GREEN)
3. Refactor: add JSDoc to `ExposureLimitChecker`, `check`, `getTotalExposure`

## Acceptance Criteria
- `getTotalExposure` sums all positions with Decimal.js, returns `"0"` for empty array
- `check` computes `maxAllowed = accountBalance × maxExposureRatio` with Decimal.js
- `check` throws `ExposureLimitError` when `totalExposure + newNotionalUsd > maxAllowed`
- `check` does NOT throw when result equals the limit exactly
- `ExposureLimitError.code === 'ERR_USER_EXPOSURE_LIMIT'`
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "exposure-limit" && bun run typecheck
```

## Out of Scope
- Per-strategy exposure sub-limits (portfolio-level total only)
- Fetching open positions from exchange (caller provides `OpenPosition[]`)
- Async balance fetching (caller provides balance string)
- Race-condition protection during concurrent order submission (advisory lock — T-09-009)
