# T-072 Paper trading integration test

## Goal
Write integration tests in `tests/integration/paper-trading.test.ts` that compose the full paper trading pipeline: order matching → balance tracking → performance comparison → readiness scoring.

## Why
Unit tests verify each module in isolation. This integration test catches interface mismatches when all four EP14 computation modules are chained together.

## Inputs
- T-068 paper matcher
- T-069 paper balance tracker
- T-070 paper comparator
- T-071 readiness score

## Dependencies
- T-068, T-069, T-070, T-071

## Expected Outputs
- `tests/integration/paper-trading.test.ts`

## Deliverables
- `tests/integration/paper-trading.test.ts`

## Constraints
- No DB, no network — all hardcoded fixtures
- All monetary values as Decimal.js strings
- bun:test

## Steps
1. Write tests:
   - Full winning trade: fill → balance update → position close → PnL correct
   - Full losing trade: fill → SL hit → balance deducted
   - Multi-trade session: 5 trades → period summary → comparator stats → readiness score
   - SHORT trade lifecycle
   - Readiness gate: sufficient data → READY vs insufficient → LOCKED
2. Implement

## Acceptance Criteria
- Full pipeline composes correctly
- Balance reflects all trades accurately
- Readiness score uses real comparator output
- 5+ tests pass

## Validation
```bash
bun test tests/integration/paper-trading.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Worker integration
- DB persistence
