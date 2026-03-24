# T-08-011 Scaffold apps/web Next.js project

## Goal
Create the `apps/web/` Next.js application with routing, layout shell, and API client setup.

## Why
EP08 M3 — web UI entry point. Provides SSR-capable web interface importing from packages/ui.

## Inputs
- `docs/DESIGN_SYSTEM.md` §4 (layout shell), §6 (navigation)
- `docs/TECH_STACK.md` (Next.js, Eden treaty)
- `packages/ui/` (shared components from T-08-010)

## Dependencies
- T-08-010 (packages/ui scaffold)

## Expected Outputs
- `apps/web/` Next.js project with App Router
- Global layout with sidebar + top bar shell
- API client setup (fetch wrapper or Eden treaty)
- React Query provider
- Page stubs for all routes

## Deliverables
- `apps/web/package.json`
- `apps/web/next.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/tailwind.config.ts`
- `apps/web/src/app/layout.tsx` (root layout with providers)
- `apps/web/src/app/page.tsx` (dashboard redirect)
- `apps/web/src/app/dashboard/page.tsx` (stub)
- `apps/web/src/app/strategies/page.tsx` (stub)
- `apps/web/src/app/events/page.tsx` (stub)
- `apps/web/src/app/orders/page.tsx` (stub)
- `apps/web/src/app/alerts/page.tsx` (stub)
- `apps/web/src/app/backtest/page.tsx` (stub)
- `apps/web/src/app/risk/page.tsx` (stub)
- `apps/web/src/app/settings/page.tsx` (stub)
- `apps/web/src/app/login/page.tsx` (stub)
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/top-bar.tsx`

## Constraints
- Next.js App Router (not Pages Router)
- Import shared components from `@combine/ui`
- API base URL from environment variable
- All pages server-rendered by default
- Layout matches DESIGN_SYSTEM.md §4 shell structure

## Steps
1. Create package.json with Next.js deps
2. Configure next.config.ts with workspace transpilation
3. Set up root layout with ThemeProvider + QueryClientProvider
4. Create sidebar and top bar layout components
5. Create page stubs for all routes
6. Set up API client with base URL config

## Acceptance Criteria
- `apps/web/` builds with `next build`
- All routes render stub pages
- Sidebar navigation works
- Theme toggle works
- API client configurable via env

## Validation
```bash
cd apps/web && bun run build
bun run typecheck
```

## Out of Scope
- Real data fetching (separate tasks)
- Monaco editor integration
- SSE real-time updates
- Tauri desktop wrapper

## Implementation Notes
- Date: 2026-03-22
- Files changed: 16 new files in apps/web/ (package.json, next.config.ts, tsconfig.json, postcss.config.mjs, layout.tsx, api-client.ts, sidebar.tsx, top-bar.tsx, globals.css, 9 page stubs)
- Tests: Build validation (next build succeeds, all 13 routes prerendered)
- Approach: Next.js 15.5 App Router with Tailwind v4, sidebar+topbar layout shell, stub pages for all routes
- Key decisions: packages/ui uses extensionless imports for Next.js webpack compat, "use client" directives on theme components
- Validation: next build succeeds (all static pages), typecheck clean, full suite 1156 pass

## Outputs
- `apps/web/` Next.js project with App Router, all route stubs
- Sidebar navigation (DESIGN_SYSTEM.md §6 structure)
- TopBar with connection status indicator
- API client (`apps/web/src/lib/api-client.ts`) with typed fetch wrapper
- 10 page routes: dashboard, strategies, events, orders, alerts, backtest, risk, settings, login, root redirect
