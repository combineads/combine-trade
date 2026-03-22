# T-095 Sandbox context injection (direction, timeframe, symbol)

## Goal
Extend the strategy sandbox context to inject direction, timeframe, and symbol so strategy scripts can filter events by direction.

## Why
EP17 M1 — Double-BB strategy needs context.direction to ignore bearish patterns in LONG mode and vice versa.

## Inputs
- `packages/core/strategy/types.ts` (existing StrategyContext)

## Dependencies
None (existing code extension)

## Expected Outputs
- Extended StrategyContext with direction, timeframe, symbol fields
- Updated sandbox executor to pass these fields

## Deliverables
- Updated `packages/core/strategy/types.ts` (add direction, timeframe, symbol to StrategyContext)
- Updated sandbox executor if needed
- `packages/core/strategy/__tests__/context-injection.test.ts`

## Constraints
- Backward compatible: existing strategies without these fields still work
- Must not break existing strategy tests

## Steps
1. Add direction, timeframe, symbol to StrategyContext interface
2. Update sandbox executor to pass these from strategy metadata
3. Write tests for context availability in sandbox

## Acceptance Criteria
- context.direction accessible in strategy scripts
- context.timeframe accessible in strategy scripts
- context.symbol accessible in strategy scripts
- Existing strategy tests still pass

## Validation
```bash
bun test packages/core/strategy/__tests__/context-injection.test.ts
bun test -- --filter "sandbox|executor"
bun run typecheck
```

## Out of Scope
- indicator_config pre-compute
- timeframes[] schema migration
