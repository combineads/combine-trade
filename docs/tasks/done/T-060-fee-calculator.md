# T-060 Fee calculator

## Goal
Implement a fee calculation module in `packages/core/fee/calculator.ts` that computes trading fees for maker and taker orders, round-trip (entry + exit) fees, and net PnL after fee deduction. All arithmetic uses Decimal.js via the T-058 wrapper. The module is a set of pure functions with no exchange connectivity.

## Why
EP11 M2 requires accurate fee calculations for PnL reporting and decision-making. Trading fees directly impact profitability — a strategy with a positive gross expectancy can be net-negative after fees. Binance charges 0.02% maker / 0.04% taker, OKX charges 0.02% maker / 0.05% taker. By implementing fee calculation as pure functions, the backtest engine, labeler, and risk gate can all compute fee-adjusted PnL without exchange API calls or database lookups.

## Inputs
- EP11 M2 spec — fee calculator with maker/taker rates, round-trip calculation, net PnL
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia, or Slack
- T-058 `packages/shared/decimal/arithmetic.ts` — `add`, `sub`, `mul`, `div`

## Dependencies
- T-058 (Decimal.js financial arithmetic wrapper)

## Expected Outputs
- `packages/core/fee/calculator.ts`
  - `FeeSchedule` interface:
    ```ts
    interface FeeSchedule {
      makerRate: string;  // e.g. "0.0002" for 0.02%
      takerRate: string;  // e.g. "0.0004" for 0.04%
    }
    ```
  - `calculateFee(qty: string, price: string, rate: string): string` — returns `qty * price * rate` as a Decimal string
  - `calculateRoundTripFee(qty: string, entryPrice: string, exitPrice: string, schedule: FeeSchedule): string` — returns total fees for a round trip assuming entry at taker rate and exit at taker rate (worst case); formula: `calculateFee(qty, entryPrice, takerRate) + calculateFee(qty, exitPrice, takerRate)`
  - `calculateNetPnl(grossPnl: string, totalFees: string): string` — returns `grossPnl - totalFees`
- `packages/core/fee/__tests__/calculator.test.ts`

## Deliverables
- `packages/core/fee/calculator.ts`
- `packages/core/fee/__tests__/calculator.test.ts`

## Constraints
- All arithmetic must use the T-058 Decimal.js wrapper — no `new Decimal()` or native float
- `packages/core/fee/` must not import CCXT, Drizzle, Elysia, or Slack
- Fee rates are expressed as decimal fractions (e.g., `"0.0004"` for 0.04%), not as percentages
- `calculateRoundTripFee` uses `takerRate` for both legs as worst-case default — callers who know the order type can call `calculateFee` directly with the appropriate rate
- All functions are synchronous and pure — no IO, no side effects
- All inputs and outputs are `string` — Decimal.js is never exposed to callers
- All tests use `bun:test`

## Steps
1. Create `packages/core/fee/calculator.ts` with `FeeSchedule` interface
2. Write failing tests in `packages/core/fee/__tests__/calculator.test.ts` (RED):
   - `calculateFee("1", "50000", "0.0004")` → `"20"` (1 BTC * $50000 * 0.04% = $20)
   - `calculateFee("0.5", "50000", "0.0002")` → `"5"` (0.5 BTC * $50000 * 0.02% = $5)
   - `calculateFee("0", "50000", "0.0004")` → `"0"` (zero quantity = zero fee)
   - `calculateFee("1", "0", "0.0004")` → `"0"` (zero price = zero fee)
   - `calculateRoundTripFee("1", "50000", "51000", binanceSchedule)` → entry fee `"20"` + exit fee `"20.4"` = `"40.4"` (using takerRate `"0.0004"`)
   - `calculateRoundTripFee("0.1", "50000", "49000", binanceSchedule)` → entry `"2"` + exit `"1.96"` = `"3.96"` (losing trade still has fees)
   - `calculateNetPnl("1000", "40.4")` → `"959.6"` (profitable trade minus fees)
   - `calculateNetPnl("-500", "40.4")` → `"-540.4"` (losing trade plus fees makes it worse)
   - `calculateNetPnl("0", "20")` → `"-20"` (breakeven gross → net loss from fees)
   - `calculateNetPnl("40.4", "40.4")` → `"0"` (gross profit exactly equals fees → breakeven)
   - Realistic Binance scenario: buy 0.01 BTC at $65000, sell at $66000, taker fee both ways → verify gross PnL, fees, and net PnL
   - Realistic OKX scenario: buy 0.5 ETH at $3500, sell at $3450 (loss), taker 0.05% → verify net PnL is more negative than gross
3. Implement `packages/core/fee/calculator.ts` (GREEN)
4. Refactor: add JSDoc to all exported functions and the `FeeSchedule` interface

## Acceptance Criteria
- `calculateFee` correctly computes `qty * price * rate` using Decimal.js
- `calculateRoundTripFee` sums entry and exit fees using taker rate for both legs
- `calculateNetPnl` correctly subtracts total fees from gross PnL (works for positive, negative, and zero gross PnL)
- Realistic exchange scenarios produce results consistent with actual exchange fee structures
- All functions accept and return `string` — no Decimal.js leakage
- All 12 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/fee/__tests__/calculator.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Fee schedule storage in database (EP11 M2 concern, not this task)
- VIP tier fee rate management
- BNB/OKB fee discount calculations
- Maker vs taker detection from order type (caller responsibility)
- Fee denomination currency handling (assumes quote currency, e.g., USDT)
- Funding rate calculations (covered by T-061)
