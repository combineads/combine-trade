# T-12-003 Strategy event marker types and overlay component

## Goal
Create `EventMarkerOverlay` — a component that renders LONG/SHORT/WIN/LOSS/TIME_EXIT trade event markers with associated TP/SL line indicators, following the marker specifications in `DESIGN_SYSTEM.md` §9.

## Why
Strategy events (LONG entries, SHORT entries, wins, losses, time exits) are the primary output of the system and must be visually overlaid on price charts so traders can evaluate strategy performance at a glance. This component provides the marker rendering logic as a pure data-display layer, decoupled from the chart library.

## Inputs
- `docs/DESIGN_SYSTEM.md` §9 (event markers: arrows, icons, colors, TP/SL lines)
- `packages/ui/src/components/chart-container.tsx` (from T-12-001)
- `packages/ui/src/components/badge.tsx` — DirectionBadge (from T-08-012)

## Dependencies
- T-08-012 (base UI components — badge, design tokens)

## Expected Outputs
- `packages/ui/src/views/charts/event-markers.tsx`
- `packages/ui/__tests__/event-markers.test.tsx`

## Deliverables

### 1. EventMarker types
```typescript
// packages/ui/src/views/charts/event-markers.tsx
export type MarkerType = 'LONG' | 'SHORT' | 'WIN' | 'LOSS' | 'TIME_EXIT';

export interface EventMarker {
  id: string;
  type: MarkerType;
  timestamp: number;         // unix ms
  price: number;
  tpPrice?: number;          // take-profit price
  slPrice?: number;          // stop-loss price
  label?: string;            // optional annotation text
}
```

### 2. Marker visual spec (per DESIGN_SYSTEM.md §9)
| Type | Icon | Color |
|------|------|-------|
| LONG | ↑ | `--color-long` (green) |
| SHORT | ↓ | `--color-short` (red) |
| WIN | ✓ | `--color-long` (green) |
| LOSS | ✗ | `--color-short` (red) |
| TIME_EXIT | ⏱ | `--color-text-muted` (gray) |

### 3. EventMarkerOverlay component
```typescript
interface EventMarkerOverlayProps {
  markers: EventMarker[];
  showTpSl?: boolean;    // default true — render TP/SL line indicators
}

export function EventMarkerOverlay({ markers, showTpSl = true }: EventMarkerOverlayProps)
```
- Renders a `div[data-testid="event-marker-overlay"]` wrapper
- Each marker renders as `div[data-testid="marker-{type}"]` (e.g. `data-testid="marker-LONG"`)
  - Contains `span[data-testid="marker-icon"]` with the Unicode icon
  - Applies the correct CSS custom property color class
- When `showTpSl` is true and marker has `tpPrice` → renders `div[data-testid="tp-line"]`
- When `showTpSl` is true and marker has `slPrice` → renders `div[data-testid="sl-line"]`
- Empty markers array → renders overlay wrapper with no children

### 4. SingleEventMarker sub-component
```typescript
export function SingleEventMarker({ marker, showTpSl }: { marker: EventMarker; showTpSl?: boolean })
```
- Renders one marker with icon + optional TP/SL lines
- Exported for use in lists/tables outside chart context

### 5. Index exports
- Export `EventMarkerOverlay`, `SingleEventMarker`, `EventMarker`, `MarkerType` from `packages/ui/src/index.ts`

## Constraints
- Use CSS custom properties (`--color-long`, `--color-short`, `--color-text-muted`) — no hardcoded colors
- Icons must be the exact Unicode characters specified: ↑ ↓ ✓ ✗ ⏱
- Component is purely presentational — no API calls, no state management
- TP/SL lines are presentational only (colored horizontal rules or divs, not positioned absolutely on a chart)

## Steps
1. Write failing tests (RED):
   - Renders each marker type with correct icon
   - Renders TP line when tpPrice present
   - Renders SL line when slPrice present
   - Renders nothing extra when markers array is empty
2. Define `EventMarker` and `MarkerType` types (GREEN)
3. Implement `SingleEventMarker` (GREEN)
4. Implement `EventMarkerOverlay` (GREEN)
5. Export from barrel, run validation (REFACTOR)

## Acceptance Criteria
- `EventMarkerOverlay` renders one `[data-testid="marker-LONG"]` per LONG marker in the array
- Each marker type renders the correct icon character (↑ ↓ ✓ ✗ ⏱)
- Markers with `tpPrice` render `[data-testid="tp-line"]` when `showTpSl` is true
- Markers with `slPrice` render `[data-testid="sl-line"]` when `showTpSl` is true
- Empty array renders overlay wrapper with zero marker children

## Validation
```bash
bun test packages/ui/__tests__/event-markers.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Pixel-accurate chart overlay positioning (requires `lightweight-charts` plugin API)
- Marker click handlers / tooltips
- Marker filtering by date range
- Integration with `CandlestickChartView` (deferred)
