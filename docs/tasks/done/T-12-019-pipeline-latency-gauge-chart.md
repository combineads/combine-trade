# T-12-019 Pipeline latency gauge chart

## Goal
Gauge chart component for the monitoring dashboard that displays real-time pipeline latency (p50/p95/p99) with color-coded zones against the 1-second SLA.

## Why
The system has a strict <1s candle-close-to-decision latency budget. A visual gauge on the monitoring dashboard makes SLA breaches immediately visible without reading log tables.

## Inputs
- SSE endpoint for pipeline latency metrics (T-07-004)
- `packages/ui/components/` — existing component structure
- `docs/DESIGN_SYSTEM.md` — color tokens (success, warning, danger)
- `T-12-001` — monitoring dashboard layout

## Dependencies
- T-07-004 (pipeline metrics / latency instrumentation)
- T-12-001 (monitoring dashboard — layout host)

## Expected Outputs
- `GaugeChart` component rendering a semicircular SVG gauge
- Displays p50, p95, and p99 needles (or separate gauges, one per percentile)
- Color zones: green (< 500ms), yellow (500–800ms), red (> 800ms)
- Real-time update via SSE

## Deliverables
- `packages/ui/components/chart/GaugeChart.tsx`
- `packages/ui/components/chart/__tests__/gauge-chart.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Must be implemented in SVG (no external gauge library)
- Maximum gauge value: 1500ms (anything above renders at the red end)
- SSE connection must be closed on unmount
- Reuse `useSseConnection` hook from T-12-017 if available
- Color zones are fixed: green 0–500ms, yellow 500–800ms, red 800ms+

## Steps
1. Write failing tests first (RED):
   - Test: `<GaugeChart value={300}>` renders SVG with needle in green zone
   - Test: `value={650}` positions needle in yellow zone
   - Test: `value={900}` positions needle in red zone
   - Test: `value={2000}` clamps needle to max position (1500ms red end)
   - Test: component subscribes to SSE on mount and updates `value` on events
   - Test: SSE connection closed on unmount
2. Implement `GaugeChart` (GREEN):
   - Render semicircular arc divided into three colored segments (SVG `<path>`)
   - Compute needle rotation angle from value: `(value / maxValue) * 180°`
   - Render needle as SVG `<line>` or `<path>` rotated from center
   - Display numeric value and percentile label below the gauge
3. Wire SSE updates: subscribe to latency metrics, update p50/p95/p99 gauge values
4. Refactor (REFACTOR): extract arc-segment path math into a `gaugeSectors(zones)` utility

## Acceptance Criteria
- Needle angle correctly maps value to the [0°, 180°] semicircle range
- Color zone boundaries are at 500ms and 800ms
- Values above 1500ms clamp to the maximum needle position
- SSE updates move the needle in real time
- SSE connection releases on unmount
- `bun test -- --filter "gauge-chart"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "gauge-chart"
bun run typecheck
bun run lint
```

## Out of Scope
- Historical latency trend chart (separate component)
- Per-stage breakdown gauge (shows total pipeline latency only)
- Alert firing from this component (handled by alert system)
