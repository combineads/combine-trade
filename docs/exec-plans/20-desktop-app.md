# 20-desktop-app

## Objective

Scaffold `apps/desktop/` as a Tauri-wrapped Next.js static-export app that shares all UI logic from `packages/ui/`.
Add a `packages/ui/src/platform/` adapter layer abstracting web/desktop differences (OS notifications, Keychain token storage).
All existing web views become available on desktop through thin `'use client'` wrapper pages.

## Scope

- `apps/desktop/`: Next.js static export app (`output: 'export'`) + `src-tauri/` Rust project
- `packages/ui/src/platform/`: `PlatformAdapter` interface + `PlatformProvider` + `usePlatform()` hook + web/tauri adapters
- `apps/desktop/src/app/`: All pages mirrored from `apps/web/`, as thin `'use client'` wrappers
- Tauri configuration: `tauri.conf.json` (window, CSP with `unsafe-eval`, `distDir`), capabilities/permissions
- Native plugin integration (Rust): `tauri-plugin-notification` + `tauri-plugin-store`
- Build and dev workflow: `tauri dev` + `tauri build`, root `package.json` `dev:desktop` script

## Non-goals

- OKX exchange adapter (separate epic scope)
- Mobile (iOS/Android) Tauri target — desktop only (macOS / Windows / Linux)
- Desktop-exclusive features: system tray, hardware alerts, global hotkeys (future scope)
- Automated code signing / notarization / distribution / GitHub Releases
- Tauri updater plugin setup
- Monaco Editor behavior changes — Monaco already works in packages/ui; CSP is handled by tauri.conf.json
- SSE reconnection logic changes (same behavior as web)
- Worker process management from desktop GUI
- Playwright tests for desktop (web E2E coverage already exists)

## Prerequisites

- EP08 (API UI) T-08-010–T-08-033: `packages/ui/` fully built with all views and hooks ✅
- EP10 (Auth) T-10-005–T-10-009 + EP18 T-18-001–T-18-008: better-auth integration complete ✅
- EP19 (API DB Wiring) T-19-001–T-19-013: all API endpoints wired to real DB ✅
- **Manual**: Rust toolchain + Tauri CLI (`cargo install tauri-cli`) installed on dev machine
- `apps/web/` functional as reference implementation ✅

## Milestones

### M1 — apps/desktop Next.js Scaffold

- Deliverables:
  - `apps/desktop/package.json` — `next`, `@combine/ui`, `@tauri-apps/api`, `@tauri-apps/plugin-notification`, `@tauri-apps/plugin-store` as deps; dev/build scripts
  - `apps/desktop/next.config.ts` — `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`
  - `apps/desktop/tsconfig.json` — extends root `tsconfig.json`
  - `apps/desktop/src/app/globals.css` — re-exports `@combine/ui/src/globals.css`
  - `apps/desktop/src/app/page.tsx` — minimal `'use client'` redirect stub (`router.replace('/dashboard')`)
- Acceptance criteria:
  - `bun install` succeeds with new desktop deps
  - `cd apps/desktop && bunx next build` produces `out/` directory
  - `bun run typecheck` passes (root tsconfig includes apps/desktop)
- Validation:
  ```bash
  bun install
  bun run typecheck
  cd apps/desktop && bunx next build && ls out/index.html
  ```

### M2 — src-tauri Init + Native Plugin Registration

- Deliverables:
  - `apps/desktop/src-tauri/Cargo.toml` — Tauri v2 + `tauri-plugin-notification` + `tauri-plugin-store`
  - `apps/desktop/src-tauri/src/main.rs` — standard Tauri `main()` entrypoint
  - `apps/desktop/src-tauri/src/lib.rs` — `tauri::Builder` with `.plugin(tauri_plugin_notification::init())` + `.plugin(tauri_plugin_store::Builder::default().build())`
  - `apps/desktop/src-tauri/build.rs` — standard Tauri build script
  - `apps/desktop/src-tauri/tauri.conf.json` — window title "Combine Trade", dimensions 1280×800, `distDir: "../out"`, `devUrl: "http://localhost:3000"`, CSP: `default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self' http://localhost:* https://api.*; style-src 'self' 'unsafe-inline'`
  - `apps/desktop/src-tauri/capabilities/default.json` — Tauri v2 capability granting `notification:default` + `store:default` permissions
  - `apps/desktop/src-tauri/icons/` — placeholder icons (32x32, 128x128, icon.icns, icon.ico)
