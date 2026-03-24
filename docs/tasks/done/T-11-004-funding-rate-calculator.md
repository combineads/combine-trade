# T-11-004 Funding rate calculator

## Goal
Implement pure funding rate calculation functions in `packages/core/fee/funding.ts` that compute funding payments for a given position and accumulate multiple funding payments over a holding period. All arithmetic uses Decimal.js via the T-11-001 wrapper. The module handles both positive (longs pay shorts) and negative (shorts pay longs) funding rates.

## Why
Perpetual futures charge funding payments every 8 hours to anchor the futures price to the spot price. For positions held across multiple funding intervals, accumulated funding can significantly impact net PnL — a position held for 3 days incurs 9 funding payments. EP11 M3 requires accurate funding calculation for backtest PnL and live position tracking. By implementing this as pure arithmetic functions, the backtest engine can replay historical funding rates and the live system can compute real-time funding impact without coupling to the funding rate data source.

## Inputs
- EP11 M3 spec — funding rate calculation, cumulative funding for open positions
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia, or Slack
- T-11-001 `packages/shared/decimal/arithmetic.ts` — `mul`, `add`, `sub`
- Funding rate convention: positive rate → longs pay shorts; negative rate → shorts pay longs

## Dependencies
- T-11-001 (Decimal.js financial arithmetic wrapper)

## Expected Outputs
- `packages/core/fee/funding.ts`
  - `FundingPayment` interface:
    ```ts
    interface FundingPayment {
      positionNotional: string;  // position size * mark price at funding time
      fundingRate: string;       // e.g. "0.0001" for 0.01%
      side: "long" | "short";   // position side
    }
    ```
  - `calculateFundingPayment(payment: FundingPayment): string` — returns the funding payment amount:
    - Long position: `-(positionNotional * fundingRate)` (long pays when rate is positive)
    - Short position: `+(positionNotional * fundingRate)` (short receives when rate is positive)
    - Sign flips when rate is negative
  - `accumulateFunding(payments: FundingPayment[]): string` — sums all individual funding payments; returns the net accumulated funding impact as a Decimal string
- `packages/core/fee/__tests__/funding.test.ts`

## Deliverables
- `packages/core/fee/funding.ts`
- `packages/core/fee/__tests__/funding.test.ts`

## Constraints
- All arithmetic must use the T-11-001 Decimal.js wrapper — no `new Decimal()` or native float
- `packages/core/fee/` must not import CCXT, Drizzle, Elysia, or Slack
- Funding rates are expressed as decimal fractions (e.g., `"0.0001"` for 0.01%)
- Sign convention: positive return value = position receives payment; negative = position pays
- `accumulateFunding` with an empty array returns `"0"`
- All functions are synchronous and pure — no IO, no side effects
- All inputs and outputs are `string` — Decimal.js is never exposed to callers
- All tests use `bun:test`

## Steps
1. Create `packages/core/fee/funding.ts` with `FundingPayment` interface
2. Write failing tests in `packages/core/fee/__tests__/funding.test.ts` (RED):
   - Long position, positive funding rate: `calculateFundingPayment({ positionNotional: "50000", fundingRate: "0.0001", side: "long" })` → `"-5"` (long pays $5)
   - Short position, positive funding rate: `calculateFundingPayment({ positionNotional: "50000", fundingRate: "0.0001", side: "short" })` → `"5"` (short receives $5)
   - Long position, negative funding rate: `calculateFundingPayment({ positionNotional: "50000", fundingRate: "-0.0001", side: "long" })` → `"5"` (long receives $5)
   - Short position, negative funding rate: `calculateFundingPayment({ positionNotional: "50000", fundingRate: "-0.0001", side: "short" })` → `"-5"` (short pays $5)
   - Zero funding rate: `calculateFundingPayment({ positionNotional: "50000", fundingRate: "0", side: "long" })` → `"0"`
   - Large notional: `calculateFundingPayment({ positionNotional: "1000000", fundingRate: "0.001", side: "long" })` → `"-1000"` (extreme funding)
   - `accumulateFunding([])` → `"0"` (empty array)
   - `accumulateFunding` with 3 payments (mixed positive/negative rates, long position) → correct net sum
   - `accumulateFunding` with 9 payments simulating 3 days of holding → correct accumulated total
   - Realistic scenario: 1 BTC long at $65000, held for 24 hours (3 funding intervals at rates 0.01%, 0.005%, -0.002%) → verify accumulated funding
3. Implement `packages/core/fee/funding.ts` (GREEN)
4. Refactor: add JSDoc to all exported functions and the `FundingPayment` interface

## Acceptance Criteria
- `calculateFundingPayment` correctly applies sign convention: long pays on positive rate, short receives on positive rate
- Sign flips correctly for negative funding rates
- `accumulateFunding` returns the correct sum of all individual payments
- `accumulateFunding([])` returns `"0"`
- Realistic multi-interval scenarios produce correct accumulated totals
- All functions accept and return `string` — no Decimal.js leakage
- All 10 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/fee/__tests__/funding.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Fetching funding rates from exchange APIs (EP01/EP11 M3 worker concern)
- Storing funding rates in the database (`funding_rates` table — EP11 M3)
- Funding rate prediction or alerting (EP11 M3 monitoring)
- Position notional calculation from quantity and mark price (caller responsibility)
- Funding rate schedule differences between exchanges (all use 8-hour convention)
- Historical funding rate backfill
