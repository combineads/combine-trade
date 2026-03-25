# T-12-014 Backtest version comparison chart

## Goal
Chart component that overlays equity curves from multiple backtest versions on a single chart, enabling visual comparison of strategy performance across versions.

## Why
When tuning a strategy, users need to compare how different parameter versions performed over the same time period. A visual overlay makes it immediately obvious which version has better returns, lower drawdown, or more consistent growth.

## Inputs
- `packages/ui/components/chart/` — existing Lightweight Charts integration (T-12-002)
- Backtest result API (T-12-009) — provides equity curve data per version

## Dependencies
- T-12-009 (backtest result chart / equity curve data source)

## Expected Outputs
- `BacktestVersionComparisonChart` component accepting an array of `{ versionId, label, equityCurve }` entries
- Multi-line overlay with distinct auto-assigned colors per version
- Synchronized tooltip showing all versions' equity values at the hovered timestamp
- Drawdown comparison sub-panel (one drawdown line per version)

## Deliverables
- `packages/ui/components/chart/BacktestVersionComparisonChart.tsx`
- `packages/ui/components/chart/__tests__/version-comparison.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Must use TradingView Lightweight Charts line series for equity curves
- Colors are auto-assigned from a fixed palette; user cannot pick colors in this task
- Tooltip must show version label + equity value for each version simultaneously
- Drawdown panel uses the synchronized panel pattern from T-12-012

## Steps
1. Write failing tests first (RED):
   - Test: passing 3 versions renders 3 line series
   - Test: each series is assigned a distinct color from the palette
   - Test: hovering triggers a combined tooltip showing all 3 version values
   - Test: drawdown panel shows one line per version
   - Test: empty versions array renders empty state message
2. Implement component (GREEN):
   - Accept `versions: BacktestVersion[]` prop
   - For each version, call `chart.addLineSeries({ color: palette[i] })` and set equity data
   - Subscribe `subscribeCrosshairMove` for combined tooltip rendering
   - Render drawdown panel using `PanelContainer` from T-12-012
3. Refactor (REFACTOR): extract color palette assignment into a `useVersionColors` hook

## Acceptance Criteria
- N versions → N line series with distinct colors
- Combined crosshair tooltip displays label + value for all versions simultaneously
- Drawdown sub-panel is synchronized with the main chart crosshair
- Empty state renders a user-facing message instead of blank space
- `bun test -- --filter "version-comparison"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "version-comparison"
bun run typecheck
bun run lint
```

## Out of Scope
- User-selectable colors per version
- Metric comparison table (non-chart)
- More than 10 simultaneous versions (palette only covers 10)
