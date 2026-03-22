# T-165 Web app auth integration

## Goal
Wire the authentication flow into the Next.js web app: an auth context provider with login/logout/refresh, a protected route wrapper that redirects unauthenticated users to `/login`, an API client that auto-attaches the JWT token, and automatic token refresh on 401 responses.

## Why
All protected API endpoints (T-152) require a valid JWT. Without auth integration in the web app, every API call fails with 401. The auth context is the single source of truth for auth state across all pages, and the API client interceptor eliminates the need for each component to handle token attachment manually.

## Inputs
- `packages/ui/src/` — auth context location (platform-shared UI package)
- `apps/web/src/` — Next.js app router pages
- `POST /api/v1/auth/login` — login endpoint (returns access + refresh tokens)
- `POST /api/v1/auth/refresh` — token refresh endpoint
- `docs/SECURITY.md` — JWT storage rules (memory only, never localStorage for access token)
- `docs/ARCHITECTURE.md` — apps/web structure, auth flow

## Dependencies
- T-152 (global auth middleware enforcing JWT on protected routes)

## Expected Outputs
- `packages/ui/src/auth/auth-context.tsx` — React context + provider
- `packages/ui/src/auth/use-auth.ts` — typed hook to consume auth context
- `packages/ui/src/auth/protected-route.tsx` — wrapper component
- `packages/ui/src/api/client.ts` — API client with interceptors
- `packages/ui/__tests__/auth-context.test.tsx` — auth context tests
- `apps/web/src/app/layout.tsx` — updated to wrap with `AuthProvider`
- Updated `packages/ui/src/index.ts` — auth exports

## Deliverables

### 1. Auth context
```typescript
// packages/ui/src/auth/auth-context.tsx
"use client";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;   // in memory only, never persisted
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  apiBaseUrl,
}: {
  children: React.ReactNode;
  apiBaseUrl: string;
}): JSX.Element
```

### 2. Auth provider behavior
- `login()`: POST to `/api/v1/auth/login`, store access token in memory (React state), refresh token in httpOnly cookie (set by server)
- `logout()`: POST to `/api/v1/auth/logout`, clear in-memory token and state
- `refresh()`: POST to `/api/v1/auth/refresh` (sends httpOnly cookie automatically), update in-memory access token
- On mount: attempt silent refresh to restore session from httpOnly cookie

### 3. useAuth hook
```typescript
// packages/ui/src/auth/use-auth.ts
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

### 4. ProtectedRoute component
```typescript
// packages/ui/src/auth/protected-route.tsx
"use client";

export function ProtectedRoute({
  children,
  redirectTo = '/login',
}: {
  children: React.ReactNode;
  redirectTo?: string;
}): JSX.Element
```
- If `isLoading`: render null (avoid flash of redirect)
- If not `isAuthenticated`: redirect to `redirectTo` (using Next.js `useRouter().replace()`)
- If authenticated: render `children`

### 5. API client
```typescript
// packages/ui/src/api/client.ts
export interface ApiClientOptions {
  baseUrl: string;
  getToken(): string | null;
  onUnauthorized(): Promise<void>;  // called on 401: triggers refresh → retry
}

export function createApiClient(options: ApiClientOptions): {
  get<T>(path: string, query?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}
```
- Auto-attach `Authorization: Bearer {token}` header when token is available
- On 401 response: call `onUnauthorized()` (which calls `refresh()`), then retry original request once
- On second 401: throw `AuthError` (do not retry infinitely)

### 6. Tests
- `AuthProvider` initial state: `{ user: null, isAuthenticated: false, isLoading: true }`
- `login()` sets `isAuthenticated: true` and `user` on success
- `login()` throws on invalid credentials (API returns 401)
- `logout()` clears `user` and `isAuthenticated`
- `ProtectedRoute` redirects when `isAuthenticated: false` and not loading
- `ProtectedRoute` renders children when `isAuthenticated: true`
- API client attaches Bearer token header
- API client retries on 401 after refresh

## Constraints
- Access token stored in React state (memory) only — never `localStorage` or `sessionStorage`
- Refresh token managed as httpOnly cookie by server — client never reads it directly
- `ProtectedRoute` must not flash protected content before redirect
- `useAuth()` throws informative error if used outside `AuthProvider`
- API client retry on 401 is exactly once — no retry loop
- `packages/ui` must not import Next.js App Router APIs directly — use React Router-compatible abstraction or `next/navigation` only in app components

## Steps
1. Write failing tests (RED):
   - AuthProvider initial state
   - login updates state
   - logout clears state
   - ProtectedRoute redirects unauthenticated
   - ProtectedRoute renders children when authenticated
   - API client attaches token
2. Implement `AuthContext` and `AuthProvider` (GREEN)
3. Implement `useAuth()` hook (GREEN)
4. Implement `ProtectedRoute` with loading/redirect logic (GREEN)
5. Implement `createApiClient()` with interceptor and 401 retry (GREEN)
6. Wire `AuthProvider` in `apps/web/src/app/layout.tsx` (GREEN)
7. Export from `packages/ui/src/index.ts` (GREEN)
8. Run validation (REFACTOR)

## Acceptance Criteria
- `AuthProvider` initial state has `isLoading: true`, `isAuthenticated: false`, `user: null`
- After successful `login()`: `isAuthenticated: true`, `user` populated, access token in memory
- After `logout()`: `isAuthenticated: false`, `user: null`, token cleared
- `ProtectedRoute` redirects to `/login` when not authenticated (not loading)
- `ProtectedRoute` renders children when authenticated
- API client `get()`/`post()` attach `Authorization: Bearer {token}` header
- 401 response triggers refresh and exactly one retry
- `bun run typecheck` passes

## Validation
```bash
bun test
bun run typecheck
```

## Out of Scope
- Login page UI (separate task)
- Role-based access control
- Remember-me / long-lived sessions
- OAuth / SSO
- Tauri-specific auth integration (uses same AuthProvider via packages/ui)

## Implementation Notes
- Date: 2026-03-23
- Files changed: `packages/ui/src/auth/auth-context.tsx`, `packages/ui/src/auth/use-auth.ts`, `packages/ui/src/auth/protected-route.tsx`, `packages/ui/src/auth/auth-api-client.ts`, `packages/ui/src/index.ts`, `apps/web/src/app/layout.tsx`, 3 test files
- Tests: 11 pass (initial state, user type, auth state, redirect logic x4, token attachment, no-token, 401 retry, double-401 throw)
- Approach: AuthProvider stores accessToken in React state (memory only). Silent refresh on mount via httpOnly cookie. ProtectedRoute extracts pure logic helpers for testability. Auth API client retries once on 401.
- Validation: `bun test` 1426 pass, `bun run typecheck` clean

## Outputs
- `AuthProvider`, `AuthContext`, `useAuth()`, `ProtectedRoute` — full auth flow
- `createAuthApiClient()` — fetch wrapper with auto Bearer token + 401 retry
- `initialAuthState` — testable initial state constant
- All exported from `packages/ui/src/index.ts`
- `apps/web/src/app/layout.tsx` wrapped with `<AuthProvider>`
