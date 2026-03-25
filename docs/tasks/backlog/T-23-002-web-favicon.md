# T-23-002 Web Favicon & Apple Touch Icon

## Goal
Place the Combine Trade favicon and Apple Touch Icon in the Next.js `apps/web` app directory using the Metadata File API convention.

## Why
The web app currently has no favicon — browser tabs show a generic icon. Adding proper favicon and Apple Touch Icon establishes brand presence.

## Inputs
- Generated `icon.svg` and `apple-icon.png` from T-23-001
- `docs/assets/logo/favicon.svg` (source)
- `apps/web/src/app/layout.tsx` (root layout with metadata)

## Dependencies
- T-23-001 (icon generation script produces the raster files)

## Expected Outputs
- `apps/web/src/app/icon.svg` — browser favicon
- `apps/web/src/app/apple-icon.png` — 180×180 Apple Touch Icon
- Updated `metadata` export in `apps/web/src/app/layout.tsx`

## Deliverables
- Copy/place `favicon.svg` → `apps/web/src/app/icon.svg`
- Place generated `apple-icon.png` (180×180) → `apps/web/src/app/apple-icon.png`
- Update `layout.tsx` metadata to include `icons` configuration if Next.js file-based convention requires any supplementary config

## Constraints
- Use Next.js 14+ Metadata File API (file-based, not manual `<link>` tags)
- `icon.svg` should be the SVG version for crisp rendering at all sizes
- Do not modify the SVG content — use source files as-is

## Steps
1. RED: Write test that verifies `icon.svg` and `apple-icon.png` exist in the app directory and have correct content type
2. GREEN: Place the icon files in `apps/web/src/app/`
3. Update `layout.tsx` metadata if needed for icons
4. REFACTOR: Verify build output includes the icon files

## Acceptance Criteria
- `apps/web/src/app/icon.svg` exists and is a valid SVG
- `apps/web/src/app/apple-icon.png` exists and is 180×180 PNG
- `bun run build --filter=@combine/web` succeeds
- Next.js automatically serves `/icon.svg` and `/apple-icon.png`

## Validation
```bash
test -f apps/web/src/app/icon.svg && echo "favicon exists"
file apps/web/src/app/apple-icon.png | grep "180 x 180"
bun run build --filter=@combine/web
bun run typecheck
```

## Out of Scope
- PWA manifest (T-23-003)
- Open Graph images (T-23-004)
- Desktop favicon (T-23-007)
