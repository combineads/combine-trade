# T-12-009 Equity curve chart component

## Goal
Create an `EquityCurveChart` component using TradingView Lightweight Charts that renders an equity line series with a drawdown area series below it, and an interactive crosshair tooltip showing the value at each point.

## Why
Equity curve visualization is one of the most important tools for evaluating strategy performance. Traders need to see both the cumulative equity growth and the drawdown magnitude in a single chart to assess risk-adjusted returns. This component is used in the backtest results view, paper trading comparison, and strategy detail pages.

## Inputs
- `LightweightChart` primitives and `IChartApi` from T-12-006
- `lightweight-charts` area series and line series APIs
- `docs/DESIGN_SYSTEM.md` — color tokens
- `packages/ui/src/index.ts` — barrel export

## Dependencies
- T-12-006 (LightweightChart component, library installed)

## Expected Outputs
- `packages/ui/src/views/charts/equity-curve-chart.tsx`
- `packages/ui/__tests__/equity-curve-chart.test.tsx`
- Updated `packages/ui/src/index.ts` — component exported

## Deliverables

### 1. EquityCurveChart component
```typescript
// packages/ui/src/views/charts/equity-curve-chart.tsx
"use client";

export interface EquityPoint {
  time: number;      // Unix timestamp (seconds)
  equity: number;    // cumulative equity value
  drawdown: number;  // drawdown as negative fraction (e.g. -0.15 = -15%)
}

export interface EquityCurveChartProps {
  data: EquityPoint[];
  height?: number;           // default: 300
  className?: string;
  initialEquity?: number;    // baseline for % display, default: first equity value
}

export function EquityCurveChart({
  data,
  height = 300,
  className,
  initialEquity,
}: EquityCurveChartProps): JSX.Element
```

### 2. Chart series
- **Equity line series**: `addLineSeries()`, color `--color-success`, line width 2
- **Drawdown area series**: `addAreaSeries()`, topColor transparent, bottomColor `--color-danger` at 30% opacity
- Both series share the same time axis
- Drawdown series uses right price scale, equity uses left price scale (separate scales)

### 3. Crosshair tooltip
- Custom `subscribeCrosshairMove` handler
- Tooltip div (`[data-testid="equity-tooltip"]`) positioned near crosshair
- Shows: date, equity value, drawdown % formatted as "-15.00%"
- Hidden when crosshair leaves chart area

### 4. Tests
- Component renders container div `[data-testid="equity-curve-chart"]`
- Accepts empty data without throwing
- Exports `EquityPoint`, `EquityCurveChartProps` types
- Handles single data point without error

## Constraints
- `"use client"` directive required
- No chart instantiation during SSR — `useEffect` only
- Drawdown values must be negative fractions (validated, clamp to [-1, 0])
- Tooltip element is created in `useEffect`, not in JSX
- `ResizeObserver` and chart disposed on unmount
- CSS custom properties for all colors

## Steps
1. Write failing tests (RED):
   - Component renders container div
   - No crash with empty data
   - No crash with single data point
   - Correct types exported
2. Implement chart with equity line series (GREEN)
3. Add drawdown area series with separate price scale (GREEN)
4. Implement crosshair tooltip (GREEN)
5. Export from barrel (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `EquityCurveChart` renders `[data-testid="equity-curve-chart"]`
- Empty `data` does not throw
- Single data point does not throw
- `EquityPoint`, `EquityCurveChartProps` exported from `packages/ui/src/index.ts`
- Drawdown series uses separate right price scale
- Tooltip element exists in DOM after chart init
- `bun run typecheck` passes

## Validation
```bash
bun test packages/ui
bun run typecheck
```

## Out of Scope
- Benchmark comparison series
- Multiple equity curves on one chart
- Chart data fetching (separate hook)
- Strategy event markers (T-12-008)
