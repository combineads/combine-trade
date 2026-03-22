# T-155 Lightweight Charts integration component

## Goal
Create a `LightweightChart` React component in `packages/ui` that wraps the TradingView Lightweight Charts library, rendering a candlestick series from an OHLCV data array with correct resize handling.

## Why
All chart views (strategy event overlay, equity curve, dashboard) depend on a shared charting primitive. Building it once in `packages/ui` ensures consistent chart behavior, handles the resize observer lifecycle correctly, and avoids duplicating library integration across web and desktop apps.

## Inputs
- `lightweight-charts` npm package (to be installed)
- `docs/DESIGN_SYSTEM.md` — color tokens for chart theme
- `packages/ui/src/index.ts` — barrel export file
- `docs/ARCHITECTURE.md` — `packages/ui` component conventions

## Dependencies
- T-139 (packages/ui scaffold with component pattern established)

## Expected Outputs
- `packages/ui/src/views/charts/lightweight-chart.tsx`
- `packages/ui/__tests__/lightweight-chart.test.tsx`
- Updated `packages/ui/src/index.ts` — component exported

## Deliverables

### 1. LightweightChart component
```typescript
// packages/ui/src/views/charts/lightweight-chart.tsx
"use client";

export interface OHLCVBar {
  time: number;       // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LightweightChartProps {
  data: OHLCVBar[];
  height?: number;    // default: 400
  className?: string;
}

export function LightweightChart({ data, height = 400, className }: LightweightChartProps): JSX.Element
```

### 2. Chart lifecycle
- Create `IChartApi` instance in `useEffect` on mount
- Add `ISeriesApi<'Candlestick'>` candlestick series
- Set data via `series.setData(data)` on data change
- `ResizeObserver` on container div — calls `chart.applyOptions({ width })` on resize
- Dispose chart on unmount (`chart.remove()`)

### 3. Chart theme
- Background: `--color-surface` CSS variable (read at init time)
- Text color: `--color-text-primary`
- Grid color: `--color-border`
- Up candle: `--color-success`, down candle: `--color-danger`

### 4. Tests
- Component renders container div with `data-testid="lightweight-chart"`
- Accepts `OHLCVBar[]` data prop without error
- Exports `LightweightChart`, `OHLCVBar`, `LightweightChartProps` types
- Handles empty data array without throwing

## Constraints
- `"use client"` directive at top of file (Next.js Server Component boundary)
- No SSR instantiation of chart — `createChart` only in `useEffect`
- Component must not throw when `data` is empty array
- `ResizeObserver` must be cleaned up on unmount
- CSS custom properties used for theming — no hardcoded hex colors
- No direct dependency on Next.js in `packages/ui` — client directive only

## Steps
1. Install `lightweight-charts` package: `bun add lightweight-charts`
2. Write failing tests (RED):
   - Component renders container div
   - Accepts empty data without error
   - Correct types exported
3. Create `lightweight-chart.tsx` with chart lifecycle (GREEN)
4. Wire theme via CSS custom properties (GREEN)
5. Export from barrel (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `LightweightChart` renders `[data-testid="lightweight-chart"]` container
- Component does not throw with empty `data` array
- `OHLCVBar`, `LightweightChartProps` types exported from `packages/ui/src/index.ts`
- `ResizeObserver` cleanup registered in `useEffect` return
- `bun run typecheck` passes

## Validation
```bash
bun test packages/ui
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-23
- Files: `packages/ui/src/views/charts/lightweight-chart.tsx`, `packages/ui/__tests__/lightweight-chart.test.tsx`, `packages/ui/src/index.ts`
- Tests: 5 chart tests; Validation: 1373 pass, 0 fail

## Outputs
- `LightweightChart` component, `OHLCVBar`, `LightweightChartProps` types

## Out of Scope
- Volume histogram series (separate concern)
- Strategy event markers overlay (T-157)
- Equity curve variant (T-158)
- Chart data fetching (T-156)
