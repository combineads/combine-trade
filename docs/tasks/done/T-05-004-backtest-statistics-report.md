# T-05-004 Backtest statistics report

## Goal
Aggregate a collection of labeled backtest events into a comprehensive statistics report. Covers winrate, expectancy, consecutive loss streak, maximum drawdown, monthly breakdown, simultaneous TP/SL ratio, cold start period, and slippage estimation.

## Why
The statistics report is the primary deliverable of a backtest run. It lets the user understand whether a strategy has a positive expectancy, where performance degrades over time, and how large the inevitable losing streaks are — before committing to live trading.

## Inputs
- T-05-003 `LabelResult` type from `@combine/core/label` (fields: `resultType`, `pnlPct`, `holdBars`, `exitPrice`, `slHitFirst`)
- T-05-002 `BacktestEvent` type from `packages/backtest/types.ts` (fields: `openTime`, `direction`, `entryPrice`, `candleIndex`)
- EP05 M3 spec (statistics fields, cold start, slippage estimation)
- `computeStatistics` from `@combine/core/vector/statistics` for consistency with live-trading stats

## Dependencies
- T-05-003 (LabelResult available from labeler integration — defines the labeled event shape)

## Expected Outputs
- `packages/backtest/report.ts`
  - `LabeledEvent` interface: `{ event: BacktestEvent; label: LabelResult }`
  - `MonthlyBreakdown` interface: `{ yearMonth: string; winCount: number; lossCount: number; winrate: number; pnlPct: number }`
  - `SlippageStats` interface: `{ avgSlippagePct: number; maxSlippagePct: number; p95SlippagePct: number }`
  - `BacktestReport` interface — full report type (see Acceptance Criteria for all fields)
  - `computeReport(events: LabeledEvent[], nextOpenPrices?: Map<string, string>): BacktestReport`
  - `computeMaxDrawdown(equityCurve: number[]): number`
  - `computeMaxConsecutiveLoss(events: LabeledEvent[]): number`
  - `computeMonthlyBreakdown(events: LabeledEvent[]): MonthlyBreakdown[]`
- `packages/backtest/__tests__/report.test.ts`

## Deliverables
- `packages/backtest/report.ts`
- `packages/backtest/__tests__/report.test.ts`
- Updated `packages/backtest/index.ts` with new exports

## Constraints
- All pnl accumulation must use Decimal.js — never native float addition for monetary sums
- `computeMaxDrawdown`: equity curve is cumulative sum of `pnlPct` values; drawdown = peak-to-trough drop as positive percentage
- `yearMonth` format for `MonthlyBreakdown`: `"YYYY-MM"` derived from `event.openTime`
- Cold start period: `coldStartEvents` = number of events before cumulative `sampleCount >= 30`; `coldStartEndTime` = `openTime` of the 30th event (or null if fewer than 30 total events)
- Simultaneous TP/SL ratio: `simultaneousTpSlRatio` = fraction of events where `label.slHitFirst === true`
- Slippage estimation requires `nextOpenPrices` map (`eventId → nextCandleOpen string`); if map is absent or entry missing, skip that event for slippage stats. If no events have slippage data, `slippageStats` is `null`.
- Slippage for LONG: `(nextOpen - entryPrice) / entryPrice * 100` (positive = adverse)
- Slippage for SHORT: `(entryPrice - nextOpen) / entryPrice * 100`
- p95 slippage: sort values ascending, take value at index `Math.floor(0.95 * n)`
- `packages/backtest` may import from `@combine/core`, `@combine/candle`, `decimal.js`
- Pure functions only — no I/O

## Steps
1. Write failing tests in `packages/backtest/__tests__/report.test.ts` (RED):
   - 4 WIN + 1 LOSS → `winrate === 0.8`, `totalEvents === 5`
   - `computeMaxDrawdown`: equity `[1, 2, 0, 3]` → drawdown is 2 (peak 2, trough 0)
   - `computeMaxConsecutiveLoss`: `[WIN, LOSS, LOSS, LOSS, WIN]` → 3
   - `computeMonthlyBreakdown`: events spread across 2 months → 2 entries with correct stats
   - Cold start: first 30 events counted, `coldStartEvents === 30`
   - Fewer than 30 total: `coldStartEndTime === null`
   - `simultaneousTpSlRatio`: 2 of 5 events have `slHitFirst === true` → `0.4`
   - Slippage: LONG entry 100, next open 100.5 → slippage 0.5%
   - Empty events array → report with all-zero fields, no crash
   - `expectancy` matches manual calculation: `winrate * avgWin - (1 - winrate) * avgLoss`
2. Implement `packages/backtest/report.ts` (GREEN)
3. Update `packages/backtest/index.ts` barrel exports
4. Refactor: extract `buildEquityCurve`, `percentile` helpers

## Acceptance Criteria
- `BacktestReport` contains: `totalEvents`, `winCount`, `lossCount`, `timeExitCount`, `winrate`, `expectancy`, `avgWin`, `avgLoss`, `maxConsecutiveLoss`, `maxDrawdownPct`, `simultaneousTpSlRatio`, `coldStartEvents`, `coldStartEndTime: Date | null`, `monthlyBreakdown: MonthlyBreakdown[]`, `slippageStats: SlippageStats | null`
- `winrate` = `winCount / totalEvents` (TIME_EXIT with positive pnl counted as win, consistent with `computeStatistics`)
- `maxDrawdownPct` computed on cumulative pnl equity curve, expressed as positive number
- `computeMaxConsecutiveLoss` counts only LOSS outcomes (TIME_EXIT is not a consecutive loss unless `pnlPct <= 0`)
- Monthly breakdown: one entry per calendar month, sorted ascending by `yearMonth`
- Empty event list → returns zeroed report, no crash
- All pnl accumulation uses Decimal.js

## Validation
```bash
bun test packages/backtest/__tests__/report.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- JSON file serialization / disk output (CLI runner's responsibility)
- Walk-forward analysis
- Fee impact analysis (requires EP11 financial-arithmetic integration)
- Parameter optimization
- HTML / chart output
