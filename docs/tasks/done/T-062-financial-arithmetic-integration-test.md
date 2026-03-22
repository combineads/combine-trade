# T-062 Financial arithmetic integration test

## Goal
Write an integration test that composes the full financial arithmetic pipeline — precision rounding, fee calculation, funding rate accumulation, and net PnL computation — in a realistic perpetual futures trade scenario. The test proves that all four modules (T-058 through T-061) integrate correctly and produce financially accurate results when chained together.

## Why
Unit tests for T-058 through T-061 verify each module in isolation. This integration test catches interface mismatches, rounding propagation errors, and composition bugs that only surface when all four modules work together in a realistic trade flow. It serves as the canonical end-to-end specification for EP11's financial arithmetic layer and provides a regression safety net before these modules are wired into the backtest engine, labeler, and live order executor.

## Inputs
- T-058 `packages/shared/decimal/arithmetic.ts` — `add`, `sub`, `mul`
- T-059 `packages/shared/decimal/precision.ts` — `roundPrice`, `roundQuantity`, `validateMinNotional`, `PrecisionRules`
- T-060 `packages/core/fee/calculator.ts` — `calculateFee`, `calculateRoundTripFee`, `calculateNetPnl`, `FeeSchedule`
- T-061 `packages/core/fee/funding.ts` — `calculateFundingPayment`, `accumulateFunding`, `FundingPayment`
- T-047 `tests/integration/alert-execution.test.ts` and T-057 `tests/integration/risk-management.test.ts` as structural references for integration test layout

## Dependencies
- T-058 (Decimal.js financial arithmetic wrapper)
- T-059 (exchange precision validator)
- T-060 (fee calculator)
- T-061 (funding rate calculator)

## Expected Outputs
- `tests/integration/financial-arithmetic.test.ts`

## Deliverables
- `tests/integration/financial-arithmetic.test.ts`

## Constraints
- No real DB, no real exchange, no real network — all values are hardcoded fixtures
- All monetary fixture values are Decimal.js-compatible strings (e.g., `"65000"`, `"0.001"`, `"0.0004"`)
- The test file must import from package paths (`packages/shared/decimal`, `packages/core/fee`) — not relative `../../` chains
- Each test uses self-contained fixtures — no shared mutable state between tests
- All arithmetic expectations are verified to exact string equality (no floating-point tolerance)
- All tests use `bun:test`

## Steps
1. Define top-level fixtures and constants:
   - `BINANCE_PRECISION: PrecisionRules` — `{ tickSize: "0.10", lotSize: "0.001", minNotional: "5" }`
   - `BINANCE_FEES: FeeSchedule` — `{ makerRate: "0.0002", takerRate: "0.0004" }`
   - Trade scenario: buy 0.05 BTC at $65,432.17, sell at $66,100.53, held for 24 hours (3 funding intervals)
   - Funding rates: `["0.0001", "0.00005", "-0.00003"]`

2. Write tests (RED):

   **Test A — Precision rounding pipeline**
   - Round entry price `"65432.17"` with tick `"0.10"` → `"65432.10"`
   - Round exit price `"66100.53"` with tick `"0.10"` → `"66100.50"`
   - Round quantity `"0.05123"` with lot `"0.001"` → `"0.051"`
   - Validate min notional: `"0.051"` * `"65432.10"` vs min `"5"` → passes (notional ~$3337)
   - Assert all rounded values are exact string matches

   **Test B — Fee calculation with rounded values**
   - Using rounded values from Test A scenario:
   - Entry fee: `calculateFee("0.051", "65432.10", "0.0004")` → verify exact result
   - Exit fee: `calculateFee("0.051", "66100.50", "0.0004")` → verify exact result
   - Round-trip fee: sum of entry + exit fees → verify against `calculateRoundTripFee`
   - Assert round-trip fee equals the sum of individual fees

   **Test C — Funding rate accumulation over holding period**
   - Position notional at each funding time (using rounded entry price * rounded qty):
     - All 3 intervals at notional `mul("0.051", "65432.10")`
   - Calculate 3 funding payments for a long position at rates `"0.0001"`, `"0.00005"`, `"-0.00003"`
   - Accumulate all 3 → verify net funding impact
   - Assert net funding is negative (long pays net positive funding)

   **Test D — Full pipeline: precision → fees → funding → net PnL**
   - Start with raw prices and quantity
   - Step 1: Round price and quantity to exchange precision
   - Step 2: Validate min notional
   - Step 3: Calculate gross PnL: `(exitPrice - entryPrice) * quantity`
   - Step 4: Calculate round-trip trading fees
   - Step 5: Calculate accumulated funding over holding period
   - Step 6: Calculate net PnL: `grossPnl - tradingFees + fundingImpact`
   - Assert: `grossPnl - tradingFees + fundingImpact === netPnl` (exact string equality)
   - Assert: net PnL < gross PnL (fees erode profit)

   **Test E — Losing trade scenario**
   - Buy 0.1 BTC at $65,000, sell at $64,200 (loss), held for 48 hours (6 funding intervals, all positive rates)
   - Round all values through precision
   - Compute gross PnL (negative), fees (always positive cost), funding (long pays on positive rates)
   - Assert: net PnL is more negative than gross PnL (fees + funding make the loss worse)
   - Assert: the exact arithmetic identity holds: `netPnl = grossPnl - fees + funding`

   **Test F — Breakeven analysis**
   - Given entry price, quantity, and fee schedule, calculate the minimum exit price needed to break even after fees
   - Using: `breakeven exit = entryPrice + (roundTripFeePerUnit)` where `roundTripFeePerUnit = entryPrice * takerRate * 2`
   - Round breakeven exit to tick size
   - Verify that selling at this price produces net PnL >= 0
   - Verify that selling one tick below produces net PnL < 0

3. Implement all test assertions with exact expected values (computed by hand or by a reference calculator)
4. Ensure all imports use package paths

## Acceptance Criteria
- Test A verifies that precision rounding produces exchange-compliant values
- Test B verifies that fee calculation on rounded values is exact and consistent
- Test C verifies that funding accumulation correctly handles mixed positive/negative rates
- Test D proves the full pipeline composes correctly: `netPnl = grossPnl - tradingFees + fundingImpact`
- Test E proves that fees and funding amplify losses on losing trades
- Test F proves breakeven analysis is precise to the tick level
- All 6 tests pass, zero TypeScript errors
- No floating-point tolerance in assertions — all comparisons are exact string equality

## Validation
```bash
bun test tests/integration/financial-arithmetic.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Performance benchmarking of Decimal.js vs native float
- Database integration for storing fee schedules or funding rates
- Backtest engine integration (EP11 M4 concern)
- Exchange API calls for real-time prices or rates
- Multi-asset portfolio-level PnL aggregation
- Slippage modeling or market impact estimation
