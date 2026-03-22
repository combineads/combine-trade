# T-056 Risk gate (pre-order validation)

## Goal
Implement a unified pre-order validation layer that checks all risk conditions — kill switch active, loss limit breached, position size invalid, leverage exceeded — before allowing an order to proceed. Exposes a single `validateOrder` function that collects all rejections and returns them together so the caller receives a complete picture of what failed.

## Why
Scattered inline checks in the order executor would be fragile and hard to test. A dedicated gate consolidates every pre-trade risk check into one callable function with a stable interface, making it easy to audit, mock in tests, and extend with new checks without touching the executor. The gate also acts as the last line of defence — even if upstream logic is bypassed, no order reaches the exchange without passing this gate.

## Inputs
- T-053 `isBlocked`, `KillSwitchState` from `packages/core/risk/kill-switch.ts`
- T-054 `checkLimits`, `DailyLossConfig`, `LossTrackerDeps` from `packages/core/risk/loss-tracker.ts`
- T-055 `sizePosition`, `PositionSizeConfig`, `PositionSizeError` from `packages/core/risk/position-sizer.ts`
- `packages/core/risk/types.ts` — shared risk types
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia, or Slack

## Dependencies
- T-053 (kill switch state machine)
- T-054 (loss limit tracker)
- T-055 (position sizer)

## Expected Outputs
- `packages/core/risk/gate.ts`
  - `RiskGateDeps` interface:
    ```ts
    interface RiskGateDeps {
      getKillSwitchStates(): Promise<KillSwitchState[]>;
      getLossTrackerDeps(): LossTrackerDeps;
      getOpenExposureUsd(strategyId: string, exchangeId: string): Promise<string>;
      getBalance(exchangeId: string): Promise<string>;
    }
    ```
  - `OrderValidationInput` interface:
    ```ts
    interface OrderValidationInput {
      strategyId: string;
      exchangeId: string;
      entryPrice: string;
      slPct: number;
      lossConfig: DailyLossConfig;
      sizeConfig: PositionSizeConfig;
    }
    ```
  - `GateResult` interface: `{ allowed: boolean; rejections: string[] }`
  - `validateOrder(input: OrderValidationInput, deps: RiskGateDeps): Promise<GateResult>` — runs all four checks in sequence, accumulates rejection strings, and returns `{ allowed: rejections.length === 0, rejections }`
  - Check order: (1) kill switch, (2) loss limit, (3) position size validity (quantity > 0 after rounding), (4) leverage — each failing check appends a human-readable string to `rejections`; all checks run even when earlier ones fail (full report)
- `packages/core/risk/__tests__/gate.test.ts`
- Updated `packages/core/risk/index.ts` barrel export for all risk exports

## Deliverables
- `packages/core/risk/gate.ts`
- `packages/core/risk/__tests__/gate.test.ts`
- `packages/core/risk/index.ts` (new barrel export)

## Constraints
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- No direct DB or network access — all external data comes through `RiskGateDeps`
- All four checks must run regardless of earlier failures — `validateOrder` always returns the full `rejections` list
- Position size check: call `sizePosition`; catch `PositionSizeError` and convert to a rejection string — do not re-throw
- Kill switch check uses the synchronous `isBlocked` function after awaiting `deps.getKillSwitchStates()`
- Loss limit check uses `checkLimits` after awaiting the balance via `deps.getBalance`
- `rejections` strings must be human-readable and include the violated condition (e.g. `"kill switch active: global"`, `"daily loss limit breached: 3.5% > 3%"`)
- All tests use `bun:test`; all deps are plain inline mock objects with closure-based state

## Steps
1. Create `packages/core/risk/gate.ts` with interface and function stubs (RED anchor)
2. Write failing tests in `packages/core/risk/__tests__/gate.test.ts` (RED):
   - All conditions pass → `{ allowed: true, rejections: [] }`
   - Kill switch active (global) → `{ allowed: false, rejections: [<string containing "kill switch">] }`
   - Loss limit breached (daily) → `{ allowed: false, rejections: [<string containing "daily">] }`
   - Position size error (quantity rounds to zero, below minQty) → `{ allowed: false, rejections: [<string containing "position">] }`
   - Leverage exceeded → `{ allowed: false, rejections: [<string containing "leverage">] }`
   - Kill switch + loss limit both active → `{ allowed: false, rejections: }` with length 2 (both strings present)
   - Kill switch active but loss limit OK → only kill switch rejection in list
   - All four conditions violated → `rejections` has length 4
   - `validateOrder` does not throw when a check fails — wraps all errors into rejections
3. Implement `packages/core/risk/gate.ts` (GREEN)
4. Create `packages/core/risk/index.ts` barrel exporting all public symbols from `kill-switch.ts`, `loss-tracker.ts`, `position-sizer.ts`, `gate.ts`, and `types.ts`
5. Refactor: add JSDoc to `validateOrder`, `RiskGateDeps`, `GateResult`

## Acceptance Criteria
- `validateOrder` runs all four checks even when earlier ones fail
- Each rejection string is human-readable and identifies the violated condition
- `allowed` is `true` only when `rejections` is empty
- `PositionSizeError` from `sizePosition` is caught and converted to a rejection string — never re-thrown
- Barrel export `packages/core/risk/index.ts` re-exports all public risk symbols
- All 9 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/risk/__tests__/gate.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Order execution (executor concern)
- Drizzle persistence adapters for kill switch or loss tracker
- Real exchange balance fetch (CCXT adapter concern)
- Async retry on transient dep failures (reliability concern)
- Rate limiting or cooldown periods between orders