- Acceptance criteria:
  - `cd apps/desktop/src-tauri && cargo check` exits 0
  - `tauri.conf.json` CSP contains `unsafe-eval` in `script-src`
  - `tauri.conf.json` `build.distDir` is `../out`
- Validation:
  ```bash
  cd apps/desktop/src-tauri && cargo check
  cat apps/desktop/src-tauri/tauri.conf.json | python3 -c "import json,sys; c=json.load(sys.stdin); print(c['app']['security']['csp'])"
  ```

### M3 — Platform Adapter (packages/ui)

- Deliverables:
  - `packages/ui/src/platform/index.ts` — `PlatformAdapter` interface export
  - `packages/ui/src/platform/context.tsx` — `PlatformProvider` (detects `__TAURI_INTERNALS__` in `useEffect` → dynamically imports tauri adapter) + `usePlatform()` hook
  - `packages/ui/src/platform/web.ts` — web adapter: `isDesktop: false`; `sendNotification` → Web Notification API; `storeRefreshToken`/`getRefreshToken` → no-op
  - `packages/ui/src/platform/tauri.ts` — tauri adapter: `isDesktop: true`; `sendNotification` → dynamic import `@tauri-apps/plugin-notification`; `storeRefreshToken`/`getRefreshToken` → dynamic import `@tauri-apps/plugin-store`
  - `packages/ui/src/index.ts` — add exports: `PlatformProvider`, `usePlatform`, `type PlatformAdapter`
  - `packages/ui/src/platform/__tests__/platform-adapter.test.ts` — unit tests: web adapter behavior, tauri path gated behind `__TAURI_INTERNALS__`
- Acceptance criteria:
  - `bun run typecheck` passes
  - `bun test packages/ui/src/platform` passes (no Tauri SDK needed — dynamic import is mocked)
  - Web adapter is statically importable without `@tauri-apps/api` being present
- Validation:
  ```bash
  bun run typecheck
  bun test packages/ui/src/platform
  ```

### M4 — Desktop Pages

- Deliverables:
  - `apps/desktop/src/app/layout.tsx` — `'use client'`; wraps children in `ThemeProvider` → `AuthProvider` → `PlatformProvider`
  - `apps/desktop/src/app/(auth)/login/page.tsx` — `'use client'` wrapper around `LoginView`
  - `apps/desktop/src/app/(app)/layout.tsx` — `'use client'`; client-side auth guard: reads zustand auth store, redirects to `/login` if unauthenticated (replaces Next.js Middleware — not supported in static export)
  - `apps/desktop/src/app/(app)/dashboard/page.tsx`
  - `apps/desktop/src/app/(app)/strategies/page.tsx`
  - `apps/desktop/src/app/(app)/strategies/new/page.tsx`
  - `apps/desktop/src/app/(app)/strategies/[[...params]]/page.tsx` — catch-all for strategy detail (reads `params[0]` as `id`); required because `output: 'export'` cannot serve dynamic `[id]` with unknown IDs at build time
  - `apps/desktop/src/app/(app)/events/page.tsx`
  - `apps/desktop/src/app/(app)/orders/page.tsx`
  - `apps/desktop/src/app/(app)/alerts/page.tsx`
  - `apps/desktop/src/app/(app)/risk/page.tsx`
  - `apps/desktop/src/app/(app)/backtest/page.tsx`
  - `apps/desktop/src/app/(app)/settings/page.tsx`
- Acceptance criteria:
  - `cd apps/desktop && bunx next build` succeeds — all routes in `out/`
  - No Server Component hydration errors (`'use client'` on every page file)
  - `out/dashboard/index.html`, `out/strategies/index.html`, `out/strategies/[[...params]]/index.html` exist
  - `bun run typecheck` passes
- Validation:
  ```bash
  bun run typecheck
  cd apps/desktop && bunx next build
  ls apps/desktop/out/dashboard/index.html
  ls apps/desktop/out/strategies/index.html
  ```

### M5 — Build & Dev Workflow

- Deliverables:
  - `apps/desktop/package.json` scripts: `"next:build": "next build"`, `"dev": "tauri dev"`, `"build": "tauri build"`
  - Root `package.json` script: `"dev:desktop": "bun run --cwd apps/desktop dev"`
  - `README.md` — new section: **Desktop setup** (Rust toolchain, Tauri CLI install, `bun run dev:desktop`)
