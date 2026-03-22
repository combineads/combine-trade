# T-058 Decimal.js financial arithmetic wrapper

## Goal
Implement a Decimal.js-based financial arithmetic module in `packages/shared/decimal/` that provides `add`, `sub`, `mul`, `div`, and `round` functions with explicit rounding mode control. The module enforces two rounding modes used across the system: `ROUND_DOWN` (truncate) for order quantities and `ROUND_HALF_UP` (standard financial rounding) for display and reporting values.

## Why
CLAUDE.md critical invariant #8 states: "All monetary calculations must use Decimal.js (never native float)." JavaScript's IEEE 754 floating-point produces errors like `0.1 + 0.2 !== 0.3`, which are unacceptable for financial calculations. This module is the foundational arithmetic layer that all fee, funding, PnL, and precision modules depend on. By centralizing the Decimal.js usage in a thin wrapper with explicit rounding semantics, downstream consumers avoid direct Decimal.js API coupling and gain consistent, auditable rounding behavior.

## Inputs
- EP11 M1 spec — Decimal.js wrapper with standard financial arithmetic functions, rounding modes
- Architecture guardrail: `packages/shared/` is the lowest dependency layer, must not import from core, exchange, or app layers
- Decimal.js is already available in the monorepo
- EP11 decision log: "Decimal.js 적용 경계: 지표=float, PnL=Decimal"

## Dependencies
None.

## Expected Outputs
- `packages/shared/decimal/arithmetic.ts`
  - `type RoundingMode = "ROUND_DOWN" | "ROUND_HALF_UP"`
  - `add(a: string, b: string): string` — returns `a + b` as Decimal string
  - `sub(a: string, b: string): string` — returns `a - b` as Decimal string
  - `mul(a: string, b: string): string` — returns `a * b` as Decimal string
  - `div(a: string, b: string): string` — returns `a / b` as Decimal string; throws `ArithmeticError` on division by zero
  - `round(value: string, decimalPlaces: number, mode: RoundingMode): string` — rounds `value` to `decimalPlaces` using the specified mode
  - `ArithmeticError` class extending `Error`
  - All functions accept and return plain `string` values (not Decimal instances) — Decimal.js is an internal implementation detail
- `packages/shared/decimal/__tests__/arithmetic.test.ts`

## Deliverables
- `packages/shared/decimal/arithmetic.ts`
- `packages/shared/decimal/__tests__/arithmetic.test.ts`

## Constraints
- All inputs and outputs are `string` — callers never touch Decimal.js directly
- `packages/shared/decimal/` must not import from `packages/core/`, `packages/exchange/`, or any app/worker
- `ROUND_DOWN` truncates toward zero (Decimal.js `ROUND_DOWN = 1`)
- `ROUND_HALF_UP` rounds half away from zero (Decimal.js `ROUND_HALF_UP = 4`)
- `div` must throw `ArithmeticError` when the divisor is zero — not a Decimal.js internal error
- No global Decimal.js config mutation — use per-operation rounding via `toDecimalPlaces()` or `toFixed()`
- All tests use `bun:test`

## Steps
1. Create `packages/shared/decimal/arithmetic.ts` with `ArithmeticError` class and `RoundingMode` type
2. Write failing tests in `packages/shared/decimal/__tests__/arithmetic.test.ts` (RED):
   - `add("0.1", "0.2")` → `"0.3"` (IEEE 754 precision proof)
   - `add("999999999999.99", "0.01")` → `"1000000000000"` (large number precision)
   - `sub("1.0", "0.7")` → `"0.3"` (IEEE 754 precision proof)
   - `sub("0", "100.50")` → `"-100.5"` (negative result)
   - `mul("0.1", "0.2")` → `"0.02"` (IEEE 754 precision proof)
   - `mul("100000", "0.00001")` → `"1"` (extreme scale)
   - `div("1", "3")` returns a Decimal string (not infinite)
   - `div("100", "0")` → throws `ArithmeticError`
   - `div("0", "100")` → `"0"`
   - `round("2.5679", 3, "ROUND_DOWN")` → `"2.567"` (truncate)
   - `round("2.5675", 3, "ROUND_HALF_UP")` → `"2.568"` (round up on half)
   - `round("2.5674", 3, "ROUND_HALF_UP")` → `"2.567"` (round down below half)
   - `round("-1.235", 2, "ROUND_DOWN")` → `"-1.23"` (truncate negative)
   - `round("-1.235", 2, "ROUND_HALF_UP")` → `"-1.24"` (round away from zero)
   - `round("100", 0, "ROUND_DOWN")` → `"100"` (integer input, zero decimal places)
3. Implement `packages/shared/decimal/arithmetic.ts` (GREEN)
4. Refactor: add JSDoc to all exported functions and the `ArithmeticError` class

## Acceptance Criteria
- `add("0.1", "0.2")` returns exactly `"0.3"` — IEEE 754 error eliminated
- `sub("1.0", "0.7")` returns exactly `"0.3"`
- `mul("0.1", "0.2")` returns exactly `"0.02"`
- `div("100", "0")` throws `ArithmeticError` with a descriptive message
- `round` with `ROUND_DOWN` always truncates (never rounds up)
- `round` with `ROUND_HALF_UP` rounds half away from zero (standard financial rounding)
- All functions accept `string` and return `string` — Decimal.js is never exposed
- All 15 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/decimal/__tests__/arithmetic.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Exchange precision rules (tick size, lot size) — covered by T-059
- Fee or funding rate calculations — covered by T-060, T-061
- Global Decimal.js configuration or singleton — each operation is self-contained
- Percentage or basis-point helper functions (can be added later)
- Serialization to/from database types
