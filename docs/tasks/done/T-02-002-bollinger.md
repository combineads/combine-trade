# T-02-002 indicators/bollinger.ts — BB20 and BB4 Bollinger Band calculation

## Goal
Implement Bollinger Band calculation wrapping `@ixjb94/indicators` IndicatorsSync.bbands(). Provide calcBB20(), calcBB4(), and a generic calcBB() function.

## Why
BB20 and BB4 are the core structural anchors of the Double-BB strategy. BB20 defines the primary trend channel. BB4 detects short-term volatility squeezes and entry signals. Both are used by WATCHING detection (EP-05), Evidence Gate, and vectorization (EP-04).

## Inputs
- `src/indicators/types.ts` (T-02-001) — BollingerResult type
- `src/core/constants.ts` — BB20_CONFIG (length:20, stddev:2), BB4_CONFIG (length:4, stddev:4)
- `src/core/decimal.ts` — d() factory
- `@ixjb94/indicators` — IndicatorsSync.bbands(source, period, stddev) → number[][]

## Dependencies
T-02-001 (indicators/types.ts)

## Expected Outputs
- `src/indicators/bollinger.ts` — calcBB(), calcBB20(), calcBB4()
- Used by signals, vectors, squeeze detection modules

## Deliverables
- `src/indicators/bollinger.ts`

## Constraints
- L2 module: imports from `core/` and `indicators/types`
- Internal calculation uses Float64 via @ixjb94/indicators
- Output is BollingerResult with Decimal fields
- Candle[] input → extract close prices as number[] → pass to library → convert result to Decimal
- Parameters come from constants.ts (BB20_CONFIG, BB4_CONFIG)
- Return null when insufficient candles (BB20: < 20, BB4: < 4)

## Steps
1. Import IndicatorsSync from `@ixjb94/indicators`
2. Import BollingerResult from `./types`
3. Import BB20_CONFIG, BB4_CONFIG from `@/core/constants`
4. Import d, Decimal from `@/core/decimal`
5. Create helper: `candlesToCloses(candles: Candle[]): number[]` — extracts close prices, converts Decimal→number
6. Create `calcBB(closes: number[], length: number, stddev: number, currentClose: number): BollingerResult | null`:
   - Check closes.length >= length, return null if insufficient
   - Call IndicatorsSync.bbands(closes, length, stddev)
   - bbands returns [lower[], middle[], upper[]] (3 arrays)
   - Take last values from each array
   - Calculate bandwidth = (upper - lower) / middle
   - Calculate percentB = (currentClose - lower) / (upper - lower)
   - Convert all to Decimal via d()
   - Return BollingerResult
7. Create `calcBB20(candles: Candle[]): BollingerResult | null` — delegates to calcBB with BB20_CONFIG
8. Create `calcBB4(candles: Candle[]): BollingerResult | null` — delegates to calcBB with BB4_CONFIG
9. Export calcBB, calcBB20, calcBB4, candlesToCloses
10. Write comprehensive tests
11. Verify typecheck and lint pass

## Acceptance Criteria
- calcBB20() uses length=20, stddev=2 from BB20_CONFIG
- calcBB4() uses length=4, stddev=4 from BB4_CONFIG
- Returns null when candles.length < required period
- bandwidth = (upper - lower) / middle
- percentB = (close - lower) / (upper - lower)
- All output fields are Decimal type
- Known data produces results within 0.01% of reference values
- `bun run typecheck` passes

## Test Scenarios
- calcBB20 with 20 candles of known close prices → returns BollingerResult matching reference values
- calcBB20 with 19 candles → returns null (insufficient data)
- calcBB4 with 4 candles of known close prices → returns BollingerResult with correct values
- calcBB4 with 3 candles → returns null
- calcBB bandwidth formula: (upper - lower) / middle → verified with manual calculation
- calcBB percentB formula: (close - lower) / (upper - lower) → verified
- calcBB20 with constant close prices (all 100) → bandwidth is 0, middle equals close
- candlesToCloses extracts close prices correctly from Candle[] → number[]
- All returned fields are instances of Decimal

## Validation
```bash
bun run typecheck
bun test --grep "bollinger"
```

## Out of Scope
- BB series output (full array of BB values for each candle) — future enhancement
- Squeeze detection (T-02-006)
- Other indicator calculations
