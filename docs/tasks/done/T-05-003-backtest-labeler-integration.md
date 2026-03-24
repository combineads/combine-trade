# T-05-003 Backtest labeler integration

## Goal
Integrate the label engine into the backtest replay by implementing a forward-scan labeler that, given a `BacktestEvent` and the full ordered candle array, immediately computes a `LabelResult` using `labelEvent()` from `@combine/core/label`. Exposes this as a pure function so the replay engine (or any caller) can label events inline.

## Why
In live trading the label is computed hours or days after the event (the outcome is unknown at event time). In backtest mode, all future candles are already available, so labels can be computed immediately after each event — eliminating the need for a separate label worker pass. Separating this logic from the engine core keeps both modules testable in isolation.

## Inputs
- T-05-002 `BacktestEvent` type from `packages/backtest/types.ts`
- T-04-001 `labelEvent()` from `@combine/core/label` (signature: `labelEvent(input: LabelInput): LabelResult`)
- T-04-001 types: `LabelInput`, `LabelResult`, `CandleBar` from `@combine/core/label`
- Candle type from `@combine/candle`
- EP05 M2 spec (forward candle scan, immediate labeling)

## Dependencies
- T-05-002 (BacktestEvent and Candle[] context from replay engine)
- T-04-001 (labelEvent function and LabelInput/LabelResult types)

## Expected Outputs
- `packages/backtest/labeler.ts`
  - `labelBacktestEvent(event: BacktestEvent, allCandles: Candle[], resultConfig: ResultConfig): LabelResult`
  - `ResultConfig` interface: `{ tpPct: number; slPct: number; maxHoldBars: number }`
  - `toForwardCandles(allCandles: Candle[], fromIndex: number, maxBars: number): CandleBar[]`
- `packages/backtest/__tests__/labeler.test.ts`

## Deliverables
- `packages/backtest/labeler.ts`
- `packages/backtest/__tests__/labeler.test.ts`
- Updated `packages/backtest/index.ts` with new exports

## Constraints
- `labelBacktestEvent` must call `labelEvent()` from `@combine/core/label` — do not re-implement the labeling logic
- `toForwardCandles` slices candles starting at `fromIndex + 1` (the candle after the event) up to `maxHoldBars` candles
- `CandleBar` is `{ open, high, low, close }` (strings) — map from `Candle` fields directly
- Look-ahead bias: `fromIndex` is the candle at event time; forward candles start at `fromIndex + 1`
- If `fromIndex + 1 >= allCandles.length`, forward candles array is empty and `labelEvent` returns `TIME_EXIT` with `holdBars = 0`
- `packages/backtest` may import from `@combine/core` and `@combine/candle`
- No DB access, no network calls — pure functions only
- All monetary values remain strings (passed directly to `LabelInput.entryPrice`)

## Steps
1. Write failing tests in `packages/backtest/__tests__/labeler.test.ts` (RED):
   - Event at candle index 2, 5 forward candles, LONG TP hit on candle 3 → `resultType === "WIN"`
   - Event at last candle → forward slice empty → `resultType === "TIME_EXIT"`, `holdBars === 0`
   - Event near end with fewer candles than `maxHoldBars` → only available candles used
   - `toForwardCandles` returns correct slice starting at `fromIndex + 1`
   - `toForwardCandles` limits to `maxHoldBars` candles even if more are available
   - LONG SL hit on first forward candle → `resultType === "LOSS"`
   - SHORT direction TP/SL computed correctly (delegates to `labelEvent`)
2. Implement `packages/backtest/labeler.ts` (GREEN):
   - `toForwardCandles`: slice `allCandles[fromIndex + 1 .. fromIndex + 1 + maxHoldBars]`, map to `CandleBar`
   - `labelBacktestEvent`: build `LabelInput` from event + config + forward candles, call `labelEvent()`
3. Update `packages/backtest/index.ts` barrel exports
4. Refactor: add JSDoc to both functions

## Acceptance Criteria
- `labelBacktestEvent` returns the exact `LabelResult` that `labelEvent()` would produce for the same input
- Forward candle slice starts at `event.candleIndex + 1` (no look-ahead into the event candle itself)
- Forward candle count capped at `resultConfig.maxHoldBars`
- Empty forward slice → `TIME_EXIT`, `holdBars === 0`, `pnlPct === 0`
- `toForwardCandles` preserves `open`, `high`, `low`, `close` as strings without numeric conversion
- Function is pure: same inputs always produce same outputs

## Validation
```bash
bun test packages/backtest/__tests__/labeler.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Persisting labels to database (label worker's responsibility)
- Re-labeling existing events (re-vectorization workflow, future task)
- Gap detection or continuity validation
- slippage estimation statistics (backtest report, T-05-004)
