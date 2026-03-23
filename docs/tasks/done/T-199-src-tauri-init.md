# T-199 src-tauri-init

## Goal
Initialize apps/desktop/src-tauri/ with Cargo.toml (Tauri v2), main.rs, lib.rs (plugin registration), tauri.conf.json (CSP + distDir), capabilities/default.json, placeholder icons.

## Why
Without the src-tauri/ Rust project, apps/desktop cannot be run as a Tauri desktop app.

## Inputs
- apps/desktop/ (from T-198)
- Tauri v2 documentation patterns

## Dependencies
- T-198

## Expected Outputs
apps/desktop/src-tauri/ with cargo check passing; tauri.conf.json with unsafe-eval CSP and distDir pointing to ../out

## Deliverables
- `apps/desktop/src-tauri/Cargo.toml` — Tauri v2 + tauri-plugin-notification + tauri-plugin-store
- `apps/desktop/src-tauri/src/main.rs` — standard Tauri main() entrypoint
- `apps/desktop/src-tauri/src/lib.rs` — tauri::Builder with notification + store plugins
- `apps/desktop/src-tauri/build.rs` — standard Tauri build script
- `apps/desktop/src-tauri/tauri.conf.json` — window title "Combine Trade", 1280x800, distDir: "../out", devUrl: "http://localhost:3000", CSP: "default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self' http://localhost:* https://api.*; style-src 'self' 'unsafe-inline'"
- `apps/desktop/src-tauri/capabilities/default.json` — notification:default + store:default permissions
- `apps/desktop/src-tauri/icons/` — placeholder 32x32, 128x128 PNG icons (can be empty/placeholder)

## Constraints
- Must use Tauri v2 patterns (capabilities/ not allowlist). CSP must include unsafe-eval for Monaco/strategy editor. distDir must be ../out to match static export.

## Steps
1. Create src-tauri/Cargo.toml
2. Create src/main.rs and src/lib.rs
3. Create build.rs
4. Create tauri.conf.json with correct CSP and paths
5. Create capabilities/default.json
6. Create placeholder icon files
7. Run cargo check from src-tauri/

## Acceptance Criteria
- cd apps/desktop/src-tauri && cargo check exits 0
- tauri.conf.json contains unsafe-eval in script-src CSP
- tauri.conf.json build.distDir is ../out

## Validation
```bash
cd apps/desktop/src-tauri && cargo check
cat apps/desktop/src-tauri/tauri.conf.json | python3 -c "import json,sys; c=json.load(sys.stdin); print(c['app']['security']['csp'])"
```

## Out of Scope
Platform adapter (T-200), actual Tauri launch (requires Rust toolchain on dev machine)
