# T-12-011 Indicator overlay components (SMA, EMA, BB)

## Goal
Technical indicator overlay components that render SMA, EMA, and Bollinger Bands directly on the main candlestick chart.

## Why
Traders need moving averages and Bollinger Bands overlaid on price charts to make entry/exit decisions. These are the most commonly used overlay indicators.

## Inputs
- `packages/ui/components/chart/` — existing Lightweight Charts integration (T-12-002)
- `GET /api/v1/indicators/:symbol/:timeframe/:indicator` — indicator data API (T-12-013)
- TradingView Lightweight Charts line series and area series APIs

## Dependencies
- T-12-010 (chart data API — provides candle window context)
- T-12-002 (chart foundation)

## Expected Outputs
- `IndicatorOverlay` parent component accepting a list of indicator configs
- `SmaOverlay` and `EmaOverlay` as line series
- `BollingerBandsOverlay` as area series (upper + lower bands) with mid-line
- Toggle visibility per indicator
- Configurable period and color per indicator instance

## Deliverables
- `packages/ui/components/chart/IndicatorOverlay.tsx`
- `packages/ui/components/chart/overlays/SmaOverlay.tsx`
- `packages/ui/components/chart/overlays/EmaOverlay.tsx`
- `packages/ui/components/chart/overlays/BollingerBandsOverlay.tsx`
- `packages/ui/components/chart/__tests__/indicator-overlay.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Must use TradingView Lightweight Charts `addLineSeries` and `addAreaSeries` — no reimplementation of charting primitives
- Overlay data must align to the same time index as the main candle series
- Removing a series on unmount to prevent memory leaks
- Color must accept any CSS color string

## Steps
1. Write failing tests first (RED):
   - Test: `<SmaOverlay period={20} color="blue" />` adds a line series to the chart
   - Test: toggling `visible={false}` hides the series without removing it
   - Test: unmounting removes the series from the chart
   - Test: `<BollingerBandsOverlay>` renders upper, lower, and mid series
   - Test: changing `period` prop triggers data refetch
2. Implement overlays (GREEN):
   - `SmaOverlay` / `EmaOverlay`: fetch indicator data, call `chart.addLineSeries()`, set data
   - `BollingerBandsOverlay`: fetch BB data, add area series for band fill + line series for mid
   - `IndicatorOverlay`: render children overlays, pass chart instance via context
3. Wire toggle visibility via `series.applyOptions({ visible })`
4. Refactor (REFACTOR): share data-fetch + series-lifecycle logic in a `useIndicatorSeries` hook

## Acceptance Criteria
- SMA and EMA render as line series aligned with candle time index
- Bollinger Bands render upper/lower as shaded area and midline as line series
- Toggling visibility hides/shows without re-fetching data
- Unmounting cleans up chart series
- `bun test -- --filter "indicator-overlay"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "indicator-overlay"
bun run typecheck
bun run lint
```

## Out of Scope
- Panel-based oscillator indicators (RSI, MACD, Stochastic — T-12-012)
- Custom drawing tools
- Indicator alerts / threshold notifications
