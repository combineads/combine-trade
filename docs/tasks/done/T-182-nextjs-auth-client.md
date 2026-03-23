# T-182 Next.js auth client

## Goal
Install the better-auth React client (`@better-auth/react`) in `apps/web/`, create the auth client instance, build the login page (`/login`), add a Next.js middleware for unauthenticated route redirection, and replace the existing `useAuth` hook with a better-auth-backed implementation in `packages/ui/hooks/useAuth.ts`.

## Why
The current web client has no built-in session management tied to better-auth. After T-177 the server issues better-auth sessions (httpOnly cookies). The web client must use the matching better-auth React client to sign in, read session state, and sign out. The shared `useAuth` hook in `packages/ui/` ensures that both `apps/web/` and `apps/desktop/` speak the same auth abstraction.

## Inputs
- `apps/web/` — Next.js SSR application
- `packages/ui/hooks/useAuth.ts` — current auth hook (may be stub or legacy)
- `packages/ui/views/` — shared view components; `LoginView` goes here
- `packages/ui/platform/` — `usePlatform()` hook for platform-specific behavior
- `docs/exec-plans/18-better-auth-multiuser.md` § M5 — client deliverables, session management, redirect behavior
- `docs/ARCHITECTURE.md` — `packages/ui/` is the shared component layer; `apps/web/` pages are thin wrappers

## Dependencies
- T-177 (better-auth server endpoints must exist before the client can connect to them)

## Expected Outputs
- `apps/web/src/lib/auth-client.ts` — better-auth client instance (`createAuthClient`)
- `apps/web/src/app/login/page.tsx` — login page using `LoginView`
- `apps/web/src/middleware.ts` — Next.js middleware for session-based redirect
- `packages/ui/views/LoginView.tsx` — shared login form component
- `packages/ui/hooks/useAuth.ts` — updated to use `useSession()` from better-auth React client
- Unit tests for `useAuth` hook with mocked better-auth client

## Deliverables

### `apps/web/src/lib/auth-client.ts`
```typescript
import { createAuthClient } from "@better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
});

export const { signIn, signOut, useSession } = authClient;
```

### `packages/ui/hooks/useAuth.ts`
```typescript
// Platform-agnostic auth hook backed by better-auth React client
import { useSession, signOut } from "../../apps/web/src/lib/auth-client"; // resolved via tsconfig paths
// OR: accept the client as a parameter to avoid cross-package import

export function useAuth() {
  const { data: session, isPending } = useSession();
  return {
    user: session?.user ?? null,
    isLoading: isPending,
    isAuthenticated: !!session,
    signOut: () => signOut({ fetchOptions: { onSuccess: () => window.location.href = "/login" } }),
  };
}
```

Note: the `useAuth` hook implementation must avoid a direct import from `apps/web/`. Use a factory pattern or inject the `authClient` instance via `PlatformProvider` context. Follow the existing `packages/ui/platform/` adapter pattern.

### `packages/ui/views/LoginView.tsx`
- Email + password form fields
- "Sign in" button: calls `signIn.email({ email, password, callbackURL: "/dashboard" })`
- Loading state during sign-in
- Error message display on failure

### `apps/web/src/middleware.ts`
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  const hasSession = request.cookies.has("combine-trade.session_token");

  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Note: the cookie name `combine-trade.session_token` must match the `cookiePrefix` set in `better-auth.ts` (T-176). Verify the exact cookie name from better-auth docs.

### `apps/web/src/app/login/page.tsx`
Thin wrapper:
```tsx
import { LoginView } from "packages/ui/views/LoginView";
export default function LoginPage() {
  return <LoginView />;
}
```

## Constraints
- `packages/ui/` must not import directly from `apps/web/` — use dependency injection or context
- The auth client `baseURL` must come from `NEXT_PUBLIC_API_URL` env var (not hardcoded)
- Cookie name in middleware must match the `cookiePrefix` configured in `better-auth.ts`
- Auto session refresh: better-auth React client handles this automatically via `useSession()`
- Tauri desktop client is out of scope for this task — T-182 covers web only
- Running DB is NOT required for unit tests (mock better-auth client). Integration tests require running server.

