# T-14-001 Paper order matcher

## Goal
Implement a pure function paper order matcher in `packages/execution/paper/matcher.ts` that simulates market order fills using next-candle-open pricing with configurable slippage, and SL/TP exit simulation by scanning candle high/low.

## Why
EP14 M1 requires a virtual execution engine. The matcher is the core: it determines entry fill price (next candle open ± slippage) and exit trigger (SL/TP hit detection per candle). This must match the labeler's logic (EP04) for consistency.

## Inputs
- EP14 M1 spec
- EP04 `packages/core/label/labeler.ts` — SL/TP hit detection logic (same rules: SL wins on same-bar)
- EP11 `packages/core/fee/calculator.ts` — fee calculation
- EP11 `packages/shared/decimal/arithmetic.ts` — Decimal.js wrapper

## Dependencies
- None (uses existing shared/core packages)

## Expected Outputs
- `packages/execution/paper/matcher.ts`
- `packages/execution/paper/types.ts`
- `packages/execution/paper/__tests__/matcher.test.ts`

## Deliverables
- `packages/execution/paper/matcher.ts`
- `packages/execution/paper/types.ts`
- `packages/execution/paper/__tests__/matcher.test.ts`

## Constraints
- All price calculations use Decimal.js (string in/out)
- No DB access, no network calls — pure functions
- SL/TP logic must be consistent with labeler: on same-bar SL+TP hit, SL wins
- Slippage is configurable with default 0.05%
- `packages/execution/` must not import Elysia, CCXT, Drizzle

## Steps
1. Create `packages/execution/paper/types.ts` with types: PaperOrderConfig, PaperFill, PaperExitResult, PaperCandle
2. Write failing tests for:
   - Market fill: LONG at next candle open + slippage
   - Market fill: SHORT at next candle open - slippage
   - Custom slippage override
   - SL hit on candle low (LONG)
   - TP hit on candle high (LONG)
   - SL hit on candle high (SHORT)
   - TP hit on candle low (SHORT)
   - Same-bar SL+TP → SL wins
   - No exit when price doesn't reach SL/TP
   - Multi-candle scan finds first exit bar
   - Fee calculation included in fill
3. Implement `simulateMarketFill(direction, openPrice, config)` and `scanForExit(direction, entryPrice, slPrice, tpPrice, candles)`
4. Refactor

## Acceptance Criteria
- Fill price = next candle open ± slippage (direction-aware)
- SL/TP scanning matches labeler logic
- Same-bar conflict → SL wins
- All prices use Decimal.js strings
- 11+ tests pass

## Validation
```bash
bun test packages/execution/paper/__tests__/matcher.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Limit orders, partial fills, order book simulation
- DB persistence of paper orders
- Integration with execution worker
