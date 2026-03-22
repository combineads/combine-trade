# T-059 Exchange precision validator

## Goal
Implement pure precision validation and rounding functions in `packages/shared/decimal/precision.ts` that enforce exchange-specific rules for price tick size, quantity lot size, and minimum notional value. All functions use Decimal.js arithmetic (via the T-058 wrapper) and are stateless — they receive precision rules as input parameters, not from a database or exchange API.

## Why
Every crypto exchange enforces precision rules: prices must align to a tick size (e.g., BTC/USDT tick = 0.10), quantities must align to a lot size (e.g., BTC/USDT lot = 0.001), and orders must exceed a minimum notional value (e.g., 5 USDT). Submitting an order that violates these rules results in an API rejection. By implementing validation as pure functions, the order builder and position sizer can enforce precision before any exchange call, and all edge cases are testable without exchange connectivity.

## Inputs
- EP11 M1 spec — exchange precision metadata (tick size, lot size, min notional), rounding rules
- Architecture guardrail: `packages/shared/` must not import from core, exchange, or app layers
- T-058 `packages/shared/decimal/arithmetic.ts` — `mul`, `div`, `round`, `sub`, `RoundingMode`
- EP11 decision: rounding mode for orders = `ROUND_DOWN` (truncate)

## Dependencies
None. (T-058 is in the same package and will exist at implementation time, but T-059 can be implemented independently since the arithmetic wrapper interface is defined.)

## Expected Outputs
- `packages/shared/decimal/precision.ts`
  - `PrecisionRules` interface:
    ```ts
    interface PrecisionRules {
      tickSize: string;    // price increment, e.g. "0.10"
      lotSize: string;     // quantity increment, e.g. "0.001"
      minNotional: string; // minimum order value in quote currency, e.g. "5"
    }
    ```
  - `roundPrice(price: string, tickSize: string): string` — rounds price down to the nearest tick size multiple
  - `roundQuantity(qty: string, lotSize: string): string` — rounds quantity down to the nearest lot size multiple
  - `validateMinNotional(qty: string, price: string, minNotional: string): void` — throws `PrecisionError` if `qty * price < minNotional`
  - `PrecisionError` class extending `Error`
- `packages/shared/decimal/__tests__/precision.test.ts`

## Deliverables
- `packages/shared/decimal/precision.ts`
- `packages/shared/decimal/__tests__/precision.test.ts`

## Constraints
- All arithmetic must use the T-058 Decimal.js wrapper — no direct `new Decimal()` calls
- `packages/shared/decimal/` must not import from `packages/core/`, `packages/exchange/`, or any app/worker
- `roundPrice` and `roundQuantity` always round DOWN (truncate) — rounding up would exceed available balance or violate tick boundaries
- `validateMinNotional` is a void function that throws on violation — it does not return a boolean
- `PrecisionError` message must include the violated value and the rule (e.g., "notional 4.50 below minimum 5")
- Functions are synchronous and pure — no IO, no side effects
- All tests use `bun:test`

## Steps
1. Create `packages/shared/decimal/precision.ts` with `PrecisionRules` interface and `PrecisionError` class
2. Write failing tests in `packages/shared/decimal/__tests__/precision.test.ts` (RED):
   - `roundPrice("50001.37", "0.10")` → `"50001.30"` (truncate to tick)
   - `roundPrice("50001.30", "0.10")` → `"50001.30"` (already aligned)
   - `roundPrice("0.12345", "0.01")` → `"0.12"` (truncate sub-cent)
   - `roundPrice("100", "0.50")` → `"100"` (integer price, 0.50 tick)
   - `roundQuantity("1.2567", "0.001")` → `"1.256"` (truncate to lot)
   - `roundQuantity("1.256", "0.001")` → `"1.256"` (already aligned)
   - `roundQuantity("0.0005", "0.001")` → `"0"` (below one lot, truncates to zero)
   - `roundQuantity("10", "1")` → `"10"` (whole-number lot size)
   - `validateMinNotional("0.001", "50000", "5")` → no throw (notional = 50, above 5)
   - `validateMinNotional("0.0001", "50000", "5")` → no throw (notional = 5, equal to 5)
   - `validateMinNotional("0.00009", "50000", "5")` → throws `PrecisionError` (notional = 4.5, below 5)
   - `validateMinNotional("0", "50000", "5")` → throws `PrecisionError` (notional = 0)
3. Implement `packages/shared/decimal/precision.ts` (GREEN)
4. Refactor: add JSDoc to all exported functions, `PrecisionRules`, and `PrecisionError`

## Acceptance Criteria
- `roundPrice` truncates prices to the nearest tick size multiple (never rounds up)
- `roundQuantity` truncates quantities to the nearest lot size multiple (never rounds up)
- `validateMinNotional` throws `PrecisionError` when `qty * price < minNotional`
- `validateMinNotional` does not throw when `qty * price >= minNotional` (equal is valid)
- All error messages include the computed value and the violated rule
- All functions use Decimal.js via the T-058 arithmetic wrapper
- All 12 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/shared/decimal/__tests__/precision.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Fetching precision rules from the exchange API (EP01 candle-collector responsibility)
- Caching or storing precision metadata in a database
- Price/quantity formatting for display (separate concern)
- Exchange-specific quirks beyond tick/lot/minNotional (e.g., Binance NOTIONAL filter stepSize)
- Rounding modes other than ROUND_DOWN for precision functions
