# T-14-002 Paper balance & position tracker

## Goal
Implement pure functions in `packages/execution/paper/balance.ts` for virtual balance management and position tracking: apply fills to balance, track open positions, calculate unrealized PnL, and compute period summaries.

## Why
EP14 M2 requires tracking virtual money. The balance tracker maintains the state of paper trading — how much virtual capital remains, what positions are open, and what the running PnL looks like.

## Inputs
- EP14 M2 spec
- T-14-001 `packages/execution/paper/types.ts` — PaperFill type
- EP11 `packages/shared/decimal/arithmetic.ts` — Decimal.js wrapper
- EP11 `packages/core/fee/calculator.ts` — fee deduction

## Dependencies
- T-14-001 (paper matcher types)

## Expected Outputs
- `packages/execution/paper/balance.ts`
- `packages/execution/paper/__tests__/balance.test.ts`

## Deliverables
- `packages/execution/paper/balance.ts`
- `packages/execution/paper/__tests__/balance.test.ts`

## Constraints
- All monetary calculations use Decimal.js strings
- Pure functions — state is passed in and returned (no mutation)
- No DB access

## Steps
1. Define types: PaperBalance, PaperPosition, BalanceUpdate
2. Write failing tests:
   - applyFill: LONG entry reduces available balance by margin
   - applyFill: LONG exit adds PnL to balance
   - applyFill: SHORT entry/exit mirror
   - calculateUnrealizedPnl: LONG position with current price above entry
   - calculateUnrealizedPnl: SHORT position with current price below entry
   - calculateMargin: notional / leverage
   - resetBalance: returns to initial balance, preserves history marker
   - computePeriodSummary: total PnL, win count, loss count, winrate
3. Implement functions
4. Refactor

## Acceptance Criteria
- Balance correctly updated on entry (margin deducted) and exit (PnL applied)
- Unrealized PnL accurate for both LONG and SHORT
- Period summary computes correct aggregate stats
- All Decimal.js, no native floats for monetary values
- 10+ tests pass

## Validation
```bash
bun test packages/execution/paper/__tests__/balance.test.ts
bun run typecheck
```

## Out of Scope
- DB persistence
- Multiple concurrent positions per symbol
- Forced liquidation
