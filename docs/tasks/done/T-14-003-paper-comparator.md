# T-14-003 Paper vs backtest comparator

## Goal
Implement `packages/execution/paper/comparator.ts` with pure statistical functions: win rate z-test (one-sided), Sharpe ratio (annualized √365 for 24/7 crypto), max drawdown calculation, and expectancy comparison.

## Why
EP14 M4 requires comparing paper trading results to backtest results to determine if a strategy performs similarly in live conditions. The z-test gates real trading: if paper winrate is statistically significantly worse than backtest, the strategy isn't ready.

## Inputs
- EP14 M4 spec
- EP11 `packages/shared/decimal/arithmetic.ts`

## Dependencies
- None

## Expected Outputs
- `packages/execution/paper/comparator.ts`
- `packages/execution/paper/__tests__/comparator.test.ts`

## Deliverables
- `packages/execution/paper/comparator.ts`
- `packages/execution/paper/__tests__/comparator.test.ts`

## Constraints
- Decimal.js for all calculations
- Pure functions, no side effects
- Z-test: one-sided, pass threshold z ≥ -1.645 (p < 0.05)
- Sharpe: annualized with √365 (crypto trades 24/7)

## Steps
1. Write failing tests:
   - zTestWinRate: paper=0.60, backtest=0.65, n=30 → compute z, check pass/fail
   - zTestWinRate: paper=0.40, backtest=0.65, n=30 → fail (z < -1.645)
   - zTestWinRate: identical rates → pass
   - zTestWinRate: small sample (n=5) → still computes correctly
   - sharpeRatio: positive daily returns → annualized value
   - sharpeRatio: all zero returns → 0
   - sharpeRatio: negative mean → negative Sharpe
   - maxDrawdown: series with drawdown
   - maxDrawdown: monotonically increasing → 0
   - maxDrawdown: single value → 0
   - expectancyComparison: paper vs backtest expectancy delta
2. Implement:
   - `zTestWinRate(paperWinRate, backtestWinRate, paperSampleCount): { z, pass }`
   - `sharpeRatio(dailyReturns): string` — annualized √365
   - `maxDrawdown(equityCurve): string` — percentage max drawdown
   - `expectancyDelta(paperExpectancy, backtestExpectancy): string`
3. Refactor

## Acceptance Criteria
- Z-test mathematically correct against known values
- Sharpe ratio annualized with √365
- Max drawdown correct for various equity curves
- All calculations use Decimal.js
- 11+ tests pass

## Validation
```bash
bun test packages/execution/paper/__tests__/comparator.test.ts
bun run typecheck
```

## Out of Scope
- Readiness score composition (T-14-004)
- DB persistence
- Pearson correlation (explicitly rejected in Decision log)
