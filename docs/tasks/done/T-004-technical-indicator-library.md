# T-004 Implement technical indicator library

## Goal
Create a technical indicator library in `packages/core/indicator/` wrapping `@ixjb94/indicators` with typed interfaces and unit tests for SMA, EMA, and Bollinger Bands.

## Why
Technical indicators are the foundation of strategy evaluation. The strategy sandbox API exposes these as built-in functions. They must be correct and well-tested before any strategy work begins.

## Inputs
- `docs/ARCHITECTURE.md` § "packages/core/indicator"
- `docs/TECH_STACK.md` § "Domain packages" — `@ixjb94/indicators`
- `docs/ARCHITECTURE.md` § "Decimal precision boundary" — indicators use native float (not Decimal.js)
- T-001 outputs: `packages/core/indicator/` directory stub

## Dependencies
- T-001 (monorepo structure with packages/core/)

## Expected Outputs
- `packages/core/indicator/sma.ts` — Simple Moving Average
- `packages/core/indicator/ema.ts` — Exponential Moving Average
- `packages/core/indicator/bb.ts` — Bollinger Bands (middle, upper, lower)
- `packages/core/indicator/types.ts` — shared indicator types (OHLCVInput, IndicatorResult)
- `packages/core/indicator/index.ts` — barrel export
- Unit tests for each indicator with known-value verification

## Deliverables
- Working indicator library with SMA, EMA, BB
- Unit tests verifying numerical correctness against known reference values
- Typed interfaces for all indicators

## Constraints
- Use native `number` (float64) for all indicator calculations — NOT Decimal.js (per ARCHITECTURE.md § "Decimal precision boundary")
- Wrap `@ixjb94/indicators` — do not implement from scratch
- packages/core/indicator is a leaf module: no dependencies on other core packages
- Must not import Elysia, CCXT, Drizzle, or Slack SDK

## Steps
1. Install `@ixjb94/indicators` in packages/core
2. Define types: `OHLCVInput`, `IndicatorResult`, individual indicator params
3. Implement SMA wrapper with typed interface
4. Implement EMA wrapper with typed interface
5. Implement BB wrapper returning { middle, upper, lower }
6. Write unit tests with known reference values (e.g., SMA(5) of [1,2,3,4,5] = 3)
7. Create barrel export in index.ts
8. Verify `bun test --filter indicator` passes

## Acceptance Criteria
- SMA, EMA, BB functions exported from `@combine/core/indicator`
- All calculations match reference values in tests
- At least 5 test cases per indicator
- No Decimal.js usage in indicator code
- `bun test --filter indicator` passes

## Validation
```bash
bun test --filter "indicator"
```

## Out of Scope
- RSI, MACD, ATR (added in EP02 when strategy API is defined)
- Integration with strategy sandbox (EP02)
- Real-time streaming indicators
