# T-23-006 Tauri System Tray Icon Setup

## Goal
Configure the Tauri desktop app to display theme-aware system tray icons using the monochrome tray SVGs from the logo system.

## Why
A system tray icon lets users see the app status at a glance and access quick actions (e.g., kill switch) without opening the main window. The monochrome variants ensure visibility on both light and dark OS menu bars.

## Inputs
- `docs/assets/logo/tray-dark.svg` (for light OS menu bar — dark icon)
- `docs/assets/logo/tray-light.svg` (for dark OS menu bar — light icon)
- `apps/desktop/src-tauri/src/lib.rs` (Tauri app setup)
- `apps/desktop/src-tauri/Cargo.toml` (dependencies)

## Dependencies
- T-23-005 (Tauri app icons must be in place first)

## Expected Outputs
- Tray icon SVGs or PNGs placed in `apps/desktop/src-tauri/icons/`
- Rust code in `lib.rs` (or separate module) configuring the system tray
- `tauri-plugin-tray` or equivalent added to Cargo.toml if needed

## Deliverables
- Copy tray SVGs to `apps/desktop/src-tauri/icons/tray-dark.png` and `tray-light.png` (rasterized at 22×22 for macOS, 32×32 for Windows)
- Add tray icon generation to `scripts/generate-icons.ts`
- Configure Tauri system tray in `lib.rs`:
  - Default tray icon (light variant for dark menu bars)
  - Basic tray menu: "Show Window", separator, "Quit"
- Add `tauri-plugin-tray` or use Tauri v2 built-in tray API

## Constraints
- Tray icons must be monochrome as per macOS HIG and Windows guidelines
- macOS tray icons should be 22×22 (template image style)
- Must not block the main thread during tray setup
- Keep tray menu minimal — just show/quit for now

## Steps
1. RED: Write test that verifies tray icon files exist at correct sizes
2. GREEN: Generate tray PNGs via script, add Rust tray configuration to `lib.rs`
3. Add tray plugin dependency if required by Tauri v2
4. REFACTOR: Clean up Rust code, ensure tray setup is in a separate function

## Acceptance Criteria
- Tray icon PNGs exist in `apps/desktop/src-tauri/icons/`
- Tauri app compiles with tray configuration (`cargo check` in src-tauri/)
- Tray menu includes at minimum "Show Window" and "Quit" items
- Rust code compiles without warnings

## Validation
```bash
file apps/desktop/src-tauri/icons/tray-dark.png apps/desktop/src-tauri/icons/tray-light.png
cd apps/desktop/src-tauri && cargo check 2>&1 | tail -5
bun run typecheck
```

## Out of Scope
- Dynamic tray icon changes based on trading status
- Tray notifications
- Platform-specific tray behavior beyond basic show/quit