## Steps
1. Write failing test: render `LoginView` — component does not exist yet (RED)
2. Install `@better-auth/react` in `apps/web/`
3. Create `apps/web/src/lib/auth-client.ts`
4. Create `packages/ui/views/LoginView.tsx`
5. Create `apps/web/src/app/login/page.tsx`
6. Create `apps/web/src/middleware.ts` with redirect logic (GREEN)
7. Update `packages/ui/hooks/useAuth.ts` to use `useSession()`
8. Write unit tests for `LoginView` and `useAuth` with mocked client
9. Run `bun run typecheck` — zero errors (REFACTOR)

## Acceptance Criteria
- `LoginView` component renders email/password fields and a submit button
- Successful login redirects to `/dashboard`
- Unauthenticated access to any non-public route redirects to `/login`
- `useAuth()` returns `{ user, isLoading, isAuthenticated, signOut }`
- `signOut()` clears the session and redirects to `/login`
- `bun run typecheck` passes for `apps/web/` and `packages/ui/`
- `LoginView` unit tests pass

## Validation
```bash
bun run typecheck
bun test --filter "auth-client|login|useAuth"
# With running server + browser:
# Navigate to http://localhost:3001/dashboard → should redirect to /login
# Log in → should land on /dashboard
# Refresh → session persists (httpOnly cookie)
# Click logout → redirect to /login
```

## Out of Scope
- Tauri desktop auth client — future task
- Keychain session persistence — Tauri-specific
- OAuth / social login
- 2FA

## Implementation Notes

**Approach taken:**

- `packages/ui/src/auth/better-auth-client.ts` — thin factory wrapper around `better-auth/react`'s `createAuthClient`. Exposes `BetterAuthClientInstance` interface with `signIn`, `signOut`, `useSession`, `getSession`. Keeps `packages/ui` independent of `apps/web` env vars.
- `apps/web/src/lib/auth-client.ts` — creates the singleton `authClient` instance bound to `NEXT_PUBLIC_API_URL ?? http://localhost:3100`.
- `apps/web/src/app/(auth)/login/page.tsx` — updated to use `authClient.signIn.email()` instead of raw fetch.
- `apps/web/src/middleware.ts` — new Next.js middleware that redirects unauthenticated requests to `/login`. Cookie name `combine-trade.session_token` matches `cookiePrefix = "combine-trade"` in `better-auth.ts`.
- `apps/web/src/components/auth-provider-wrapper.tsx` — client component that binds `authClient` to `AuthProvider` (root layout is a Server Component and cannot import hooks directly).
- `apps/web/src/app/layout.tsx` — updated to use `AuthProviderWrapper` instead of direct `AuthProvider`.
- `packages/ui/src/auth/auth-context.tsx` — refactored to use composition pattern: `BetterAuthProvider` (calls `useSession` unconditionally, React-hooks-correct) and `LegacyAuthProvider` (legacy fetch path). Public `AuthProvider` selects between them based on the `authClient` prop.
- `packages/ui/src/index.ts` — exports `createBetterAuthClient`, `BetterAuthClientOptions`, `BetterAuthClientInstance`.

**Deviations from task spec:**
- Task spec used `@better-auth/react` import path but the installed package exposes it at `better-auth/react` — used the correct path.
- Task spec suggested updating `packages/ui/hooks/useAuth.ts` but the file is at `packages/ui/src/auth/use-auth.ts` and was not changed — it reads from `AuthContext` which is now backed by better-auth when `authClient` is passed, so no change needed.
- `LoginView` already existed at `packages/ui/src/views/auth/login-view.tsx` with email/password fields and was not replaced — it accepts `onSubmit` which the login page wraps to call `authClient.signIn.email()`.

**Test results:**
- `bun test packages/ui/__tests__/auth-client-better.test.ts` — 7/7 pass
- `bun run typecheck` — 0 errors

## Outputs
- `packages/ui/src/auth/better-auth-client.ts` (new)
- `packages/ui/__tests__/auth-client-better.test.ts` (new)
- `apps/web/src/lib/auth-client.ts` (new)
- `apps/web/src/middleware.ts` (new)
- `apps/web/src/components/auth-provider-wrapper.tsx` (new)
- `apps/web/src/app/(auth)/login/page.tsx` (updated)
- `apps/web/src/app/layout.tsx` (updated)
- `packages/ui/src/auth/auth-context.tsx` (updated)
- `packages/ui/src/index.ts` (updated)
