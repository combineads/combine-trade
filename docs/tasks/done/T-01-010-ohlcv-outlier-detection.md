# T-01-010 OHLCV Outlier Detection

## Goal
Implement outlier detection for OHLCV candle data that flags suspicious candles without removing them, letting downstream consumers decide how to handle them.

## Steps
1. Create `packages/candle/outlier-detector.ts`
2. Implement `detectOutliers(candles: Candle[]): OutlierResult[]`
3. Detection rules:
   - Price spike: close > 50% deviation from previous close
   - Volume spike: volume > 10x rolling average
   - Negative price: any of open/high/low/close < 0
   - Zero OHLC: open, high, low, or close equals 0
4. Use Decimal.js for all price comparisons
5. Write tests in `packages/candle/__tests__/outlier-detector.test.ts`
6. Export from `packages/candle/index.ts`

## Constraints
- Flagging only — do not remove candles
- All arithmetic with Decimal.js (never native float for price comparisons)
- `OutlierResult` must include: candle reference, index, reasons array
- Empty input returns empty array

## Outputs
- `packages/candle/outlier-detector.ts`
- `packages/candle/__tests__/outlier-detector.test.ts`
- Updated `packages/candle/index.ts`
