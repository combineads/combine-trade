# T-016 Implement RSI and MACD indicators

## Goal
Add RSI (Relative Strength Index) and MACD (Moving Average Convergence Divergence) indicators to `packages/core/indicator/`.

## Why
EP02-M1 requires a full indicator library. RSI and MACD are the most commonly used momentum and trend indicators, essential for strategy definitions.

## Inputs
- `packages/core/indicator/types.ts` — existing OHLCVInput, IndicatorResult types
- `packages/core/indicator/ema.ts` — EMA is a dependency for MACD calculation
- EP02 exec plan M1 specification

## Dependencies
- T-004 (technical indicator library foundation — done)

## Expected Outputs
- `packages/core/indicator/rsi.ts` — RSI pure function
- `packages/core/indicator/macd.ts` — MACD pure function returning { macd, signal, histogram }
- Updated `packages/core/indicator/index.ts` barrel export
- Updated `packages/core/indicator/types.ts` with MACDResult type

## Deliverables
- RSI implementation: classic Wilder's smoothing method
- MACD implementation: MACD line = EMA(12) - EMA(26), signal = EMA(9) of MACD, histogram = MACD - signal
- Unit tests validating against known datasets

## Constraints
- Pure functions only — no external dependencies
- Must handle edge cases: empty input, insufficient data length
- Results must match TradingView/ta-lib to 6 decimal places for standard inputs

## Steps
1. Write failing tests for RSI (standard 14-period, edge cases)
2. Implement RSI using Wilder's smoothing
3. Write failing tests for MACD (12/26/9 standard, edge cases)
4. Implement MACD reusing existing EMA function
5. Add MACDResult type to types.ts
6. Update barrel exports

## Acceptance Criteria
- RSI returns values between 0-100 for valid inputs
- RSI returns empty array for insufficient data (< period + 1)
- MACD returns { macd, signal, histogram } arrays
- All arrays same length where applicable
- Tests pass with known reference data

## Validation
```bash
bun test --filter "indicator"
bun run typecheck
bun run lint
```

## Out of Scope
- Streaming/incremental calculation (future optimization)
- ATR, Stochastic, CCI, ADX, OBV, VWAP (separate tasks)
