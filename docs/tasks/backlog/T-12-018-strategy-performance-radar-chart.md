# T-12-018 Strategy performance radar chart

## Goal
Radar chart component visualizing multi-dimensional strategy performance across five axes: win rate, Sharpe ratio, max drawdown, expectancy, and trade count.

## Why
A radar chart immediately reveals a strategy's strengths and weaknesses in a single glance. Comparing two strategies on the same radar makes trade-offs obvious without reading through tables of numbers.

## Inputs
- Backtest result data (T-12-009) — provides the five metric values per strategy version
- `docs/DESIGN_SYSTEM.md` — color tokens for fill, stroke, axis labels
- No external chart library for this component — custom canvas/SVG implementation required

## Dependencies
- T-12-009 (backtest result chart — provides the metric data source)

## Expected Outputs
- `RadarChart` component with 5-axis radar rendered in SVG
- Single-strategy mode: filled polygon + outline
- Comparison mode: two semi-transparent overlapping polygons (one per strategy)
- Axis labels with metric name and current value
- Configurable metrics list (defaults to the 5 standard metrics)

## Deliverables
- `packages/ui/components/chart/RadarChart.tsx`
- `packages/ui/components/chart/__tests__/radar-chart.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Must be implemented in SVG — no canvas, no external radar chart library
- All axis values normalized to [0, 1] before rendering (normalization bounds configurable per metric)
- Max drawdown axis is inverted (lower drawdown = higher normalized score)
- Comparison mode accepts exactly 2 strategies; single mode accepts 1
- Accessible: SVG must include `<title>` and axis `<text>` labels

## Steps
1. Write failing tests first (RED):
   - Test: `<RadarChart metrics={metrics}>` renders an SVG element
   - Test: SVG contains 5 polygon points
   - Test: comparison mode renders 2 polygons
   - Test: max drawdown axis is inverted in normalization
   - Test: SVG includes `<title>` for accessibility
   - Test: axis labels are present for each of the 5 metrics
2. Implement `RadarChart` (GREEN):
   - Compute axis angles: `(2π / N) * i` per axis
   - Normalize each metric value to [0, 1] using configurable `[min, max]` bounds
   - Convert polar coordinates to SVG `(x, y)` points
   - Render `<polygon>` for the radar shape with fill and stroke
   - Render axis lines, labels, and grid rings (25%, 50%, 75%, 100%)
3. Implement comparison mode: render two `<polygon>` with 50% opacity and distinct stroke colors
4. Refactor (REFACTOR): extract polar-to-cartesian math into a pure `radarPoints(values, radius)` utility

## Acceptance Criteria
- SVG element with 5 labeled axes renders correctly for single-strategy mode
- Two semi-transparent polygons render in comparison mode
- Max drawdown is inverted so a lower drawdown maps to a larger polygon area
- `<title>` element present for screen reader accessibility
- `bun test -- --filter "radar-chart"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "radar-chart"
bun run typecheck
bun run lint
```

## Out of Scope
- Interactive axis editing
- More than 5 axes in this task
- Animated transitions between strategy versions
