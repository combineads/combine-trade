# T-08-026 Strategy detail event list tab

## Goal
Create `StrategyEventsTab` — a tab component for the strategy detail page that shows recent strategy events in a `DataTable` with direction badges, winrate, timestamps, and pagination.

## Why
EP08 — The strategy detail page (T-08-016) has a tab navigation structure. The events tab is the primary analytical view: it shows which LONG/SHORT signals the strategy fired, whether they won or lost, and their timestamps. This data is the evidence traders use to evaluate strategy quality.

## Inputs
- `packages/ui/src/components/data-table.tsx` (from T-08-017)
- `packages/ui/src/components/badge.tsx` — DirectionBadge, StatusBadge (from T-08-012)
- `packages/ui/src/components/pagination.tsx` (from T-08-012/T-08-017)
- `docs/DESIGN_SYSTEM.md` §5.5 (table), §5.3 (direction badges), §7.2 (empty state)

## Dependencies
- T-08-017 (monitoring pages — DataTable and Pagination components)

## Expected Outputs
- `packages/ui/src/views/strategies/strategy-events-tab.tsx`
- `packages/ui/__tests__/strategy-events-tab.test.tsx`

## Deliverables

### 1. StrategyEvent type
```typescript
// packages/ui/src/views/strategies/strategy-events-tab.tsx
export type EventOutcome = 'WIN' | 'LOSS' | 'TIME_EXIT' | 'OPEN';

export interface StrategyEvent {
  id: string;
  direction: 'LONG' | 'SHORT';
  outcome: EventOutcome;
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;              // in quote currency
  winRate?: number;          // rolling winrate at this event (0–1)
  timestamp: number;         // unix ms
}

export interface StrategyEventsTabProps {
  events: StrategyEvent[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
}
```

### 2. StrategyEventsTab component
```typescript
export function StrategyEventsTab({
  events,
  totalCount = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  loading = false,
}: StrategyEventsTabProps)
```
- `data-testid="strategy-events-tab"` root element

### 3. DataTable columns
The table renders these columns:
| Column | testid | Notes |
|--------|--------|-------|
| Direction | — | DirectionBadge (LONG/SHORT) |
| Symbol | — | mono font |
| Entry Price | — | mono, right-aligned, 2dp |
| Exit Price | — | mono, right-aligned, 2dp; "—" when undefined |
| P&L | — | mono, right-aligned; green if > 0, red if < 0; "—" when undefined |
| Outcome | `outcome-{id}` | StatusBadge variant mapping: WIN→active, LOSS→stopped, TIME_EXIT→warning, OPEN→draft |
| Timestamp | — | ISO date string format `YYYY-MM-DD HH:mm` |

### 4. States
- Loading: renders `data-testid="events-loading"` skeleton (uses Skeleton component)
- Empty (events.length === 0 and not loading): renders `data-testid="events-empty"` with message "No events yet for this strategy."
- With data: renders `DataTable` with rows

### 5. Pagination
- Renders `Pagination` component below the table when `totalCount > pageSize`
- Calls `onPageChange` when page changes

### 6. Barrel update
- Export `StrategyEventsTab`, `StrategyEvent`, `EventOutcome` from strategy views
- Add to `packages/ui/src/index.ts`

## Constraints
- Use existing `DataTable<T>` generic component from T-08-017 — do not re-implement a table
- `DirectionBadge` must be used for LONG/SHORT column — no custom badge
- P&L must display with `--color-long` for positive, `--color-short` for negative (via inline style or CSS class)
- All price and P&L values rendered with mono font (`--font-mono`)
- Component is purely presentational — no API calls

## Steps
1. Write failing tests (RED):
   - StrategyEventsTab renders table when events provided
   - Renders DirectionBadge for each event
   - Renders outcome badge with correct variant
   - Renders empty state when events array is empty
   - Renders loading skeleton when loading is true
   - Renders Pagination when totalCount > pageSize
2. Implement column definitions for DataTable (GREEN)
3. Implement loading and empty states (GREEN)
4. Implement pagination rendering (GREEN)
5. Export and run validation (REFACTOR)

## Acceptance Criteria
- `[data-testid="strategy-events-tab"]` renders
- One row rendered per event in the events array
- Each row shows DirectionBadge (LONG green / SHORT red)
- `[data-testid="events-empty"]` renders when events array is empty
- `[data-testid="events-loading"]` renders when `loading` is true
- Pagination renders when `totalCount > pageSize`

## Validation
```bash
bun test packages/ui/__tests__/strategy-events-tab.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- SSE real-time event streaming into the table (T-08-025 integration)
- Event detail modal / drawer
- CSV export of events
- Strategy performance chart on this tab
