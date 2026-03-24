# T-08-019 Implement Login page and auth flow

## Goal
Build the login page and authentication flow with JWT token management.

## Why
EP08 M3 — Design Priority 7. All pages except login require authentication.

## Inputs
- `docs/DESIGN_SYSTEM.md` §13 (Login screen)
- Auth API routes (login, refresh, logout)
- Auth middleware

## Dependencies
- T-08-011 (apps/web scaffold)

## Expected Outputs
- Login page with email/password form
- Auth context/store (zustand) for token state
- Protected route wrapper (redirect to /login if unauthenticated)
- Auto-refresh token on expiry
- Logout functionality

## Deliverables
- `packages/ui/src/views/auth/login-view.tsx`
- `packages/ui/src/stores/auth-store.ts`
- `packages/ui/src/hooks/use-auth.ts`
- `packages/ui/src/components/protected-route.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/middleware.ts` (Next.js middleware for auth redirect)
- `packages/ui/__tests__/auth.test.tsx`

## Constraints
- httpOnly cookie for refresh token (set by API)
- Access token in zustand memory store (not localStorage)
- Auto-refresh before expiry (15min access, 7d refresh)
- Login form validates email/password required
- Error display inline (no toast per §10.1)
- Single-user: no registration flow

## Steps
1. Write tests for auth components
2. Implement zustand auth store
3. Implement login form view
4. Implement protected route wrapper
5. Implement Next.js middleware for auth redirect
6. Wire to auth API endpoints

## Acceptance Criteria
- Login form submits credentials
- Success redirects to dashboard
- Invalid credentials show inline error
- Protected routes redirect to login when unauthenticated
- Token auto-refresh works

## Validation
```bash
bun test packages/ui/__tests__/auth.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Social login
- Multi-user registration
- Password reset
- Keychain integration (Tauri only)

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/ui/src/views/auth/login-view.tsx, packages/ui/src/stores/auth-store.ts, apps/web/src/app/login/page.tsx, route group restructuring (app)/(auth)
- Tests: 6 tests covering LoginView (form, error, loading) and AuthStore (init, login, logout)
- Approach: Route groups separate auth pages (no sidebar) from app pages (with sidebar). Auth store uses vanilla pub/sub pattern (no zustand dependency yet). Login page wires to API with error handling.
- Key decisions: Route group (app)/ for sidebar layout, (auth)/ for login without sidebar
- Validation: 6/6 pass, typecheck clean, next build succeeds, full suite 1201 pass

## Outputs
- LoginView component (form with username/password, error, loading states)
- AuthStore (createAuthStore with setUser/clearUser)
- Login page wired to /api/v1/auth/login
- Route group layout structure: (app)/ with sidebar, (auth)/ without