- Acceptance criteria:
  - `bun run typecheck` covers apps/desktop (root tsconfig path)
  - `cd apps/desktop && bun run next:build` → produces `out/`
  - `cd apps/desktop/src-tauri && cargo check` passes
  - README desktop section is accurate
- Validation:
  ```bash
  bun run typecheck
  cd apps/desktop && bun run next:build && ls out/
  cd apps/desktop/src-tauri && cargo check
  ```

## Task candidates

| # | Title | Description | Milestone |
|---|-------|-------------|-----------|
| T-20-001 | scaffold-apps-desktop | `apps/desktop/package.json`, `next.config.ts`, `tsconfig.json`, `globals.css`, `page.tsx` redirect stub | M1 |
| T-20-002 | src-tauri-init | `src-tauri/Cargo.toml` (Tauri v2 + plugins), `main.rs`, `lib.rs` (plugin registration), `build.rs`, `tauri.conf.json` (CSP + distDir), `capabilities/default.json`, placeholder icons | M2 |
| T-20-003 | platform-adapter-core | `packages/ui/src/platform/` — `PlatformAdapter` interface, `PlatformProvider`, `usePlatform()`, web adapter; export from `index.ts`; unit tests | M3 |
| T-20-004 | platform-adapter-tauri | `packages/ui/src/platform/tauri.ts` — dynamic import `@tauri-apps/plugin-notification` + `@tauri-apps/plugin-store`; runtime detection; unit tests | M3 |
| T-20-005 | desktop-root-layout | `apps/desktop` root layout, login page, (app) layout with client-side auth guard | M4 |
| T-20-006 | desktop-pages-core | dashboard, strategies list, strategy detail `[[...params]]`, strategy create pages | M4 |
| T-20-007 | desktop-pages-secondary | events, orders, alerts, risk, backtest, settings pages | M4 |
| T-20-008 | desktop-build-scripts | `apps/desktop` scripts (dev/build/next:build), root `dev:desktop`, README desktop setup section | M5 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Static export + dynamic routes — `[id]` fails without known IDs at build time | High | Use `[[...params]]` catch-all for strategy detail route (T-20-005). Client reads `params[0]` as ID. |
| `__TAURI_INTERNALS__` detection timing — window globals not yet set on server render path | Medium | Gate detection inside `useEffect` (SSR-safe); already specified in ARCHITECTURE.md design |
| Tauri v2 plugin API breaking changes from Tauri v1 patterns | Medium | Use Tauri v2 docs; `@tauri-apps/plugin-*` packages instead of the old `@tauri-apps/api` sub-modules |
| Rust toolchain / Cargo.lock conflicts — Tauri + plugin deps may require specific `rustc` version | Medium | Pin `apps/desktop/src-tauri/rust-toolchain.toml` at MSRV for selected Tauri version |
| `@tauri-apps` dependencies leaking into `apps/web` bundle | Low | Dynamic import gating on `__TAURI_INTERNALS__` prevents inclusion; verify with `next build` on apps/web post T-20-002 |

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | `[[...params]]` catch-all for strategy detail in desktop | `output: 'export'` cannot generate `[id]` pages with unknown IDs at build time; catch-all is static-export safe |
| 2026-03-24 | Platform adapter lives in `packages/ui/`, not `apps/desktop/` | Shared views (e.g., notifications in TopBar) call `usePlatform()`; adapter must be in the shared package |
| 2026-03-24 | Platform detection via `__TAURI_INTERNALS__` in `useEffect` only | SSR-safe pattern; avoids `window` reference during Next.js static generation pass |
| 2026-03-24 | Client-side route guard in `(app)/layout.tsx` replaces Next.js Middleware | `output: 'export'` does not support Middleware; zustand auth store check + `router.replace('/login')` is the equivalent |
| 2026-03-24 | Tauri v2 capabilities model for plugin permissions | Tauri v2 moves from `allowlist` to `capabilities/` JSON; follows current Tauri v2 documentation |

## Progress notes

- 2026-03-24: 에픽 생성. EP00–EP19 모두 완료. `apps/desktop/`이 완전히 미스캐폴딩 상태. `packages/ui/platform/` 미구현. 이 에픽이 데스크탑 앱의 첫 구현 단계.
