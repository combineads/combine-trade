# T-20-004 platform-adapter-tauri

## Goal
Implement packages/ui/src/platform/tauri.ts — Tauri-specific adapter using dynamic imports for @tauri-apps/plugin-notification and @tauri-apps/plugin-store.

## Why
Desktop app needs OS-native notifications and Keychain token storage. Must be dynamically imported so web build does not include Tauri SDK.

## Inputs
- packages/ui/src/platform/ (from T-20-003)
- @tauri-apps/plugin-notification type definitions
- @tauri-apps/plugin-store type definitions

## Dependencies
- T-20-003

## Expected Outputs
tauri.ts implementing PlatformAdapter; dynamic imports gated on __TAURI_INTERNALS__; unit tests using mocks

## Deliverables
- `packages/ui/src/platform/tauri.ts` — tauri adapter: isDesktop=true, sendNotification → dynamic import @tauri-apps/plugin-notification sendNotification, storeRefreshToken/getRefreshToken → dynamic import @tauri-apps/plugin-store Store
- Update `packages/ui/src/platform/__tests__/platform-adapter.test.ts` — add tests for tauri adapter: mock dynamic imports, verify isDesktop=true, verify sendNotification calls tauri plugin

## Constraints
- MUST use dynamic import (not static import) for all @tauri-apps/* packages. Tests must mock dynamic imports, not require actual Tauri runtime.

## Steps
1. Implement tauri.ts with dynamic imports
2. Add unit tests for tauri adapter with mocked @tauri-apps packages
3. Run typecheck and tests

## Acceptance Criteria
- bun run typecheck passes
- bun test packages/ui/src/platform passes (tauri adapter tested with mocks)
- tauri.ts has NO static imports from @tauri-apps/*

## Validation
```bash
bun run typecheck
bun test packages/ui/src/platform
```

## Out of Scope
Desktop pages (T-20-005), actual Tauri window runtime
