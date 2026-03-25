# T-12-020 Dark/light theme support for chart and widget components

## Goal
Apply dark/light theme support consistently across all chart components (Lightweight Charts), TradingView widget embeds, and custom SVG/canvas charts using design system tokens.

## Why
The dashboard supports dark and light modes, but chart and widget components currently use hardcoded colors. Without theme integration, charts appear mismatched when the user switches themes.

## Inputs
- `docs/DESIGN_SYSTEM.md` — color tokens (background, foreground, grid, success, danger, etc.)
- `packages/ui/components/chart/` — all existing chart components
- `packages/ui/components/widgets/` — TradingView widget components (T-12-015, T-12-016)
- Custom SVG chart components (RadarChart T-12-018, GaugeChart T-12-019)

## Dependencies
- T-12-002 (chart foundation — Lightweight Charts base configuration)

## Expected Outputs
- `useChartTheme()` hook returning a Lightweight Charts `ChartOptions` theme object derived from design system tokens
- All Lightweight Charts instances consume `useChartTheme()` instead of hardcoded colors
- All TradingView widget embeds receive `colorTheme` from the current theme context
- All SVG/canvas charts read stroke, fill, and label colors from design system tokens

## Deliverables
- `packages/ui/hooks/useChartTheme.ts`
- `packages/ui/hooks/__tests__/chart-theme.test.ts`
- Updated chart components to use `useChartTheme()`:
  - `packages/ui/components/chart/CandlestickChart.tsx` (or equivalent base chart)
  - `packages/ui/components/chart/panels/PanelContainer.tsx`
  - `packages/ui/components/chart/RadarChart.tsx`
  - `packages/ui/components/chart/GaugeChart.tsx`
- Updated widget components to pass `colorTheme` from theme context:
  - `packages/ui/components/widgets/TickerTapeWidget.tsx`
  - `packages/ui/components/widgets/MarketOverviewWidget.tsx`
  - `packages/ui/components/widgets/TimelineWidget.tsx`
  - `packages/ui/components/widgets/EconomicCalendarWidget.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Must respect `docs/DESIGN_SYSTEM.md` tokens — no hardcoded hex values in chart configs
- Theme must react to runtime changes (switching theme while charts are mounted must update them)
- Lightweight Charts `applyOptions()` must be called on theme change, not unmount/remount
- SVG chart components must read colors from CSS custom properties or a shared theme context
- TradingView widgets must re-inject their script with updated `colorTheme` on theme change

## Steps
1. Write failing tests first (RED):
   - Test: `useChartTheme()` returns a valid Lightweight Charts options object in dark mode
   - Test: `useChartTheme()` returns different background/grid colors in light mode
   - Test: toggling theme calls `chart.applyOptions()` with the new theme options
   - Test: TradingView widget re-injects script with updated `colorTheme` on theme switch
   - Test: `RadarChart` uses design system color tokens for polygon fill
   - Test: `GaugeChart` zone colors match design system success/warning/danger tokens
2. Implement `useChartTheme()` hook (GREEN):
   - Read current theme from shared theme context (existing app-level theme provider)
   - Map design system tokens to Lightweight Charts `ChartOptions` (background, text color, grid color, crosshair color)
   - Return memoized options object
3. Update all Lightweight Charts components to call `chart.applyOptions(theme)` in a `useEffect` watching the theme
4. Update TradingView widget components to include `colorTheme` in their config and re-inject on change
5. Update SVG charts to reference design system token CSS custom properties for colors
6. Refactor (REFACTOR): consolidate token-to-chart-options mapping in a single `chartThemeOptions(tokens)` pure function

## Acceptance Criteria
- Switching from dark to light theme updates all mounted charts without page reload
- Lightweight Charts background, grid, and text colors match design system tokens in both modes
- TradingView widgets reflect the correct `colorTheme` value after theme switch
- `RadarChart` and `GaugeChart` colors come from design system tokens, not hardcoded values
- `bun test -- --filter "chart-theme"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "chart-theme"
bun run typecheck
bun run lint
```

## Out of Scope
- Custom theme editor (user-defined color palettes)
- Per-chart theme override (all charts share one theme)
- Print / export theme (separate concern)
