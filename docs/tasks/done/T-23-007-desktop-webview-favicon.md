# T-23-007 Desktop WebView Favicon

## Goal
Add the Combine Trade favicon to the desktop app's static-export HTML so the WebView tab/title displays the branded icon.

## Why
The desktop app uses a Next.js static export rendered in a Tauri WebView. Without a favicon, the WebView title bar may show a blank or default icon.

## Inputs
- `docs/assets/logo/favicon.svg` (source SVG)
- `apps/desktop/src/app/layout.tsx` (desktop root layout)
- Desktop app uses `output: 'export'` (static HTML)

## Dependencies
- T-23-001 (icon generation — reuse apple-icon or generate desktop-specific favicon)

## Expected Outputs
- Favicon file in `apps/desktop/public/` or `apps/desktop/src/app/`
- Updated desktop layout metadata

## Deliverables
- Place `icon.svg` (copy of `favicon.svg`) in `apps/desktop/src/app/icon.svg`
  - Next.js Metadata File API works for static export too
- Alternatively place in `apps/desktop/public/favicon.svg` with manual `<link>` in layout
- Verify the favicon appears in the static export output (`out/` directory)

## Constraints
- Must work with `output: 'export'` (static HTML, no server)
- SVG favicon preferred (crisp at all sizes, single file)
- Do not duplicate the generation pipeline — reuse existing source

## Steps
1. RED: Write test that verifies favicon file exists in the desktop app directory
2. GREEN: Place favicon SVG in the correct location for static export
3. Verify `bun run build --filter=@combine/desktop` includes the favicon in output
4. REFACTOR: Ensure no redundant favicon files

## Acceptance Criteria
- Favicon file exists in desktop app source
- Static export (`out/`) includes the favicon
- Build succeeds

## Validation
```bash
test -f apps/desktop/src/app/icon.svg && echo "desktop favicon exists"
bun run build --filter=@combine/desktop
bun run typecheck
```

## Out of Scope
- Dynamic favicon changes (e.g., notification badges)
- Desktop-specific metadata beyond favicon

## Implementation Notes
- Copied `docs/assets/logo/favicon.svg` → `apps/desktop/src/app/icon.svg`
- Next.js Metadata File API auto-discovers `icon.svg` in `src/app/` regardless of client/server layout
- No changes needed to `layout.tsx` — file-based metadata convention works independently
- TDD: RED (3 failing tests) → GREEN (copy file, all pass) → no REFACTOR needed (minimal change)
