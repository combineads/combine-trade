# T-01-006 Multi-timeframe candle aggregator

## Goal
Implement a candle aggregator that synthesizes 1m candles into higher timeframe candles (3m, 5m, 15m, 1h).

## Why
EP01 M7 + EP17 dependency — Double-BB evaluates across 4 timeframes. The aggregator produces higher-TF candles from base 1m data for both backtest and real-time.

## Inputs
- `packages/candle/types.ts` (existing candle types)
- EP01 M7 spec for aggregation rules

## Dependencies
None (pure transformation logic)

## Expected Outputs
- `aggregateCandles(candles1m, targetTimeframe)` function
- Correct OHLCV math (open=first, high=max, low=min, close=last, volume=sum)
- `isTimeframeClosed(timestamp, timeframe)` helper

## Deliverables
- `packages/candle/aggregator.ts`
- `packages/candle/__tests__/aggregator.test.ts`

## Constraints
- Supported timeframes: 3m, 5m, 15m, 1h
- N = timeframe minutes / 1 (3, 5, 15, 60)
- Input must be sorted by time ascending
- Partial bars at end are valid (is_closed=false until complete)
- Pure functions, deterministic

## Steps
1. Define Candle1m input type and AggregatedCandle output type
2. Implement aggregation math (open, high, low, close, volume)
3. Implement timeframe alignment (which 1m bars belong to which N-minute bar)
4. Implement isTimeframeClosed helper
5. Write tests for each timeframe + edge cases

## Acceptance Criteria
- 3×1m candles → correct 3m candle
- 5×1m candles → correct 5m candle
- 15×1m candles → correct 15m candle
- 60×1m candles → correct 1h candle
- Partial aggregation returns is_closed=false
- OHLCV math verified

## Validation
```bash
bun test packages/candle/__tests__/aggregator.test.ts
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files changed: `packages/candle/aggregator.ts`, `packages/candle/__tests__/aggregator.test.ts`
- Approach: Group 1m candles by target-TF bar open time, then aggregate OHLCV per group
- Uses Decimal.js for high/low comparison and volume summation (monetary precision)
- Time alignment via floor(timestamp / timeframe_ms) * timeframe_ms
- Tests: 14 tests (4 timeframes, partial bars, multiple bars, empty input, time alignment, closure check)
- Validation: 14/14 pass, typecheck clean

## Outputs
- `aggregateCandles(candles1m, targetTf)` → `Candle[]`
- `getAggregationBarOpenTime(candleOpenTime, targetTf)` → `Date`
- `isTimeframeClosed(barOpenTime, targetTf, receivedCount)` → `boolean`

## Out of Scope
- DB storage of aggregated candles
- NOTIFY candle_closed event
- Real-time streaming aggregation
