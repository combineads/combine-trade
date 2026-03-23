# T-200 platform-adapter-core

## Goal
Implement packages/ui/src/platform/ with PlatformAdapter interface, PlatformProvider context, usePlatform() hook, and web adapter. Export from packages/ui index.

## Why
Shared views need to call usePlatform() to access OS notifications and token storage, abstracting web vs desktop behavior. Currently packages/ui has no platform/ directory.

## Inputs
- packages/ui/src/index.ts (add exports)
- packages/ui/src/ (existing structure)
- ARCHITECTURE.md (platform adapter design)

## Dependencies
- T-197

## Expected Outputs
packages/ui/src/platform/ with PlatformAdapter interface and web implementation; unit tests passing

## Deliverables
- `packages/ui/src/platform/index.ts` — exports PlatformAdapter type, PlatformProvider, usePlatform
- `packages/ui/src/platform/context.tsx` — PlatformProvider component (detects __TAURI_INTERNALS__ in useEffect, lazy imports tauri adapter); usePlatform() hook
- `packages/ui/src/platform/web.ts` — web adapter: isDesktop=false, sendNotification → Web Notification API, storeRefreshToken/getRefreshToken → no-op (returns undefined)
- `packages/ui/src/platform/__tests__/platform-adapter.test.ts` — unit tests: web adapter returns isDesktop=false, sendNotification calls Notification API, storeRefreshToken is a no-op
- Update `packages/ui/src/index.ts` — add exports for PlatformProvider, usePlatform, PlatformAdapter

## Constraints
- Web adapter must NOT import @tauri-apps/* (tauri adapter is dynamic import only). Detection must be inside useEffect (SSR-safe). Interface must be simple (isDesktop, sendNotification, storeRefreshToken, getRefreshToken).

## Steps
1. Define PlatformAdapter interface in platform/index.ts
2. Implement web adapter (web.ts)
3. Implement PlatformProvider + usePlatform() (context.tsx) with __TAURI_INTERNALS__ detection
4. Write unit tests (mock Notification API for web adapter)
5. Export from packages/ui/src/index.ts
6. Run typecheck and tests

## Acceptance Criteria
- bun run typecheck passes
- bun test packages/ui/src/platform passes
- Web adapter importable without @tauri-apps/api installed

## Validation
```bash
bun run typecheck
bun test packages/ui/src/platform
```

## Out of Scope
Tauri adapter (T-201), wrapping desktop pages in PlatformProvider (T-202)
