# T-12-012 Separate panel indicator components (RSI, MACD, Stochastic)

## Goal
Separate sub-panel indicator components for RSI, MACD, and Stochastic oscillators, displayed below the main candlestick chart with synchronized x-axis and crosshair.

## Why
RSI, MACD, and Stochastic oscillators cannot be meaningfully overlaid on the price chart. Dedicated panels with synchronized crosshairs allow traders to read oscillator values precisely in relation to candle position.

## Inputs
- `packages/ui/components/chart/` — existing Lightweight Charts integration (T-12-002)
- `GET /api/v1/indicators/:symbol/:timeframe/:indicator` — indicator data API (T-12-013)
- TradingView Lightweight Charts synchronized chart APIs

## Dependencies
- T-12-010 (chart data API — provides window/cursor context)
- T-12-002 (chart foundation)

## Expected Outputs
- `RsiPanel` — line chart with 30/70 horizontal zone markers
- `MacdPanel` — histogram series (MACD − signal) + line series for signal and MACD
- `StochasticPanel` — %K and %D line series with 20/80 horizontal zone markers
- All panels synchronized crosshair with the main chart

## Deliverables
- `packages/ui/components/chart/panels/RsiPanel.tsx`
- `packages/ui/components/chart/panels/MacdPanel.tsx`
- `packages/ui/components/chart/panels/StochasticPanel.tsx`
- `packages/ui/components/chart/panels/PanelContainer.tsx` — shared layout wrapper
- `packages/ui/components/chart/__tests__/panel-indicator.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Panels must synchronize crosshair movement with the main chart via `subscribeCrosshairMove`
- X-axis time scale must be locked to the main chart (shared `timeScale.setVisibleRange`)
- Horizontal zone lines (RSI 30/70, Stochastic 20/80) rendered as price lines, not extra series
- Panel height is configurable via props (default 120px)
- Unmounting a panel must remove all series and unsubscribe all listeners

## Steps
1. Write failing tests first (RED):
   - Test: `<RsiPanel>` renders a line series within a separate chart instance
   - Test: RSI 30 and 70 price lines are present on the series
   - Test: crosshair move on main chart triggers matching crosshair in RSI panel
   - Test: `<MacdPanel>` renders histogram + two line series
   - Test: `<StochasticPanel>` renders %K and %D lines with 20/80 markers
   - Test: unmounting unsubscribes crosshair listener
2. Implement `PanelContainer` (GREEN):
   - Creates a secondary `createChart` instance
   - Subscribes to main chart's `subscribeCrosshairMove` and mirrors position
   - Syncs visible range on main chart `timeScale` change
3. Implement `RsiPanel`, `MacdPanel`, `StochasticPanel` inside `PanelContainer`
4. Refactor (REFACTOR): extract crosshair-sync and range-sync into a `usePanelSync` hook

## Acceptance Criteria
- Moving the crosshair on the main chart moves it on all panels simultaneously
- Scrolling/zooming the main chart updates the visible range on all panels
- RSI 30/70 horizontal markers are visible and labeled
- Stochastic 20/80 horizontal markers are visible and labeled
- MACD histogram shows positive bars above zero, negative below
- `bun test -- --filter "panel-indicator"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "panel-indicator"
bun run typecheck
bun run lint
```

## Out of Scope
- Overlay indicators on the main price chart (T-12-011)
- Custom oscillator plugins
- Volume panel (handled by main chart configuration)
