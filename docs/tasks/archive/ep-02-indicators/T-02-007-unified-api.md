# T-02-007 indicators/index.ts — Unified API and performance benchmark

## Goal
Create the unified `calcAllIndicators()` function that computes all indicators in a single call, and a performance benchmark script to verify the < 10ms latency target.

## Why
The trading pipeline invokes all indicators on each candle close. A unified API simplifies the call site and enables shared number[] conversion (Candle[] → number[] happens once). The benchmark validates that the 10ms indicator budget from ARCHITECTURE.md is achievable.

## Inputs
- `src/indicators/types.ts` (T-02-001) — AllIndicators type
- `src/indicators/bollinger.ts` (T-02-002) — calcBB20(), calcBB4()
- `src/indicators/ma.ts` (T-02-003) — calcSMA(), calcEMA()
- `src/indicators/rsi.ts` (T-02-004) — calcRSI()
- `src/indicators/atr.ts` (T-02-005) — calcATR()
- `src/indicators/squeeze.ts` (T-02-006) — detectSqueeze()
- `src/core/types.ts` — Candle type
- `src/core/constants.ts` — MA_PERIODS

## Dependencies
T-02-002 (bollinger), T-02-003 (ma), T-02-004 (rsi), T-02-005 (atr), T-02-006 (squeeze)

## Expected Outputs
- `src/indicators/index.ts` — calcAllIndicators() public API, re-exports
- `scripts/bench-indicators.ts` — performance benchmark script
- All downstream modules import from `@/indicators`

## Deliverables
- `src/indicators/index.ts`
- `scripts/bench-indicators.ts`

## Constraints
- L2 module: imports from `core/` and internal `indicators/` files
- Convert Candle[] to number arrays once (close[], high[], low[])
- Return AllIndicators type
- Benchmark: 120 candles × 1000 iterations → average < 10ms per call
- Re-export all public types and functions for clean imports

## Steps
1. Import all indicator functions
2. Import AllIndicators, Candle types
3. Import MA_PERIODS from `@/core/constants`
4. Create helper: extract close[], high[], low[] from Candle[] (Decimal → number conversion)
5. Create `calcAllIndicators(candles: Candle[]): AllIndicators`:
   - Extract number arrays once
   - Call calcBB20, calcBB4 with candles
   - Call calcSMA for periods 20, 60, 120
   - Call calcEMA for periods 20, 60, 120
   - Call calcRSI with closes
   - Call calcATR with highs, lows, closes
   - Detect squeeze from BB20 bandwidth series
   - Return AllIndicators object
6. Re-export all types and functions from submodules
7. Create `scripts/bench-indicators.ts`:
   - Generate 120 synthetic candles
   - Run calcAllIndicators 1000 times
   - Report average, p50, p95, p99 latency
   - Exit 1 if average > 10ms
8. Write tests
9. Verify all validation passes

## Acceptance Criteria
- calcAllIndicators(candles) returns complete AllIndicators object
- All 11 fields populated (or null when insufficient data)
- Number conversion happens once per call (not per-indicator)
- `@/indicators` exports all public types and functions
- Benchmark completes with average < 10ms on 120 candles
- `bun run typecheck` and `bun run lint` pass
- `bun scripts/check-layers.ts` reports 0 violations

## Test Scenarios
- calcAllIndicators with 120+ candles → all fields non-null
- calcAllIndicators with 5 candles → bb20/sma60/sma120/ema60/ema120 are null, bb4 is non-null
- calcAllIndicators with empty array → all nullable fields are null, squeeze is "normal"
- All re-exported types importable from "@/indicators"
- All re-exported functions importable from "@/indicators"
- calcAllIndicators with known data → bb20, sma20, rsi14 match individual function results

## Validation
```bash
bun run typecheck
bun run lint
bun test --grep "indicators"
bun scripts/check-layers.ts
bun scripts/bench-indicators.ts
```

## Out of Scope
- Incremental/streaming indicator calculation
- Caching previous indicator results
- Candle storage/retrieval (EP-04)
