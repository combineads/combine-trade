# T-18-010 Tauri auth client

## Goal
Implement a Tauri-specific better-auth client in `packages/ui/src/auth/tauri-auth-client.ts` that uses the vanilla `better-auth/client` (non-React) `createAuthClient`, adapts it to be compatible with `BetterAuthClientInstance`, and persists session tokens in `@tauri-apps/plugin-store` for session persistence across app restarts.

## Why
T-18-007 added the Next.js better-auth client using `better-auth/react`. On Tauri, React hooks from `better-auth/react` rely on browser-based cookie management that may not work as expected in the WebView. The Tauri client needs to use the vanilla `better-auth/client`, which returns nanostores atoms, and wrap them to fit the `BetterAuthClientInstance` interface expected by `AuthProvider`. Session tokens must be stored in `@tauri-apps/plugin-store` (which is backed by the OS Keychain on macOS/Windows) so the user stays logged in across app restarts.

## Dependencies
- T-18-007 (BetterAuthClientInstance interface, AuthProvider DI pattern)
- T-20-004 (Tauri platform adapter, dynamic imports)

## Expected Outputs
- `packages/ui/src/auth/tauri-auth-client.ts` — Tauri-specific auth client factory
- `packages/ui/__tests__/tauri-auth-client.test.ts` — unit tests with mocked Tauri APIs
- `packages/ui/src/index.ts` updated to export `createTauriAuthClient`

## Constraints
- Must use dynamic import (never static) for `@tauri-apps/plugin-store` to keep web bundle clean
- Must implement `BetterAuthClientInstance` interface (signIn, signOut, useSession, getSession)
- `useSession` must return `{ data, isPending }` matching the better-auth React interface
- No direct dependency on `better-auth/react` — use `better-auth/client` (vanilla)
- Tests must mock dynamic imports, not require actual Tauri runtime

## Steps
1. Write failing tests for `createTauriAuthClient` (RED)
2. Implement `tauri-auth-client.ts` (GREEN)
3. Export from `packages/ui/src/index.ts`
4. Run tests and typecheck (REFACTOR)

## Acceptance Criteria
- `createTauriAuthClient` returns an object matching `BetterAuthClientInstance`
- `useSession` returns `{ data, isPending }` shape
- Session tokens stored/retrieved via `@tauri-apps/plugin-store` (dynamic import)
- `bun test packages/ui/__tests__/tauri-auth-client.test.ts` passes
- `bun run typecheck` passes

## Validation
```bash
bun test packages/ui/__tests__/tauri-auth-client.test.ts
bun run typecheck
```

## Implementation Notes

**Approach taken:**

- `packages/ui/src/auth/tauri-auth-client.ts` — factory `createTauriAuthClient` that wraps the vanilla `better-auth/client` `createAuthClient`. Satisfies `BetterAuthClientInstance` (same interface as `createBetterAuthClient`) so it drops in as `authClient` prop to `<AuthProvider>`.
- `StoreAdapter` interface injected via `_storeAdapter` option — tests supply a plain mock object; production code dynamically imports `@tauri-apps/plugin-store` on demand.
- `useSession` reads from vanilla client's `$store` atom (nanostores) and returns `{ data, isPending }` shape compatible with `AuthProvider`'s `BetterAuthProvider` branch.
- `_storeSession`, `_clearSession`, `_getStoredToken` are public test-facing helpers (prefixed `_`) for verifying store integration without Tauri runtime.
- `signIn.email` wrapper optionally persists `token` + `userId` from response to Tauri store; failure is non-fatal.
- `signOut` wrapper clears Tauri store in addition to delegating to vanilla client.
- `packages/ui/src/index.ts` exports `createTauriAuthClient`, `TauriAuthClientOptions`, `TauriAuthClientInstance`, `StoreAdapter`.

**TDD cycle:**

- RED: test file created importing `../src/auth/tauri-auth-client.js` which did not exist → `Cannot find module` error confirmed.
- GREEN: implementation written, 11/12 tests passed; 1 test failed due to `beforeEach` scope issue in nested describe block.
- REFACTOR: added `beforeEach` inside the nested `describe` to ensure isolation; all 12 tests pass.

**Test results:**

- `bun test packages/ui/__tests__/tauri-auth-client.test.ts` — 12/12 pass
- `bun test packages/ui` — 255/255 pass (pre-existing `auth-api-client` unhandled error on localhost:3100 is unrelated)
- `bun run typecheck` — 0 errors

## Outputs
- `packages/ui/src/auth/tauri-auth-client.ts` (new)
- `packages/ui/__tests__/tauri-auth-client.test.ts` (new)
- `packages/ui/src/index.ts` (updated — added exports)
- `docs/tasks/done/T-18-010-tauri-auth-client.md` (new)
