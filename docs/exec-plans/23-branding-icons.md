# EP-23 — Branding & Icon Integration

## Objective

Apply the Combine Trade logo system (`docs/assets/logo/`) to both `apps/web` (Next.js) and `apps/desktop` (Tauri) so that the service presents a consistent, polished brand identity across favicon, app icons, system tray icons, and Open Graph images.

## Scope

- **Web (`apps/web`)**:
  - Next.js Metadata API favicon (`icon.svg`, `apple-icon.png`)
  - Open Graph / Twitter Card image using lockup
  - `manifest.webmanifest` with PWA icons (192px, 512px)
  - Loading / splash branding (optional)

- **Desktop (`apps/desktop`)**:
  - Tauri app icons: replace placeholder PNGs in `src-tauri/icons/` with logo-derived rasters (32, 128, 256, 512, 1024px + `.icns` for macOS, `.ico` for Windows)
  - System tray icon: `tray-dark.svg` / `tray-light.svg` integrated into Tauri tray config
  - HTML `<title>` + favicon for the embedded WebView (static export)

- **Shared**:
  - Build script or generation tool to convert SVG source → required PNG/ICO/ICNS formats
  - Logo components in `packages/ui` for in-app use (sidebar, login screen, about dialog)

## Non-goals

- Redesigning the logo itself (source SVGs are final)
- Animated splash screens
- Marketing / landing page design
- Print-ready assets (CMYK, PDF vector)
- Mobile app icons (iOS/Android — no native mobile app yet)

## Prerequisites

- EP-20 (Desktop App scaffolding) — **done**
- EP-08 (API & UI foundation) — **done**
- Logo source files in `docs/assets/logo/` — **available**

## Milestones

### M1 — Icon generation pipeline

- **Deliverables**:
  - Script (`scripts/generate-icons.ts` or shell) that converts source SVGs to all required raster formats
  - Generated output: `apps/web/src/app/icon.svg`, `apps/web/src/app/apple-icon.png`, `apps/desktop/src-tauri/icons/{32x32,128x128,128x128@2x,icon}.png`, `.icns`, `.ico`
- **Acceptance criteria**:
  - Running the script regenerates all icons from SVG source
  - All output files match expected dimensions and format
- **Validation**:
  ```bash
  bun run generate:icons
  file apps/desktop/src-tauri/icons/*.png apps/desktop/src-tauri/icons/*.icns
  file apps/web/src/app/icon.svg apps/web/src/app/apple-icon.png
  ```

### M2 — Web favicon & metadata

- **Deliverables**:
  - `apps/web/src/app/icon.svg` (favicon via Next.js Metadata File API)
  - `apps/web/src/app/apple-icon.png` (180×180 Apple Touch Icon)
  - `manifest.webmanifest` with 192px and 512px PWA icons
  - Updated `metadata` in root `layout.tsx` with icons config
- **Acceptance criteria**:
  - Browser tab shows the Combine Trade favicon
  - Apple Touch Icon renders correctly on iOS home screen
  - `manifest.webmanifest` validates cleanly
- **Validation**:
  ```bash
  bun run build --filter=@combine/web
  # Manual: open http://localhost:3000, verify favicon in browser tab
  # Manual: check /manifest.webmanifest returns valid JSON
  ```

### M3 — Web Open Graph image

- **Deliverables**:
  - `apps/web/src/app/opengraph-image.png` (1200×630) using lockup
  - `apps/web/src/app/twitter-image.png` or shared OG image
  - Metadata fields for `openGraph` and `twitter` in root layout
- **Acceptance criteria**:
  - Sharing a page URL on Slack/Twitter shows the branded preview card
  - Image includes logo mark + "Combine Trade" text, readable at thumbnail size
- **Validation**:
  ```bash
  file apps/web/src/app/opengraph-image.png
  # Manual: use og-image debugger or Slack preview
  ```

### M4 — Desktop Tauri icons & tray

