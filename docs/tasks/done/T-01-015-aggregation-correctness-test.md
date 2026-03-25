# T-01-015 Aggregation correctness test suite

## Goal
Add a comprehensive test suite that mathematically verifies OHLCV correctness for every supported aggregation path (1m→3m, 1m→5m, 1m→15m, 1m→1h) including edge cases: missing candles within a period, partial periods, and multiple consecutive aggregated bars.

## Why
The aggregator (`T-01-006`) has basic tests, but OHLCV math errors are silent — a wrong `high` value propagates into strategy evaluation and vector similarity search, producing incorrect decisions. A dedicated correctness suite with exact numeric assertions and edge-case coverage provides a regression barrier for any future change to the aggregation logic.

## Inputs
- `packages/candle/aggregator.ts` — `aggregateCandles`, `getAggregationBarOpenTime`, `isTimeframeClosed` (T-01-006)
- `packages/candle/__tests__/aggregator.test.ts` — existing aggregator tests (reference for what is already covered)
- `packages/candle/types.ts` — Candle, Timeframe types

## Dependencies
- T-01-006 (candle aggregator implementation)

## Expected Outputs
- `packages/candle/__tests__/aggregation-correctness.test.ts` — new dedicated correctness test file

## Deliverables
- Test file `packages/candle/__tests__/aggregation-correctness.test.ts` with the following test groups:

  **Group 1 — OHLCV math per timeframe (1m→3m, 1m→5m, 1m→15m, 1m→1h)**
  - For each target timeframe, construct exactly N input 1m candles with distinct, known values
  - Assert: `open` = first candle's open
  - Assert: `high` = maximum of all candles' highs
  - Assert: `low` = minimum of all candles' lows
  - Assert: `close` = last candle's close
  - Assert: `volume` = sum of all candles' volumes (Decimal.js exact arithmetic)
  - Assert: `openTime` = first candle's openTime, `closeTime` = last candle's closeTime

  **Group 2 — Multiple consecutive bars**
  - Input: 6 candles for 3m aggregation → expect exactly 2 output bars
  - Verify each bar's OHLCV is computed from its own subset of inputs, not contaminated by the other bar
  - Input: 10 candles for 5m aggregation → expect 2 bars (10 candles)
  - Input: 62 candles for 1h aggregation → expect 1 complete bar + 1 partial bar (`is_closed=false`)

  **Group 3 — Partial periods**
  - Input: 1 candle for 3m → output: 1 partial bar, `is_closed=false`, OHLCV equals the single input candle
  - Input: 2 candles for 5m → output: 1 partial bar, `is_closed=false`, high/low/volume correctly reflect 2 inputs
  - Input: 14 candles for 15m → output: 1 partial bar

  **Group 4 — Missing candles within a period**
  - Input: 3 candles for 5m with candle index 2 (0-indexed) missing (skip that timestamp)
  - Assert: aggregated bar uses only the 3 present candles (no crash, no synthetic fill)
  - Assert: `high`, `low`, `volume` computed from the 3 present values only
  - Document behavior: aggregator treats missing candles as absent, not zero-filled

  **Group 5 — Edge cases**
  - Empty input → empty output (no crash)
  - Single candle, 1h timeframe → one partial bar
  - All candles identical values → aggregated OHLCV all equal to that value
  - Maximum volume candle in middle of period → `high` correctly identified via Decimal comparison, not native float
  - Input with `high < open` (malformed candle) → aggregator does not throw; output `high` is still max of inputs

  **Group 6 — Time alignment**
  - Verify `getAggregationBarOpenTime` returns correct bar open for 3m, 5m, 15m, 1h
  - Verify candles at exact boundary timestamps are assigned to the new bar, not the closing bar
  - Verify `isTimeframeClosed` returns `true` only when the full N candles for the period have been received

## Constraints
- All volume assertions must use `Decimal.js` `.equals()` — never `===` on floating-point strings
- All price assertions (open, high, low, close) must use `Decimal.js` `.equals()`
- Tests must not import the implementation of `aggregateCandles` indirectly — import directly from `packages/candle/aggregator.ts`
- No mocking of aggregator internals — test only the public API
- Each test case must be fully self-contained with its own candle array construction (no shared mutable fixture arrays)
- Use `bun:test` only
- All tests must pass in under 2 seconds (pure computation, no I/O)

## Steps
1. Read `packages/candle/__tests__/aggregator.test.ts` to identify what is already covered (avoid duplication)
2. Write all test groups as failing stubs first (RED):
   - Define candle factory helper: `makeCandle(openTime, o, h, l, c, vol): Candle`
   - Write test case shells with `expect(true).toBe(false)` placeholders
3. Implement each assertion group (GREEN):
   - Start with Group 1 (basic math) for all 4 timeframes
   - Proceed through Groups 2–6
   - For each failing case, verify the failure is in the test expectation, not a bug in the aggregator
4. If a Group 4 or Group 5 test reveals an actual aggregator bug, file a note in the task's Implementation Notes and fix in `packages/candle/aggregator.ts` before marking GREEN
5. Refactor (REFACTOR): consolidate repeated candle construction into a `buildCandleSequence(startTime, count, ohlcvFn)` helper within the test file

## Acceptance Criteria
- At least 30 distinct `it()` test cases across the 6 groups
- Every supported timeframe (3m, 5m, 15m, 1h) has at least one full-period OHLCV math assertion
- Volume summation assertions use Decimal.js `.equals()`, not string equality
- Missing-candle behavior is explicitly documented via a comment in the test file
- No test relies on floating-point equality (`===` on numbers)
- `bun test -- --filter "aggregation-correctness"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "aggregation-correctness"
bun run typecheck
bun run lint
```

## Out of Scope
- Testing the DB persistence of aggregated candles (aggregator is a pure function)
- Testing real-time streaming aggregation via the collector pipeline (covered in T-01-014)
- Performance or throughput benchmarks for the aggregator
- 2h, 4h, 1d timeframe support (not in current aggregator spec)
