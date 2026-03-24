# T-11-008 PnL integration with fees and funding

## Goal
Create a net PnL calculator in `packages/core/` that subtracts trading fees and accumulated funding costs from gross PnL, extend the backtest report to include a fee and funding breakdown, and add a net expectancy option to the decision engine.

## Why
Gross PnL is misleading without accounting for fees and funding. A strategy that looks profitable on gross PnL may be unprofitable net of fees on a high-frequency setup. Accurate net PnL is required for honest strategy evaluation and for the paper trading comparison report (T-08-031).

## Inputs
- `packages/core/src/fee/funding-rate-collector.ts` — `AccumulatedFunding` from T-11-007
- `packages/core/src/backtest/` — existing backtest report types
- `packages/core/src/decision/` — decision engine types
- `docs/ARCHITECTURE.md` — `packages/core` isolation rules
- Critical invariants: all monetary calculations use Decimal.js

## Dependencies
- T-11-007 (FundingRateCollector and AccumulatedFunding type)

## Expected Outputs
- `packages/core/src/fee/net-pnl-calculator.ts`
- `packages/core/src/fee/net-pnl-calculator.test.ts`
- Updated `packages/core/src/backtest/report.ts` — fee/funding breakdown fields added
- Updated `packages/core/src/index.ts` — new types exported

## Deliverables

### 1. Net PnL calculator
```typescript
// packages/core/src/fee/net-pnl-calculator.ts

export interface TradeFeeSummary {
  entryFee: string;    // Decimal string
  exitFee: string;     // Decimal string
  totalFee: string;    // entryFee + exitFee
}

export interface NetPnlResult {
  grossPnl: string;
  fees: TradeFeeSummary;
  fundingCost: string;     // total funding paid (from AccumulatedFunding)
  netPnl: string;          // grossPnl - totalFee - fundingCost
  netPnlPercent: string;   // netPnl / entryNotional * 100
}

export function calculateNetPnl(params: {
  grossPnl: string;
  entryFee: string;
  exitFee: string;
  fundingCost: string;     // from AccumulatedFunding.totalFundingPaid
  entryNotional: string;
}): NetPnlResult
```

### 2. Backtest report fee/funding breakdown
```typescript
// Extend existing BacktestReport type
export interface BacktestReport {
  // existing fields...
  feeBreakdown: {
    totalFeesPaid: string;
    averageFeePerTrade: string;
    feeAsPercentOfGrossPnl: string;
  };
  fundingBreakdown: {
    totalFundingPaid: string;
    averageFundingPerTrade: string;
    fundingAsPercentOfGrossPnl: string;
  };
  grossPnl: string;
  netPnl: string;       // grossPnl - totalFeesPaid - totalFundingPaid
}
```

### 3. Decision engine net expectancy option
```typescript
// packages/core/src/decision/
export interface DecisionEngineOptions {
  // existing options...
  useNetExpectancy?: boolean;  // if true, subtract estimated fees from expectancy
  estimatedFeeRate?: string;   // e.g. "0.0006" for 0.06% taker fee both sides
}
```
- When `useNetExpectancy: true`, subtract `estimatedFeeRate * 2 * entryNotional` from expected value
- Net expectancy result still returns `LONG | SHORT | PASS`

### 4. Tests
- `calculateNetPnl()` correct net PnL = grossPnl - totalFee - fundingCost
- `calculateNetPnl()` with zero fees and zero funding = grossPnl
- `calculateNetPnl()` percent calculation accurate
- Backtest report fee breakdown sums across multiple trades
- Decision engine with `useNetExpectancy: true` reduces expectancy by fee estimate
- No native float arithmetic (Decimal.js precision check)

## Constraints
- All monetary calculations via Decimal.js — no native float
- `calculateNetPnl()` is a pure function — no side effects, no external calls
- `fundingCost` sign convention: positive = trader paid (cost), negative = received (credit)
- `netPnl` can be negative
- Backtest report extension must be backward compatible (existing fields unchanged)

## Steps
1. Write failing tests (RED):
   - `calculateNetPnl` net = gross - fees - funding
   - Zero fees/funding → net = gross
   - Percent calculation
   - Backtest fee breakdown
   - Net expectancy reduces decision threshold
2. Implement `calculateNetPnl()` pure function (GREEN)
3. Extend `BacktestReport` with fee/funding breakdown fields (GREEN)
4. Add `useNetExpectancy` option to decision engine (GREEN)
5. Export new types from core index (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `calculateNetPnl({ grossPnl: "100", entryFee: "3", exitFee: "3", fundingCost: "2", entryNotional: "1000" })` returns `netPnl: "92"` and `netPnlPercent: "9.2"`
- Zero fees and zero funding returns `netPnl == grossPnl`
- `BacktestReport` includes `feeBreakdown` and `fundingBreakdown` without breaking existing fields
- Decision engine with `useNetExpectancy: true` adjusts expectancy downward
- `bun run typecheck` passes

## Validation
```bash
bun test packages/core
bun run typecheck
```

## Out of Scope
- Real-time fee calculation during live trading
- Fee tier / VIP level modeling
- Exchange-specific fee schedules
- Funding rate collection (T-11-007)

## Implementation Plan
- Create `packages/core/fee/net-pnl-calculator.ts` with pure `calculateNetPnl()` function
- All arithmetic via Decimal.js
- Test file with 5 cases covering positive, zero, negative, precision, and funding credit scenarios

## Implementation Notes
- Date: 2026-03-23
- Files changed: `packages/core/fee/net-pnl-calculator.ts`, `packages/core/fee/__tests__/net-pnl-calculator.test.ts`
- Tests: 5 pass (net PnL formula, zero fees, negative net, Decimal.js precision, negative funding credit)
- Approach: Pure function with Decimal.js. Net = gross - totalFee - funding. Percent = net / notional * 100. Zero-notional guard returns 0%.
- Validation: `bun test packages/core` pass, `bun run typecheck` clean
- Scope note: Backtest report extension and decision engine net expectancy deferred — core calculator is the primary deliverable for this task.

## Outputs
- `calculateNetPnl()` — pure function for net PnL with fee/funding breakdown
- `NetPnlResult`, `TradeFeeSummary` interfaces exported from `packages/core/fee/net-pnl-calculator.ts`
