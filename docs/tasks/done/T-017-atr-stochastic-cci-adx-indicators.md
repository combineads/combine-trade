# T-017 Implement ATR, Stochastic, CCI, ADX indicators

## Goal
Add ATR, Stochastic Oscillator, CCI, and ADX indicators to `packages/core/indicator/`.

## Why
EP02-M1 requires a comprehensive indicator library. These four volatility and momentum indicators complete the core set needed for strategy definitions.

## Inputs
- `packages/core/indicator/types.ts` — OHLCVInput, IndicatorResult
- `packages/core/indicator/ema.ts` — EMA used in some smoothing calculations
- EP02 exec plan M1 specification

## Dependencies
- T-004 (indicator foundation — done)

## Expected Outputs
- `packages/core/indicator/atr.ts` — ATR pure function
- `packages/core/indicator/stochastic.ts` — Stochastic %K/%D pure function
- `packages/core/indicator/cci.ts` — CCI pure function
- `packages/core/indicator/adx.ts` — ADX pure function
- Updated barrel exports and types

## Deliverables
- ATR: True Range → Wilder's smoothed average
- Stochastic: %K (fast), %D (slow = SMA of %K)
- CCI: (Typical Price - SMA) / (0.015 × Mean Deviation)
- ADX: +DI, -DI, ADX from smoothed directional movement
- Unit tests for each indicator

## Constraints
- Pure functions, no external dependencies
- Handle edge cases: empty input, insufficient data
- ATR and ADX use OHLCV (high/low/close), not just close prices

## Steps
1. Write failing tests for ATR
2. Implement ATR
3. Write failing tests for Stochastic
4. Implement Stochastic
5. Write failing tests for CCI
6. Implement CCI
7. Write failing tests for ADX
8. Implement ADX
9. Add StochasticResult, ADXResult types
10. Update barrel exports

## Acceptance Criteria
- ATR produces correct values for known OHLCV data
- Stochastic %K between 0-100, %D is SMA of %K
- CCI correctly uses typical price and mean deviation
- ADX returns { adx, plusDI, minusDI } arrays
- All handle insufficient data gracefully

## Validation
```bash
bun test --filter "indicator"
bun run typecheck
bun run lint
```

## Out of Scope
- OBV, VWAP (separate task)
- Streaming/incremental calculation
