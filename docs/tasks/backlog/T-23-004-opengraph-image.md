# T-23-004 Open Graph Image

## Goal
Create a branded Open Graph image (1200×630) for the web app so that shared links display the Combine Trade logo and name in social media previews.

## Why
When users share Combine Trade URLs on Slack, Twitter, or other platforms, the preview card should show professional branding instead of a blank or generic preview.

## Inputs
- `docs/assets/logo/lockup-dark.svg` (full logo + wordmark on dark background)
- `apps/web/src/app/layout.tsx` (root metadata)

## Dependencies
- T-23-001 (icon generation script — reuse sharp setup for rasterization)

## Expected Outputs
- `apps/web/src/app/opengraph-image.png` (1200×630)
- Updated `metadata` in `layout.tsx` with openGraph and twitter card fields

## Deliverables
- Generate `opengraph-image.png` (1200×630) from lockup SVG:
  - Dark background (#0A0A0F)
  - Centered lockup (icon mark + "Combine Trade" wordmark)
  - Sufficient padding for readability at thumbnail size
- Place at `apps/web/src/app/opengraph-image.png` (Next.js auto-discovers)
- Add generation step to `scripts/generate-icons.ts` for the OG image
- Update root `layout.tsx` metadata with `openGraph` and `twitter` fields

## Constraints
- Image must be exactly 1200×630 (standard OG size)
- Text must be readable at typical social media thumbnail size (~300px wide)
- Use the dark lockup variant for consistency with brand
- Commit the generated PNG (not runtime generation)

## Steps
1. RED: Write test that verifies `opengraph-image.png` exists and has correct dimensions (1200×630)
2. GREEN: Add OG image generation to `scripts/generate-icons.ts`, generate the image
3. Update `layout.tsx` metadata with openGraph configuration
4. REFACTOR: Verify the image looks correct at thumbnail size

## Acceptance Criteria
- `apps/web/src/app/opengraph-image.png` exists at 1200×630
- Next.js serves the OG image at `/opengraph-image.png`
- Root layout metadata includes `openGraph` configuration
- Build succeeds

## Validation
```bash
file apps/web/src/app/opengraph-image.png | grep "1200 x 630"
bun run build --filter=@combine/web
bun run typecheck
```

## Out of Scope
- Dynamic per-page OG images
- Twitter-specific separate image (reuse OG image)
- Video previews
