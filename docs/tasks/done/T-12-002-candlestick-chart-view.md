# T-12-002 Candlestick chart view with controls

## Goal
Create `CandlestickChartView` — a full chart view that combines a symbol selector, a timeframe selector, and a chart area rendered inside `ChartContainer`. The chart area is a placeholder canvas element; actual `lightweight-charts` wiring is deferred to a later task.

## Why
EP08 — Dashboard and strategy detail pages require a candlestick chart. This task establishes the layout, control components (TimeframeSelector, SymbolSelector), and the view composition so that later chart-library integration (T-12-003+) only needs to swap the placeholder for a real chart instance.

## Inputs
- `packages/ui/src/components/chart-container.tsx` (from T-12-001)
- `docs/DESIGN_SYSTEM.md` §5 (button variants for timeframe selector), §6 (chart area)
- `packages/ui/src/components/button.tsx` (from T-08-012)

## Dependencies
- T-12-001 (ChartContainer)

## Expected Outputs
- `packages/ui/src/views/charts/candlestick-chart-view.tsx`
- `packages/ui/src/components/timeframe-selector.tsx`
- `packages/ui/src/components/symbol-selector.tsx`
- `packages/ui/__tests__/candlestick-chart-view.test.tsx`

## Deliverables

### 1. TimeframeSelector component
```typescript
// packages/ui/src/components/timeframe-selector.tsx
type Timeframe = '1m' | '3m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps)
```
- Renders 7 buttons: 1m, 3m, 5m, 15m, 1h, 4h, 1d
- Active timeframe uses `primary` button style; inactive uses `secondary`
- Each button has `data-testid="timeframe-{tf}"` (e.g. `data-testid="timeframe-1h"`)

### 2. SymbolSelector component
```typescript
// packages/ui/src/components/symbol-selector.tsx
interface SymbolSelectorProps {
  symbols: string[];
  value: string;
  onChange: (symbol: string) => void;
}

export function SymbolSelector({ symbols, value, onChange }: SymbolSelectorProps)
```
- Renders a `<select>` element with `data-testid="symbol-selector"`
- Maps `symbols` array to `<option>` elements
- Selected option reflects `value`

### 3. CandlestickChartView
```typescript
// packages/ui/src/views/charts/candlestick-chart-view.tsx
interface CandlestickChartViewProps {
  symbol: string;
  symbols?: string[];
  onSymbolChange?: (symbol: string) => void;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  height?: number;
  loading?: boolean;
}

export function CandlestickChartView(props: CandlestickChartViewProps)
```
- Renders `data-testid="candlestick-chart-view"` root div
- Contains `SymbolSelector` (when `symbols` provided), `TimeframeSelector`, and `ChartContainer`
- ChartContainer contains a `div[data-testid="chart-area"]` placeholder
- Shows selected symbol in a `span[data-testid="current-symbol"]`

### 4. Index exports
- Export `TimeframeSelector`, `SymbolSelector`, `CandlestickChartView` from `packages/ui/src/index.ts`

## Constraints
- No `lightweight-charts` import in this task — chart area is a placeholder `div`
- `TimeframeSelector` must render exactly 7 buttons with the specified timeframe values
- Use CSS custom properties for all colors
- Components must be individually importable (named exports, not default)

## Steps
1. Write failing tests (RED):
   - TimeframeSelector renders 7 buttons
   - TimeframeSelector calls `onChange` on click
   - SymbolSelector renders options for each symbol
   - CandlestickChartView renders controls and chart area
   - CandlestickChartView shows current symbol
2. Implement `TimeframeSelector` (GREEN)
3. Implement `SymbolSelector` (GREEN)
4. Implement `CandlestickChartView` (GREEN)
5. Export from barrel, run validation (REFACTOR)

## Acceptance Criteria
- `TimeframeSelector` renders buttons for `1m 3m 5m 15m 1h 4h 1d`
- Clicking a timeframe button calls `onChange` with the correct value
- `SymbolSelector` renders one `<option>` per symbol in the array
- `CandlestickChartView` renders `data-testid="chart-area"` inside a `ChartContainer`
- `CandlestickChartView` renders `data-testid="current-symbol"` with the symbol text

## Validation
```bash
bun test packages/ui/__tests__/candlestick-chart-view.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Actual `lightweight-charts` rendering (deferred)
- Candle data fetching / API hook integration
- Event marker overlay (T-12-003)
- Zoom, crosshair, or tooltip controls
