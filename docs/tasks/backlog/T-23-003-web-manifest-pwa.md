# T-23-003 Web Manifest & PWA Icons

## Goal
Create a `manifest.webmanifest` for the web app with proper PWA icon entries (192px, 512px) so the app can be installed as a PWA with the Combine Trade branding.

## Why
A web manifest enables PWA installation and ensures the app icon appears correctly on home screens and app launchers.

## Inputs
- Generated PWA icons (192×192, 512×512 PNG) from T-23-001
- `apps/web/src/app/layout.tsx`

## Dependencies
- T-23-001 (icon generation script produces PWA-sized PNGs)

## Expected Outputs
- `apps/web/src/app/manifest.webmanifest` (or `manifest.ts` for dynamic generation)
- PWA icon PNGs in `apps/web/public/icons/` or served via app directory

## Deliverables
- `apps/web/src/app/manifest.ts` or `manifest.webmanifest` with:
  - `name`: "Combine Trade"
  - `short_name`: "CombineTrade"
  - `theme_color`: "#0A0A0F"
  - `background_color`: "#0A0A0F"
  - `display`: "standalone"
  - `icons`: 192×192 and 512×512 entries (purpose: "any maskable")
- Place icon PNGs where they can be served
- Link manifest from root layout metadata

## Constraints
- Follow Next.js Metadata File API for manifest (prefer `manifest.ts` for type safety)
- Icon files must be accessible at the URLs specified in the manifest
- Use dark background color matching the design system

## Steps
1. RED: Write test that fetches `/manifest.webmanifest` and validates JSON schema (name, icons array with correct sizes)
2. GREEN: Create `manifest.ts` in app directory with icon references, place icon PNGs
3. REFACTOR: Ensure all manifest fields are correct per PWA spec

## Acceptance Criteria
- `/manifest.webmanifest` returns valid JSON with correct fields
- Icons array includes 192×192 and 512×512 entries
- Icon files are accessible at their declared URLs
- Build succeeds with manifest included

## Validation
```bash
bun run build --filter=@combine/web
bun run typecheck
```

## Out of Scope
- Service worker for offline support
- Splash screen configuration
- iOS-specific PWA meta tags beyond apple-icon
