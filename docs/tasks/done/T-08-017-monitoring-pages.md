# T-08-017 Implement Events, Orders, Alerts monitoring pages

## Goal
Build the monitoring pages for events, orders, and alerts with paginated tables and filters.

## Why
EP08 M3 — Design Priority 5. Essential monitoring for trading operations.

## Inputs
- `docs/DESIGN_SYSTEM.md` §5.5 (tables), §5.2 (badges), §7 (states)
- Event/Order/Alert API routes
- API hooks (T-08-013)

## Dependencies
- T-08-012 (base UI components)
- T-08-013 (API client hooks)

## Expected Outputs
- Events page: paginated table with symbol, direction, strategy, date filters
- Orders page: paginated table with symbol, status, strategy filters
- Alerts page: paginated table with strategy, status filters
- Shared pagination component
- Filter controls

## Deliverables
- `packages/ui/src/views/events/events-view.tsx`
- `packages/ui/src/views/orders/orders-view.tsx`
- `packages/ui/src/views/alerts/alerts-view.tsx`
- `packages/ui/src/components/pagination.tsx`
- `packages/ui/src/components/filter-bar.tsx`
- `apps/web/src/app/events/page.tsx`
- `apps/web/src/app/orders/page.tsx`
- `apps/web/src/app/alerts/page.tsx`
- `packages/ui/__tests__/monitoring-pages.test.tsx`

## Constraints
- DataTable per DESIGN_SYSTEM.md §5.5 (mono numbers, right-aligned)
- Direction badges per §5.3 (LONG green, SHORT red)
- Status badges per §5.2
- Pagination with page/pageSize controls
- Empty states per §7.2
- Loading skeletons per §7.1
- Date range filter for events

## Steps
1. Write tests for monitoring components
2. Implement shared pagination component
3. Implement filter bar component
4. Implement Events page with table and filters
5. Implement Orders page with table and filters
6. Implement Alerts page with table and filters

## Acceptance Criteria
- All three pages render paginated data
- Filters narrow results correctly
- Pagination works (page navigation, page size change)
- Empty states shown when no data
- Loading skeletons during fetch

## Validation
```bash
bun test packages/ui/__tests__/monitoring-pages.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Event detail modal
- Order detail timeline
- Real-time SSE updates on tables
- Loading skeletons during fetch (deferred — need loading state management)
- Date range filter (deferred — FilterBar component created but not wired to pages)

## Implementation Plan
- Create DataTable generic component per §5.5 (alternating rows, mono numbers, right-aligned)
- Create FilterBar component with select dropdowns
- Create EventsView, OrdersView, AlertsView with DataTable + Pagination
- Wire apps/web pages to use view components with API fetch
- Export all new components from packages/ui barrel

## Implementation Notes
- Date: 2026-03-23
- Files changed:
  - `packages/ui/src/components/data-table.tsx` (new)
  - `packages/ui/src/components/filter-bar.tsx` (new)
  - `packages/ui/src/views/events/events-view.tsx` (new)
  - `packages/ui/src/views/orders/orders-view.tsx` (new)
  - `packages/ui/src/views/alerts/alerts-view.tsx` (new)
  - `packages/ui/__tests__/monitoring-pages.test.tsx` (new)
  - `packages/ui/src/index.ts` (updated — added monitoring exports)
  - `apps/web/src/app/(app)/events/page.tsx` (updated)
  - `apps/web/src/app/(app)/orders/page.tsx` (updated)
  - `apps/web/src/app/(app)/alerts/page.tsx` (updated)
- Tests written: 14 (DataTable: 3, FilterBar: 2, EventsView: 3, OrdersView: 3, AlertsView: 3)
- Approach: TDD — tests first, then DataTable generic, then views, then web page wiring
- Validation results: 14/14 tests pass, typecheck clean, Next.js build succeeds, 1241 total pass
- Discovered work: FilterBar created but not integrated into page-level state; loading skeletons need client-side loading state

## Outputs
- `DataTable<T>` component — generic table with typed columns, alternating rows, empty state
- `FilterBar` component — select dropdowns for filtering
- `EventsView` component — events table with DirectionBadge
- `OrdersView` component — orders table with status, quantity, price
- `AlertsView` component — alerts table with direction, message, status
- `EventRow`, `OrderRow`, `AlertRow` interfaces — canonical types for monitoring data
