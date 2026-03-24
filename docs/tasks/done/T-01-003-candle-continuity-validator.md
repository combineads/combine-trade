# T-01-003 Candle continuity validator

## Goal
Implement a continuity validator that detects gaps in candle sequences and reports missing timestamps.

## Why
EP01 M3 — all downstream modules require gap-free candle data. The validator catches data issues before they propagate to strategies and backtest.

## Inputs
- `packages/candle/types.ts` (Candle, TIMEFRAME_MS)

## Dependencies
None (pure validation logic)

## Expected Outputs
- `validateContinuity(candles, timeframe)` function detecting gaps
- `ContinuityReport` with gaps list and validation status

## Deliverables
- `packages/candle/continuity.ts`
- `packages/candle/__tests__/continuity.test.ts`

## Constraints
- Must work with any timeframe in TIMEFRAME_MS
- Returns gap list with expected vs actual timestamps
- Pure functions, deterministic
- Input must be sorted by openTime ascending

## Steps
1. Implement gap detection by walking expected timestamps
2. Report each missing timestamp
3. Write tests for no-gap, single-gap, multiple-gap, empty input

## Acceptance Criteria
- No gaps → valid report
- Missing candles detected with expected timestamps
- Works for 1m, 5m, 15m, 1h timeframes

## Validation
```bash
bun test packages/candle/__tests__/continuity.test.ts
bun run typecheck
```

## Out of Scope
- Gap repair (REST backfill)
- DB queries

## Implementation Notes
- **Date**: 2026-03-22
- **Discovery**: `validateContinuity()` and `isContinuous()` already exist in `packages/candle/validation.ts` with `CandleGap` type in `types.ts` — implemented during an earlier task.
- **Work done**: Wrote 13 tests for the existing implementation covering all acceptance criteria (no-gap, single-gap, multiple-gaps, empty, single candle, 1m/5m/15m/1h timeframes).
- **Files changed**: `packages/candle/__tests__/validation.test.ts` (new — 13 tests)
- **Validation**: 13/13 tests pass, typecheck clean
- **Note**: Task deliverables specified `continuity.ts` but code lives in `validation.ts` — functionally identical, no rename needed.

## Outputs
- `validateContinuity(candles: Candle[]): CandleGap[]` — gap detection
- `isContinuous(candles: Candle[]): boolean` — convenience wrapper
