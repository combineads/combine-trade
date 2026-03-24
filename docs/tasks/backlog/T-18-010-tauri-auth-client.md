# T-18-010 Tauri auth client

## Goal
Implement a platform-agnostic `useAuth` hook in `packages/ui/hooks/useAuth.ts` that wraps the better-auth client, with a Tauri-specific adapter that stores session tokens via Tauri's secure storage plugin instead of relying on httpOnly cookies.

## Why
EP18 M5 — the desktop app (`apps/desktop/`) cannot use httpOnly cookies because the Tauri WebView intercepts fetch differently than a browser. Without a Tauri-specific auth adapter, the desktop login flow will silently fail to persist sessions across app restarts. The shared `LoginView` component needs a single auth hook that works on both web and desktop without platform-specific code at the call site.

## Inputs
- `packages/ui/src/platform/` — `PlatformAdapter` interface, `usePlatform()` hook (T-20-004)
- `apps/web/src/lib/auth-client.ts` — existing Next.js better-auth client setup (T-18-007)
- `packages/ui/views/` — existing shared view components pattern
- EP18 M5 spec: Tauri vanilla client, `plugin:store`, `LoginView` in `packages/ui/views/`, auto-refresh

## Dependencies
- T-18-001 (better-auth setup — `auth` instance and `createAuthClient` available)
- T-20-004 (platform adapter tauri — `usePlatform()` hook, Tauri invoke wrapper)
- T-18-007 (Next.js auth client — establishes `createAuthClient` pattern to mirror)

## Expected Outputs
- `packages/ui/hooks/useAuth.ts` — platform-agnostic hook: `useAuth(): { user, session, signIn, signOut, isLoading, error }`
- `packages/ui/src/auth/tauri-auth-client.ts` — better-auth vanilla client configured for Tauri with custom `fetch` that attaches session token from Tauri store as `Authorization: Bearer` header
- `packages/ui/views/LoginView.tsx` — shared login form component using `useAuth()`; renders email + password fields, submit button, error display
- Auto-refresh: `useAuth` hook polls `getSession` every 5 minutes and calls `signIn` refresh if session is near expiry (< 5 min remaining)
- Session persistence in Tauri: `invoke('plugin:store|set', { key: 'session_token', value: token })` on sign-in; `invoke('plugin:store|get', { key: 'session_token' })` on mount; `invoke('plugin:store|delete', { key: 'session_token' })` on sign-out

## Deliverables
- `packages/ui/hooks/useAuth.ts`
- `packages/ui/src/auth/tauri-auth-client.ts`
- `packages/ui/views/LoginView.tsx`
- `packages/ui/__tests__/hooks/useAuth.test.ts`

## Constraints
- `useAuth` must work identically on web (cookie-based) and Tauri (token-based) — platform detected via `usePlatform()`
- Web path: delegate entirely to existing `@better-auth/react` `useSession` / `signIn` / `signOut`
- Tauri path: use vanilla `createAuthClient` with custom fetch; store token in Tauri plugin-store
- Tauri `invoke` calls must be wrapped in try/catch — Tauri store plugin may not be available in test/web environments
- `LoginView` must not contain any routing logic (redirect on success is the caller's responsibility)
- No direct import of `tauri-api` at module load time — use dynamic import or `usePlatform().isTauri` guard to keep web bundle clean
- Must not import Elysia, Drizzle, or CCXT
- React 18 compatible (no deprecated lifecycle methods)

## Steps
1. Write failing tests in `packages/ui/__tests__/hooks/useAuth.test.ts` (RED):

   **Test A — Web platform: signIn delegates to better-auth client**
   - Mock `usePlatform()` → `{ isTauri: false }`; mock better-auth `signIn.email`; call `signIn`; verify better-auth called

   **Test B — Tauri platform: signIn stores token in Tauri store**
   - Mock `usePlatform()` → `{ isTauri: true }`; mock `invoke`; mock better-auth response with session token; call `signIn`; verify `invoke('plugin:store|set', ...)` called

   **Test C — Tauri platform: session restored from store on mount**
   - Mock `invoke('plugin:store|get')` returning a token; verify `useAuth` initializes with session loaded

   **Test D — signOut clears Tauri store on Tauri platform**
   - Mock `invoke`; call `signOut`; verify `invoke('plugin:store|delete', ...)` called

   **Test E — signOut on web does not call invoke**
   - Mock `usePlatform()` → `{ isTauri: false }`; call `signOut`; verify `invoke` never called

   **Test F — Auto-refresh triggers when session expiry < 5 min**
   - Mock session with `expiresAt = now + 4 min`; advance fake timer 5 min; verify `getSession` called for refresh

   **Test G — LoginView renders email/password fields and submit**
   - Render `<LoginView onSuccess={() => {}} />`; verify email input, password input, submit button present

2. Implement `packages/ui/src/auth/tauri-auth-client.ts` (GREEN)
3. Implement `packages/ui/hooks/useAuth.ts` (GREEN)
4. Implement `packages/ui/views/LoginView.tsx` (GREEN)
5. Refactor: extract `SessionStore` interface; add JSDoc to `useAuth` return type

## Acceptance Criteria
- All 7 tests pass
- Web platform path does not call any Tauri APIs
- Tauri platform path stores and retrieves session token via `plugin:store` invoke
- `LoginView` renders without platform-specific imports at module load
- Auto-refresh fires when session expiry is within 5 minutes
- `useAuth` exported from `packages/ui/hooks/index.ts`
- `LoginView` exported from `packages/ui/views/index.ts`
- Zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test --filter "tauri-auth" && bun run typecheck
```

## Browser Verification
```
http://localhost:3000/login → enter email/password → click Login → verify redirect to /dashboard
```

## Out of Scope
- OAuth / social login providers
- Biometric authentication (Touch ID, Face ID) via Tauri
- Token rotation / refresh token management beyond simple session polling
- Desktop app packaging or Tauri build pipeline changes
- Role-based access control or permission checks in the hook
