# T-09-020 Exchange lot size validation

## Goal
Implement a `LotSizeValidator` that validates order quantity against exchange lot size rules before submission: step size alignment, minimum quantity, maximum quantity, and minimum notional value. Returns the validated quantity or throws `ERR_USER_LOT_SIZE_VIOLATION`.

## Why
EP09 M3 — orders that violate exchange lot size constraints (minQty, maxQty, stepSize, minNotional) are rejected by the exchange after the round-trip, wasting latency and consuming retry budget. Validating locally before submission catches these violations immediately, surfaces them as typed errors, and keeps the execution path clean.

## Inputs
- EP09 M3 spec — lot size rounding, min/max quantity, min notional
- `packages/core/risk/position-sizer.ts` (T-09-003) — existing `roundToStepSize` helper
- T-11-002 exchange precision validator — provides `ExchangeLotRules` shape (interface only, no CCXT import)
- Architecture guardrail: `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack

## Dependencies
- T-09-003 (position sizer — provides `roundToStepSize`)
- T-11-002 (exchange precision validator — defines `ExchangeLotRules` interface shape)

## Expected Outputs
- `packages/core/risk/lot-size-validator.ts`
  - `ExchangeLotRules` interface: `{ stepSize: string; minQty: string; maxQty: string; minNotional: string; }`
  - `LotSizeValidator` class with:
    - `validate(quantity: string, price: string, rules: ExchangeLotRules): string` — runs all four checks and returns the (possibly step-rounded) validated quantity string
    - `checkStepSize(quantity: string, stepSize: string): void` — throws `LotSizeViolationError` if `quantity % stepSize !== 0`
    - `checkMinQty(quantity: string, minQty: string): void` — throws if `quantity < minQty`
    - `checkMaxQty(quantity: string, maxQty: string): void` — throws if `quantity > maxQty`
    - `checkMinNotional(quantity: string, price: string, minNotional: string): void` — throws if `price × quantity < minNotional`
  - `LotSizeViolationError` class extending `Error` with `code: 'ERR_USER_LOT_SIZE_VIOLATION'` and violated rule in message
- `packages/core/risk/__tests__/lot-size-validator.test.ts`

## Deliverables
- `packages/core/risk/lot-size-validator.ts`
- `packages/core/risk/__tests__/lot-size-validator.test.ts`

## Constraints
- All arithmetic must use Decimal.js — no native float on monetary values
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- `LotSizeViolationError` must include `code: 'ERR_USER_LOT_SIZE_VIOLATION'` and state the violated rule in its message
- `validate()` applies step-size rounding via `roundToStepSize` before the other checks (caller receives the rounded quantity)
- All tests use `bun:test`

## Steps
1. Write failing tests in `packages/core/risk/__tests__/lot-size-validator.test.ts` (RED):
   - `checkStepSize("0.005", "0.01")` → throws `LotSizeViolationError` (not aligned)
   - `checkStepSize("0.01", "0.01")` → no throw
   - `checkMinQty("0.005", "0.01")` → throws `LotSizeViolationError`
   - `checkMinQty("0.01", "0.01")` → no throw
   - `checkMaxQty("200", "100")` → throws `LotSizeViolationError`
   - `checkMaxQty("50", "100")` → no throw
   - `checkMinNotional("0.001", "10", "20")` → throws (`0.001 * 10 = 0.01 < 20`)
   - `checkMinNotional("10", "5", "20")` → no throw (`10 * 5 = 50 >= 20`)
   - `validate()` happy path — returns step-rounded quantity string
   - `validate()` with quantity that rounds below `minQty` → throws after rounding
   - `LotSizeViolationError` has `code === 'ERR_USER_LOT_SIZE_VIOLATION'`
2. Implement `packages/core/risk/lot-size-validator.ts` (GREEN)
3. Refactor: add JSDoc to `validate`, `LotSizeViolationError`

## Acceptance Criteria
- `checkStepSize` detects misalignment using Decimal modulo
- `checkMinQty` and `checkMaxQty` compare with Decimal.js
- `checkMinNotional` computes `price × quantity` with Decimal.js
- `validate()` applies step rounding then runs all four checks in order
- `LotSizeViolationError.code === 'ERR_USER_LOT_SIZE_VIOLATION'`
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "lot-size" && bun run typecheck
```

## Out of Scope
- Fetching lot rules from exchange API (caller provides `ExchangeLotRules`)
- Auto-adjustment of quantity to satisfy minNotional (reject only)
- Cross-symbol or cross-exchange rule aggregation
