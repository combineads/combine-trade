# T-17-002 Double-BB pattern detector

## Goal
Implement BB20/BB4 pattern detection logic that classifies Double-BB variants (trend/reversal/breakout) and sides (bullish/bearish).

## Why
EP17 M2 — the core pattern detection is the foundation of the Double-BB strategy, determining when trading signals occur.

## Inputs
- EP17 exec plan M2 spec

## Dependencies
None (pure domain logic)

## Expected Outputs
- `detectDoubleBB(candles, bb20, bb4)` function
- `DoubleBBResult` type with variant and side

## Deliverables
- `packages/core/strategy/double-bb/detector.ts`
- `packages/core/strategy/double-bb/__tests__/detector.test.ts`

## Constraints
- Pure functions, no DB/network access
- Deterministic: same input → same output
- Variants: trend_continuation, reversal, breakout
- Priority: breakout > reversal > trend
- Side: bullish or bearish based on BB4 band relationship

## Steps
1. Define DoubleBBResult, BollingerBands interfaces
2. Implement variant classification (trend, reversal, breakout)
3. Implement side detection (bullish/bearish)
4. Write tests for 3 variants × 2 sides = 6 combinations

## Acceptance Criteria
- Trend continuation correctly detected
- Reversal with wick >= 2x body detected
- Breakout with BB20 expansion + strong body >= 60% range
- Bullish/bearish side correct
- No pattern → null result

## Validation
```bash
bun test packages/core/strategy/double-bb/__tests__/detector.test.ts
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files changed: `packages/core/strategy/double-bb/detector.ts`, `packages/core/strategy/double-bb/__tests__/detector.test.ts`
- Approach: Pure function with priority chain: breakout > reversal > trend_continuation
- Detection logic: breakout requires strong body (≥60% range) + BB20 expansion + close beyond band; reversal requires wick ≥ 2× body near BB20 band; trend requires price near BB20 band + BB4 middle moving in direction
- Tests: 8 tests covering all 6 variant×side combos + no-pattern + priority ordering
- Validation: 8/8 pass, typecheck clean

## Outputs
- `DoubleBBResult` interface: `{ variant: DoubleBBVariant; side: DoubleBBSide }`
- `CandleBar` interface: `{ open, high, low, close, volume }`
- `BollingerBands` interface: `{ upper, middle, lower }`
- `detectDoubleBB(candle, bb20, bb4, prevBb4, prevBb20?)` → `DoubleBBResult | null`

## Out of Scope
- Evidence system
- Event gate
- Feature definitions
