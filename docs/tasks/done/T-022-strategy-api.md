# T-022 Implement Strategy API for sandbox

## Goal
Design and implement the Strategy API surface available inside the V8 isolate sandbox, providing Pine Script-level candle and indicator access.

## Why
EP02-M4 requires strategies to access candle data and indicators through a safe, well-defined API. This API is the only interface between strategy code and the system.

## Inputs
- `packages/core/strategy/sandbox.ts` — Sandbox runtime from T-021
- `packages/core/indicator/` — All indicator implementations
- EP02 exec plan M4 specification

## Dependencies
- T-021 (sandbox runtime)
- T-016 (RSI, MACD indicators)
- T-017 (ATR, Stochastic, CCI, ADX indicators)
- T-018 (OBV, VWAP indicators)

## Expected Outputs
- `packages/core/strategy/api.ts` — Strategy API definition and injection
- `packages/core/strategy/api-types.ts` — TypeScript types for the API surface

## Deliverables
- Candle data access: `candle(symbol, timeframe, offset)`, shorthand `close`, `open`, `high`, `low`, `volume`, `bar_index`
- Indicator access: `indicator.sma(source, period)`, `indicator.ema(...)`, `indicator.bb(...)`, `indicator.rsi(...)`, `indicator.macd(...)`, etc.
- Feature definition: `defineFeature(name, value, normalization)`
- Trade conditions (optional): `setEntry(condition)`, `setExit(condition)`
- API injection into V8 isolate via `isolated-vm` references

## Constraints
- API functions must be injected as references into the isolate (not transferred code)
- Candle data is pre-loaded before execution — strategies cannot trigger async fetches
- All indicator calls use the pre-loaded candle data
- defineFeature results collected after execution

## Steps
1. Define StrategyAPI TypeScript interface
2. Write failing tests: indicator calls return correct values, defineFeature collects features
3. Implement candle data provider (pre-loads data, exposes via API)
4. Implement indicator wrapper that calls pure indicator functions
5. Implement defineFeature collector
6. Implement setEntry/setExit collector
7. Wire API injection into sandbox

## Acceptance Criteria
- `indicator.sma(close, 20)` returns correct SMA values inside sandbox
- `defineFeature("rsi_14", rsiValue, { method: "minmax" })` collects the feature
- `candle("BTCUSDT", "1m", 0)` returns current candle data
- `close[0]` returns current close price
- `bar_index` returns current bar position
- All API calls work within sandbox execution

## Validation
```bash
bun test --filter "strategy-api"
bun run typecheck
bun run lint
```

## Out of Scope
- Multi-timeframe data access (T-023)
- Warm-up period handling (T-024)
- Strategy worker (T-025)
