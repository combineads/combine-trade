# T-202 desktop-root-layout

## Goal
Implement apps/desktop root layout (providers), login page, and (app) layout with client-side auth guard.

## Why
Static-export apps cannot use Next.js Middleware for auth. The (app)/layout.tsx must do client-side auth guard via zustand store check.

## Inputs
- apps/web/src/app/ (reference for layout structure)
- packages/ui (ThemeProvider, AuthProvider, LoginView)
- PlatformProvider from T-200/T-201
- zustand auth store

## Dependencies
- T-198
- T-201

## Expected Outputs
apps/desktop/src/app/layout.tsx wrapping all providers; (auth)/login route; (app)/layout.tsx with client-side auth redirect

## Deliverables
- `apps/desktop/src/app/layout.tsx` — 'use client'; wraps ThemeProvider → AuthProvider → PlatformProvider → children
- `apps/desktop/src/app/(auth)/login/page.tsx` — 'use client'; renders LoginView from @combine/ui
- `apps/desktop/src/app/(app)/layout.tsx` — 'use client'; reads zustand auth store; if unauthenticated → router.replace('/login'); else renders children

## Constraints
- ALL components must be 'use client' — no Server Components in static export. Auth guard must use zustand store (not cookies/middleware). No server-side data fetching.

## Steps
1. Create apps/desktop/src/app/layout.tsx with all providers
2. Create (auth)/login/page.tsx
3. Create (app)/layout.tsx with zustand auth guard
4. Run next build to verify no hydration errors

## Acceptance Criteria
- cd apps/desktop && bunx next build succeeds
- out/login/index.html exists
- bun run typecheck passes

## Validation
```bash
bun run typecheck
cd apps/desktop && bunx next build && ls out/login/index.html
```

## Out of Scope
Individual app pages (T-203, T-204)
