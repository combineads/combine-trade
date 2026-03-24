# T-20-007 desktop-pages-secondary

## Goal
Implement secondary app pages for desktop: events, orders, alerts, risk, backtest, settings.

## Why
All web views must be available in the desktop app. These are thin wrappers around packages/ui views.

## Inputs
- packages/ui views (EventsView, OrdersView, AlertsView, RiskView, BacktestView, SettingsView)
- apps/desktop (app)/layout.tsx from T-20-005

## Dependencies
- T-20-005

## Expected Outputs
6 page files in apps/desktop/src/app/(app)/; all compile in next build

## Deliverables
- `apps/desktop/src/app/(app)/events/page.tsx`
- `apps/desktop/src/app/(app)/orders/page.tsx`
- `apps/desktop/src/app/(app)/alerts/page.tsx`
- `apps/desktop/src/app/(app)/risk/page.tsx`
- `apps/desktop/src/app/(app)/backtest/page.tsx`
- `apps/desktop/src/app/(app)/settings/page.tsx`

Each is a 'use client' wrapper rendering the corresponding View from @combine/ui.

## Constraints
- All pages must be 'use client'. Thin wrappers only — no business logic in page files.

## Steps
1. Create all 6 page files
2. Run next build to verify all routes compile

## Acceptance Criteria
- cd apps/desktop && bunx next build succeeds
- out/events/, out/orders/, out/alerts/, out/risk/, out/backtest/, out/settings/ all exist in out/
- bun run typecheck passes

## Validation
```bash
bun run typecheck
cd apps/desktop && bunx next build
ls apps/desktop/out/events/index.html apps/desktop/out/settings/index.html
```

## Out of Scope
Build workflow (T-20-008)

## Implementation Notes

- **Date:** 2026-03-24
- **Files changed:**
  - `apps/desktop/src/app/(app)/events/page.tsx`
  - `apps/desktop/src/app/(app)/orders/page.tsx`
  - `apps/desktop/src/app/(app)/alerts/page.tsx`
  - `apps/desktop/src/app/(app)/risk/page.tsx`
  - `apps/desktop/src/app/(app)/backtest/page.tsx`
  - `apps/desktop/src/app/(app)/settings/page.tsx`
- **Approach:** All 6 pages are thin `'use client'` wrappers. Events/Orders/Alerts use local useState + useEffect to fetch from API. Risk uses RiskManagementView with kill-switch toggle handlers. Backtest uses BacktestPage from @combine/ui. Settings uses SettingsView with useTheme hook.
- **Validation results:**
  - `bun run typecheck` ✅
  - `cd apps/desktop && bunx next build` ✅ (15 static pages generated)
  - `out/events/index.html` ✅
  - `out/settings/index.html` ✅

## Outputs
- 6 page files in `apps/desktop/src/app/(app)/`
- All routes compile and export to static HTML
