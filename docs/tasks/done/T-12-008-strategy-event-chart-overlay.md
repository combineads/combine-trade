# T-12-008 Strategy event chart overlay

## Goal
Create a `StrategyEventOverlay` component that renders LONG/SHORT entry markers, WIN/LOSS/TIME_EXIT exit markers, and TP/SL horizontal lines on a `LightweightChart` instance using the Lightweight Charts marker and price line APIs.

## Why
Raw candlestick charts show price action but not strategy decisions. Traders need to see exactly where their strategy triggered LONG/SHORT entries and how each trade resolved (WIN/LOSS/TIME_EXIT) to evaluate strategy quality. Overlaying these on the chart connects the visual price story with strategy event data.

## Inputs
- `LightweightChart` component and `ISeriesApi` ref from T-12-006
- `packages/core/src/strategy/types.ts` — strategy event types (StrategyEvent, EventDirection, ExitReason)
- Lightweight Charts marker API (`SeriesMarker`, `createSeriesMarker`)
- Lightweight Charts price line API (`createPriceLine`)
- `docs/DESIGN_SYSTEM.md` — color tokens for markers

## Dependencies
- T-12-006 (LightweightChart component with series ref)

## Expected Outputs
- `packages/ui/src/views/charts/strategy-event-overlay.tsx`
- `packages/ui/__tests__/strategy-event-overlay.test.tsx`
- Updated `packages/ui/src/index.ts` — component exported

## Deliverables

### 1. StrategyEventOverlay component
```typescript
// packages/ui/src/views/charts/strategy-event-overlay.tsx
"use client";

export interface StrategyEvent {
  id: string;
  time: number;           // Unix timestamp (seconds)
  direction: 'LONG' | 'SHORT';
  exitTime?: number;
  exitReason?: 'WIN' | 'LOSS' | 'TIME_EXIT';
  entryPrice: number;
  exitPrice?: number;
  tpPrice?: number;
  slPrice?: number;
}

export interface StrategyEventOverlayProps {
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  events: StrategyEvent[];
  selectedEventId?: string;   // show TP/SL lines for this event only
}

export function StrategyEventOverlay({
  seriesRef,
  events,
  selectedEventId,
}: StrategyEventOverlayProps): null   // renders nothing to DOM — imperative chart API only
```

### 2. Marker rendering rules
- LONG entry: upward triangle (`arrowUp`), color `--color-success`, position `belowBar`
- SHORT entry: downward triangle (`arrowDown`), color `--color-danger`, position `aboveBar`
- WIN exit: circle marker, color `--color-success`, position based on direction
- LOSS exit: circle marker, color `--color-danger`, position based on direction
- TIME_EXIT: square marker, color `--color-text-secondary`, neutral position

### 3. TP/SL price lines
- Only rendered for `selectedEventId`
- TP line: dashed, color `--color-success`, labeled "TP"
- SL line: dashed, color `--color-danger`, labeled "SL"
- Lines removed when `selectedEventId` changes or clears

### 4. Tests
- Component returns null (no DOM node)
- Renders without error when events is empty array
- Renders without error when seriesRef.current is null
- Exports correct types

## Constraints
- Component renders `null` to DOM — all rendering is via imperative Lightweight Charts API
- `"use client"` directive required
- Markers set via `series.setMarkers()` — full replacement on each render (not append)
- Price lines created/destroyed on `selectedEventId` change
- Cleanup all price lines on unmount
- No hardcoded colors — CSS custom property values read at render time

## Steps
1. Write failing tests (RED):
   - Component renders null
   - No crash with empty events
   - No crash with null seriesRef
2. Implement marker rendering via `series.setMarkers()` (GREEN)
3. Implement TP/SL price lines on selectedEventId change (GREEN)
4. Cleanup price lines on unmount (GREEN)
5. Export from barrel (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `StrategyEventOverlay` returns null (zero DOM nodes rendered)
- No error thrown when `events` is empty
- No error thrown when `seriesRef.current` is null (series not yet initialized)
- LONG entries produce `arrowUp` markers, SHORT entries produce `arrowDown` markers
- TP/SL price lines appear only for `selectedEventId`
- Price lines cleaned up on unmount
- `bun run typecheck` passes

## Validation
```bash
bun test packages/ui
bun run typecheck
```

## Out of Scope
- Multi-event TP/SL line display (selected event only)
- Volume markers
- Equity curve overlay (T-12-009)
- Data fetching (T-12-007)
