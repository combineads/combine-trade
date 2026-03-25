# T-12-017 Real-time PnL charts

## Goal
Real-time position PnL chart (updated via SSE) and daily PnL timeline bar chart for live tracking of profit and loss.

## Why
Traders need to monitor open positions' unrealized PnL in real time and review daily realized PnL trends. A visual chart is more scannable than raw numbers in a table.

## Inputs
- `packages/ui/components/chart/` — existing Lightweight Charts integration (T-12-002)
- Backtest / position result data (T-12-009) — existing equity chart patterns to follow
- SSE endpoint for live position updates (T-09-010)

## Dependencies
- T-12-009 (backtest result chart — equity curve pattern)
- T-09-010 (position management / live PnL SSE source)

## Expected Outputs
- `PositionPnlChart` — line chart receiving real-time unrealized PnL updates via SSE
- `DailyPnlChart` — bar chart of daily realized PnL aggregated by day
- Both respect the design system color tokens (green for positive, red for negative)

## Deliverables
- `packages/ui/components/chart/PositionPnlChart.tsx`
- `packages/ui/components/chart/DailyPnlChart.tsx`
- `packages/ui/components/chart/__tests__/pnl-chart.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- `PositionPnlChart` must update in real time (SSE, not polling)
- SSE connection must be closed on component unmount
- All PnL values are Decimal.js strings from the API — parse before rendering
- Bar chart coloring: positive bars use design system `success` token, negative bars use `danger` token
- `DailyPnlChart` data fetched once on mount (not real-time)

## Steps
1. Write failing tests first (RED):
   - Test: `<PositionPnlChart positionId="123">` establishes an SSE connection
   - Test: incoming SSE event updates the line series with a new data point
   - Test: SSE connection is closed when component unmounts
   - Test: `<DailyPnlChart>` renders one bar per day
   - Test: positive daily PnL bar uses success color, negative uses danger color
2. Implement `PositionPnlChart` (GREEN):
   - Open SSE connection to position PnL endpoint in `useEffect`
   - On each event, call `series.update({ time, value })` on the Lightweight Charts line series
   - Close SSE on cleanup
3. Implement `DailyPnlChart` (GREEN):
   - Fetch daily PnL data on mount
   - Render bar chart using Lightweight Charts histogram series with conditional colors
4. Refactor (REFACTOR): extract SSE lifecycle into a `useSseConnection(url)` hook

## Acceptance Criteria
- `PositionPnlChart` line updates in real time as SSE events arrive
- SSE connection is closed (no leak) when the component unmounts
- `DailyPnlChart` bars are green for positive days, red for negative days
- Both charts respect design system color tokens
- `bun test -- --filter "pnl-chart"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "pnl-chart"
bun run typecheck
bun run lint
```

## Out of Scope
- PnL alerts / notifications (covered by alert system)
- Historical PnL beyond daily granularity in `DailyPnlChart`
- Multi-position aggregate PnL chart
