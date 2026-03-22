# T-055 Position sizer

## Goal
Implement pure functions that calculate the order quantity for a new position using the fixed-fraction risk model. The sizer applies lot-size rounding, enforces minimum and maximum quantity bounds, and rejects orders that would push total open exposure beyond a notional limit or effective leverage beyond a maximum. All arithmetic uses Decimal.js.

## Why
Correct position sizing is fundamental to risk control. The fixed-fraction model ensures that each trade risks only a fixed percentage of account balance, limiting drawdown per trade regardless of price level. Making this pure and injectable means the risk gate (T-056) can call it without any exchange connectivity, and it can be tested with arbitrary balance / price scenarios.

## Inputs
- EP09 M3 spec — fixed-fraction risk model, lot size rounding, min/max quantity, exposure cap, leverage cap
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia, or Slack
- `packages/core/risk/types.ts` (T-053/T-054) — add `PositionSizeConfig`, `PositionSizeResult`, `PositionSizeError`
- Decimal.js is already available in the monorepo

## Dependencies
None.

## Expected Outputs
- Updated `packages/core/risk/types.ts` (add `PositionSizeConfig`, `PositionSizeResult`)
  - `PositionSizeConfig`:
    ```ts
    interface PositionSizeConfig {
      riskPct: number;          // e.g. 0.01 for 1% of balance per trade
      stepSize: string;         // lot size increment as Decimal string, e.g. "0.001"
      minQty: string;           // minimum order quantity as Decimal string
      maxQty: string;           // maximum order quantity as Decimal string
      maxExposureUsd: string;   // maximum total open notional in USD as Decimal string
      maxLeverage: number;      // maximum effective leverage allowed
    }
    ```
  - `PositionSizeResult`: `{ quantity: string; notionalUsd: string; effectiveLeverage: string }`
- `packages/core/risk/position-sizer.ts`
  - `calculateQuantity(balance: string, entryPrice: string, slPct: number, config: PositionSizeConfig): string` — applies formula `quantity = (balance * riskPct) / (entryPrice * slPct)`, rounds down to the nearest `stepSize` multiple; returns the rounded quantity as a Decimal string
  - `roundToStepSize(quantity: string, stepSize: string): string` — rounds `quantity` down to the nearest multiple of `stepSize` using Decimal.js floor division
  - `validateQuantity(quantity: string, config: PositionSizeConfig): void` — throws `PositionSizeError` if `quantity < minQty` or `quantity > maxQty`
  - `checkExposure(currentExposureUsd: string, newNotionalUsd: string, config: PositionSizeConfig): void` — throws `PositionSizeError` if `currentExposureUsd + newNotionalUsd > maxExposureUsd`
  - `checkLeverage(notionalUsd: string, balance: string, config: PositionSizeConfig): void` — computes `effectiveLeverage = notionalUsd / balance`; throws `PositionSizeError` if it exceeds `maxLeverage`
  - `sizePosition(balance: string, entryPrice: string, slPct: number, currentExposureUsd: string, config: PositionSizeConfig): PositionSizeResult` — orchestrates the full flow: calculate → round → validate quantity → check exposure → check leverage → return result; throws `PositionSizeError` at the first violation
  - `PositionSizeError` class extending `Error`
- `packages/core/risk/__tests__/position-sizer.test.ts`

## Deliverables
- Updated `packages/core/risk/types.ts`
- `packages/core/risk/position-sizer.ts`
- `packages/core/risk/__tests__/position-sizer.test.ts`

## Constraints
- All arithmetic (quantity, notional, leverage) must use Decimal.js — no native float on monetary values
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- `roundToStepSize` uses floor rounding (never rounds up — never exceeds calculated risk)
- `calculateQuantity` returns the raw (pre-rounding) value; `sizePosition` applies rounding via `roundToStepSize`
- No external IO — all functions are synchronous pure computations; `sizePosition` has no async operations
- `PositionSizeError` must include the violated constraint in its message (e.g. "quantity 0.0001 below minimum 0.001")
- All tests use `bun:test`

## Steps
1. Add `PositionSizeConfig`, `PositionSizeResult` to `packages/core/risk/types.ts`; add `PositionSizeError` to `packages/core/risk/position-sizer.ts`
2. Write failing tests in `packages/core/risk/__tests__/position-sizer.test.ts` (RED):
   - `calculateQuantity("10000", "50000", 0.01, config)` with `riskPct: 0.01` → `"0.2"` (10000*0.01 / (50000*0.01) = 2)
   - `roundToStepSize("2.567", "0.001")` → `"2.567"` (already aligned)
   - `roundToStepSize("2.5679", "0.001")` → `"2.567"` (floor to 3 decimal places)
   - `roundToStepSize("0.0005", "0.001")` → `"0.000"` (floors below stepSize to 0 — triggers minQty validation)
   - `validateQuantity` with quantity below `minQty` → throws `PositionSizeError`
   - `validateQuantity` with quantity above `maxQty` → throws `PositionSizeError`
   - `validateQuantity` with quantity in valid range → no throw
   - `checkExposure` — `"800" + "300"` vs cap `"1000"` → throws `PositionSizeError`
   - `checkExposure` — `"500" + "300"` vs cap `"1000"` → no throw
   - `checkLeverage` — notional `"50000"`, balance `"1000"`, maxLeverage `20` → throws (50x > 20x)
   - `checkLeverage` — notional `"10000"`, balance `"1000"`, maxLeverage `20` → no throw (10x ≤ 20x)
   - `sizePosition` happy path → returns `PositionSizeResult` with correct `quantity`, `notionalUsd`, `effectiveLeverage`
   - `sizePosition` with exposure breach → throws `PositionSizeError`
   - `sizePosition` with leverage breach → throws `PositionSizeError`
3. Implement `packages/core/risk/position-sizer.ts` (GREEN)
4. Refactor: add JSDoc to `sizePosition`, `calculateQuantity`, `roundToStepSize`, `PositionSizeError`

## Acceptance Criteria
- `calculateQuantity` formula matches `(balance * riskPct) / (entryPrice * slPct)` using Decimal.js
- `roundToStepSize` always floors — never rounds up
- `validateQuantity` throws with violated constraint in message for both bounds
- `checkExposure` throws when `current + new > cap`
- `checkLeverage` throws when `notional / balance > maxLeverage`
- `sizePosition` composes all checks and throws at the first violation
- All 14 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/risk/__tests__/position-sizer.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Dynamic leverage from the exchange (caller supplies the configured max)
- Margin mode selection (cross vs isolated — caller concern)
- Partial position sizing for pyramiding (future feature)
- Live balance fetch from the exchange (DI / caller concern)
- Decimal.js library installation (already in monorepo)
