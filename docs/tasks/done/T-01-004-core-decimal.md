# T-01-004 core/decimal.ts — Decimal.js wrapper functions

## Goal
Create a Decimal.js wrapper module at `src/core/decimal.ts` that provides type-safe arithmetic operations, comparison functions, and formatting utilities. This wrapper ensures all monetary calculations use Decimal.js and never raw `number`.

## Why
The system handles real money — floating-point errors in position sizing, PnL calculation, or leverage computation could cause financial loss. Decimal.js provides arbitrary-precision arithmetic. A wrapper standardizes usage patterns and makes it easy to enforce the "no number for money" rule across the codebase.

## Inputs
- `docs/ARCHITECTURE.md` — "Decimal.js for all prices/sizes/PnL" constraint
- `docs/PRODUCT.md` — "Decimal.js for all monetary calculations (no float)" constraint
- `decimal.js` npm package (installed in T-01-001)

## Dependencies
T-01-001 (project initialization — decimal.js must be installed)

## Expected Outputs
- `src/core/decimal.ts` — Decimal wrapper functions, factory, comparison helpers, formatting
- All downstream modules import arithmetic helpers from this module

## Deliverables
- `src/core/decimal.ts`

## Constraints
- L0 module: only imports `decimal.js` library (no other project imports)
- Must NOT expose raw `number` in any public API
- Must handle edge cases: division by zero, NaN inputs, Infinity
- Rounding mode should be configurable but default to `ROUND_HALF_UP`
- All functions must accept `Decimal | string` inputs for ergonomics (never `number`)

## Steps
1. Import `Decimal` from `decimal.js` and configure global settings (precision: 20)
2. Create factory function: `d(value: string | Decimal): Decimal` — creates Decimal from string
3. Create arithmetic functions:
   - `add(a, b): Decimal`
   - `sub(a, b): Decimal`
   - `mul(a, b): Decimal`
   - `div(a, b): Decimal` — throws on division by zero
   - `abs(a): Decimal`
   - `neg(a): Decimal`
   - `min(...values): Decimal`
   - `max(...values): Decimal`
4. Create comparison functions:
   - `eq(a, b): boolean`
   - `gt(a, b): boolean`
   - `gte(a, b): boolean`
   - `lt(a, b): boolean`
   - `lte(a, b): boolean`
   - `isZero(a): boolean`
   - `isPositive(a): boolean`
   - `isNegative(a): boolean`
5. Create formatting functions:
   - `toFixed(value, decimals): string`
   - `toPercent(value, decimals?): string` — e.g., "12.34%"
   - `toNumber(value): number` — explicit conversion with WARNING comment
6. Create percentage calculation:
   - `pctChange(from, to): Decimal` — ((to - from) / from)
   - `pctOf(value, pct): Decimal` — value * pct
7. Export `Decimal` type re-export for convenience
8. Write comprehensive tests
9. Verify `bun run typecheck` passes

## Acceptance Criteria
- `d('0.1').add(d('0.2'))` equals `d('0.3')` exactly (not 0.30000000000000004)
- Division by zero throws a descriptive error
- All arithmetic functions accept `Decimal | string` inputs
- No function accepts `number` parameter
- Comparison functions return boolean
- `toFixed` rounds correctly
- `pctChange` calculates percentage change accurately
- `bun run typecheck` passes

## Test Scenarios
- d('0.1') + d('0.2') via add() → equals d('0.3') exactly
- div() with zero divisor → throws DivisionByZeroError
- mul() with string inputs '100' and '0.03' → equals d('3')
- gt(d('1.5'), d('1.49')) → returns true
- eq(d('1.0'), d('1.00')) → returns true (value equality)
- toFixed(d('1.23456'), 2) → returns '1.23'
- pctChange(d('100'), d('110')) → equals d('0.1') (10%)
- isZero(d('0')) → returns true, isZero(d('0.001')) → returns false

## Validation
```bash
bun run typecheck
bun test --grep "core/decimal"
```

## Out of Scope
- Financial-specific calculations (position sizing, PnL) — those use these primitives
- Indicator math (BB, MA calculations) — indicators module
- Database serialization (Drizzle handles Decimal ↔ numeric mapping)
