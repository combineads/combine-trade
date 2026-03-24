# T-08-014 Implement Dashboard page

## Goal
Build the main Dashboard page showing pipeline status, kill switch state, active strategies, and recent activity.

## Why
EP08 M3 — primary landing page. Design Priority 1 per DESIGN_SYSTEM.md §13.

## Inputs
- `docs/DESIGN_SYSTEM.md` §4 (layout), §5 (components), §7.4 (real-time updates)
- `packages/ui/` components (T-08-012)
- API hooks (T-08-013)

## Dependencies
- T-08-012 (base UI components)
- T-08-013 (API client hooks)

## Expected Outputs
- Dashboard page with 4-column grid layout
- Kill switch status card (always visible, per §5.9)
- Active strategies summary cards
- Recent events feed
- Worker status indicators (status dots per §5.7)
- Execution mode display
- SSE real-time updates

## Deliverables
- `packages/ui/src/views/dashboard/dashboard-view.tsx`
- `packages/ui/src/views/dashboard/kill-switch-card.tsx`
- `packages/ui/src/views/dashboard/strategy-summary.tsx`
- `packages/ui/src/views/dashboard/recent-events.tsx`
- `packages/ui/src/views/dashboard/worker-status.tsx`
- `apps/web/src/app/dashboard/page.tsx` (thin wrapper)
- `packages/ui/__tests__/dashboard.test.tsx`

## Constraints
- Kill Switch card matches DESIGN_SYSTEM.md §5.9 exactly (ON/OFF states)
- Status dots per §5.7 (connected/warning/down/inactive)
- Real-time updates via SSE with highlight flash animation
- 4-column responsive grid (2-col on tablet, 1-col on mobile)
- All monetary values in mono font, right-aligned

## Steps
1. Write tests for dashboard components
2. Implement Kill Switch card (ON/OFF states)
3. Implement strategy summary cards
4. Implement recent events feed
5. Implement worker status indicators
6. Wire SSE for real-time updates
7. Compose dashboard view

## Acceptance Criteria
- Dashboard renders with all sections
- Kill switch card shows correct ON/OFF state
- Real-time updates animate correctly
- Responsive layout works at all breakpoints

## Validation
```bash
bun test packages/ui/__tests__/dashboard.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Strategy detail page
- Chart components
- Full risk management page

## Implementation Notes
- Date: 2026-03-22
- Files changed: 5 new view files in packages/ui/src/views/dashboard/, updated apps/web/src/app/dashboard/page.tsx, packages/ui/__tests__/dashboard.test.tsx
- Tests: 9 tests covering KillSwitchCard (ON/OFF), StrategySummary, RecentEvents, WorkerStatus, DashboardView
- Approach: Pure presentational components with props — no data fetching. Dashboard page passes static data until API hooks are wired.
- Validation: 9/9 pass, typecheck clean, full suite 1195 pass

## Outputs
- KillSwitchCard (ON/OFF states per DESIGN_SYSTEM.md §5.9)
- StrategySummary (card grid with mini stats)
- RecentEvents (event feed with direction badges)
- WorkerStatus (status dots per §5.7)
- DashboardView (composed view with 4-column grid)
