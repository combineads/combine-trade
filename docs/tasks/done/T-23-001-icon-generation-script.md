# T-23-001 SVG→PNG Icon Generation Script

## Goal
Create a script that converts the source SVG logo files in `docs/assets/logo/` to all required raster formats (PNG, ICO, ICNS) for web and desktop apps.

## Why
Both apps need multiple raster sizes (32px, 128px, 256px, 512px, 1024px, 180px Apple Touch, 192px/512px PWA). A single script ensures consistency and reproducibility when regenerating icons.

## Inputs
- `docs/assets/logo/icon-dark.svg` (icon on dark bg)
- `docs/assets/logo/favicon.svg` (simplified 32×32 favicon)
- `docs/assets/logo/lockup-dark.svg`, `lockup-light.svg` (full wordmark)

## Dependencies
None (first task in EP-23)

## Expected Outputs
- `scripts/generate-icons.ts` — runnable with `bun run generate:icons`
- Generated files in `apps/web/src/app/` and `apps/desktop/src-tauri/icons/`
- Package.json script entry `generate:icons`

## Deliverables
- `scripts/generate-icons.ts` using `sharp` (or `@resvg/resvg-js`) to:
  - Convert `icon-dark.svg` → PNG at 32, 128, 256, 512, 1024px
  - Convert `favicon.svg` → `favicon.ico` (multi-size: 16, 32, 48)
  - Generate `.icns` for macOS from 1024px PNG (using `png2icons` or equivalent)
  - Generate Apple Touch Icon (180×180) from icon SVG
  - Generate PWA icons (192×192, 512×512) from icon SVG
- Root `package.json` script: `"generate:icons": "bun scripts/generate-icons.ts"`
- Add `sharp` (or chosen lib) to root devDependencies

## Constraints
- Generated raster files are committed to the repo (not build-time generated)
- Script must work on macOS; document any platform-specific caveats
- Use the simplified `favicon.svg` for sizes ≤ 32px (better clarity)
- Use `icon-dark.svg` (dark background variant) for app icons

## Steps
1. RED: Write test that verifies the script generates all expected output files at correct dimensions
2. GREEN: Implement `scripts/generate-icons.ts` with sharp
3. Add `generate:icons` script to root `package.json`
4. Run the script to generate all raster outputs
5. REFACTOR: Clean up, add error handling for missing source files

## Acceptance Criteria
- `bun run generate:icons` completes without error
- All output PNG files have correct dimensions (verified by `file` command or sharp metadata)
- `.ico` file contains 16, 32, 48px variants
- Apple Touch Icon is 180×180 PNG
- PWA icons are 192×192 and 512×512 PNG

## Validation
```bash
bun run generate:icons
file apps/desktop/src-tauri/icons/32x32.png | grep "32 x 32"
file apps/desktop/src-tauri/icons/128x128.png | grep "128 x 128"
file apps/desktop/src-tauri/icons/128x128@2x.png | grep "256 x 256"
file apps/desktop/src-tauri/icons/icon.png | grep "512 x 512"
bun run typecheck
```

## Out of Scope
- Animated icons
- Platform-specific icon optimization (e.g., Windows tile colors)
- CI/CD integration for auto-generation