- **Deliverables**:
  - Replace all `apps/desktop/src-tauri/icons/*.png` with logo-derived rasters
  - Add `.icns` (macOS) and `.ico` (Windows) to icons directory
  - Update `tauri.conf.json` bundle.icon list if needed
  - Configure system tray with `tray-light.svg` / `tray-dark.svg` (theme-aware)
  - Desktop HTML favicon for WebView
- **Acceptance criteria**:
  - `cargo tauri build` produces app bundle with correct icon
  - macOS dock icon shows Combine Trade logo
  - System tray icon visible and theme-appropriate
- **Validation**:
  ```bash
  cd apps/desktop && cargo tauri build --debug 2>&1 | grep -i icon
  file src-tauri/icons/*.icns src-tauri/icons/*.ico
  ```

### M5 — In-app logo components

- **Deliverables**:
  - `packages/ui/components/Logo.tsx` — renders icon mark SVG inline
  - `packages/ui/components/Lockup.tsx` — renders full lockup (icon + wordmark)
  - Both support `variant="dark" | "light"` and size prop
  - Used in sidebar header and login screen of both web and desktop
- **Acceptance criteria**:
  - Logo renders correctly in dark and light themes
  - Lockup text "Combine" is green, "Trade" adapts to theme text color
  - Components are exported from `@combine/ui`
- **Validation**:
  ```bash
  bun run typecheck
  bun run lint
  bun test --filter=Logo
  ```

## Task candidates

| # | Task | Description |
|---|------|-------------|
| T-23-001 | SVG→PNG generation script | Create `scripts/generate-icons.ts` using sharp or resvg to convert source SVGs to all required raster sizes |
| T-23-002 | Web favicon integration | Place `icon.svg` and `apple-icon.png` in Next.js app directory, update metadata |
| T-23-003 | Web manifest & PWA icons | Create `manifest.webmanifest` with 192/512 icons, link from layout |
| T-23-004 | Open Graph image generation | Create 1200×630 OG image from lockup SVG, add to metadata |
| T-23-005 | Tauri app icon replacement | Replace placeholder PNGs with logo-derived rasters, add .icns/.ico |
| T-23-006 | Tauri system tray icon setup | Configure tray with theme-aware SVG icons in Rust tray module |
| T-23-007 | Desktop WebView favicon | Add favicon to desktop static export HTML |
| T-23-008 | Logo UI component | Create `Logo.tsx` with dark/light variants in packages/ui |
| T-23-009 | Lockup UI component | Create `Lockup.tsx` with dark/light variants in packages/ui |
| T-23-010 | Integrate logo into sidebar & login | Use Logo/Lockup components in app sidebar header and login screen |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| SVG→PNG quality loss at small sizes | Blurry favicons | Use `favicon.svg` (already simplified) for 16/32px; only rasterize for Apple/PWA icons |
| Sharp/resvg not available in CI | Icon generation fails in pipeline | Commit generated files; script is for regeneration only, not build-time |
| Tauri `.icns` generation on non-macOS | Cannot build macOS bundle on Linux CI | Use `png2icns` or pre-commit generated `.icns`; document in README |
| System tray icon not visible on some OS themes | Poor UX on certain desktops | Test both light and dark OS themes; tray SVGs already have monochrome variants |

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-25 | Use Next.js Metadata File API (file-based) over manual `<link>` tags | Cleaner, automatic, follows Next.js 14+ conventions |
| 2026-03-25 | Commit generated raster files rather than build-time generation | Faster builds, no runtime dependency on image tools |
| 2026-03-25 | Separate Logo and Lockup as distinct components | Different use cases: Logo for small spaces (sidebar, tray), Lockup for branding (login, about) |
| 2026-03-25 | Reuse simplified `favicon.svg` for very small sizes | Source `icon.svg` has curves that blur at 16px; favicon variant is already optimized |

## Progress notes

- Epic created 2026-03-25
- Logo source files verified: icon (3 variants), lockup (2 variants), favicon, tray (2 variants)
- Current state: web has no favicon/icons; desktop has placeholder Tauri icons
- 2026-03-25: Tasks T-23-001 through T-23-010 generated to backlog
- 2026-03-25: All 10 tasks implemented and moved to done/ — 95 tests, typecheck clean, cargo check clean
