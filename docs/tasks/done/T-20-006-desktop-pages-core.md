# T-20-006 desktop-pages-core

## Goal
Implement core app pages for desktop: dashboard, strategies list, strategy detail (catch-all), strategy create.

## Why
Core trading pages must be available in the desktop app. Strategy detail uses [[...params]] catch-all because static export cannot generate [id] pages with unknown IDs at build time.

## Inputs
- apps/web/src/app/(app)/ (reference)
- packages/ui views (DashboardView, StrategyListView, StrategyDetailView, StrategyCreateView)
- apps/desktop (app)/layout.tsx from T-20-005

## Dependencies
- T-20-005

## Expected Outputs
4 page files in apps/desktop/src/app/(app)/; all compile in next build

## Deliverables
- `apps/desktop/src/app/(app)/dashboard/page.tsx` — 'use client'; renders DashboardView
- `apps/desktop/src/app/(app)/strategies/page.tsx` — 'use client'; renders StrategyListView
- `apps/desktop/src/app/(app)/strategies/new/page.tsx` — 'use client'; renders StrategyCreateView
- `apps/desktop/src/app/(app)/strategies/[[...params]]/page.tsx` — 'use client'; reads params[0] as strategy id; renders StrategyDetailView

## Constraints
- Must use [[...params]] catch-all for strategy detail (static-export requirement). All pages must be 'use client'.

## Steps
1. Create dashboard page
2. Create strategies list page
3. Create strategy create page
4. Create strategy detail [[...params]] catch-all page
5. Run next build and verify all pages appear in out/

## Acceptance Criteria
- cd apps/desktop && bunx next build succeeds
- out/dashboard/index.html exists
- out/strategies/index.html exists
- out/strategies/[[...params]]/index.html exists
- bun run typecheck passes

## Validation
```bash
bun run typecheck
cd apps/desktop && bunx next build
ls apps/desktop/out/dashboard/index.html
ls apps/desktop/out/strategies/index.html
```

## Out of Scope
Secondary pages (T-20-007), platform-specific integrations
