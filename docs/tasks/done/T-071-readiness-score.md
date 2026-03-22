# T-071 Readiness score calculator

## Goal
Implement `packages/execution/paper/readiness.ts` — a composite 0-100 score calculator with 4 categories (Backtest 35pt, Paper 35pt, Risk Setup 20pt, Manual 10pt) that gates paper→live transition.

## Why
EP14 M4 requires a quantitative gate before enabling live trading. The readiness score prevents premature deployment of strategies that haven't been sufficiently validated.

## Inputs
- EP14 M4 spec (detailed scoring rules)
- T-070 `packages/execution/paper/comparator.ts` — z-test, Sharpe, drawdown

## Dependencies
- T-070 (comparator functions)

## Expected Outputs
- `packages/execution/paper/readiness.ts`
- `packages/execution/paper/__tests__/readiness.test.ts`

## Deliverables
- `packages/execution/paper/readiness.ts`
- `packages/execution/paper/__tests__/readiness.test.ts`

## Constraints
- Pure function — takes input data, returns score breakdown
- No DB access
- Gate thresholds: 0-69 LOCKED, 70-89 CAUTION, 90-100 READY
- Reset conditions: loss limit breach or kill switch → score=0

## Steps
1. Define ReadinessInput, ReadinessScore, ScoreCategory types
2. Write failing tests:
   - Perfect score: all criteria met → 100
   - Zero score: nothing met → 0
   - Backtest category: min trades, expectancy, Sharpe, drawdown sub-scores
   - Paper category: duration, trades, z-test, loss limit sub-scores
   - Risk category: daily limit, position sizing, kill switch test, exchange creds
   - Manual category: risk ack, go-live confirmation
   - Gate classification: <70 LOCKED, 70-89 CAUTION, ≥90 READY
   - Reset: loss limit breach → score 0
   - Reset: kill switch triggered → score 0
   - Partial scores add up correctly
   - Paper auto-extend: trades < 10 after 7 days → recommend 14 days
3. Implement `calculateReadinessScore(input): ReadinessScore`
4. Refactor

## Acceptance Criteria
- Score breakdown matches EP14 M4 spec exactly
- Gate thresholds enforced
- Reset conditions return score 0
- 12+ tests pass

## Validation
```bash
bun test packages/execution/paper/__tests__/readiness.test.ts
bun run typecheck
```

## Out of Scope
- API endpoint for readiness check
- UI display
- DB persistence of score history
