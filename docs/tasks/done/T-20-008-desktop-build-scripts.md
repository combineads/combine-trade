# T-20-008 desktop-build-scripts

## Goal
Wire dev/build scripts for desktop app in root package.json and update README with desktop setup instructions.

## Why
Developers need a single command (bun run dev:desktop) to start the desktop app. README must document Rust toolchain + Tauri CLI prerequisites.

## Inputs
- Root package.json
- apps/desktop/package.json (from T-20-001)
- README.md

## Dependencies
- T-20-006
- T-20-007

## Expected Outputs
Root package.json has dev:desktop script; README has Desktop Setup section; all typecheck + next build still pass

## Deliverables
- Root `package.json` — add "dev:desktop": "bun run --cwd apps/desktop dev"
- Root `README.md` — add ## Desktop Setup section: Rust toolchain install (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh), cargo install tauri-cli, bun run dev:desktop

## Constraints
- Do not break existing root scripts. README section must be accurate and concise.

## Steps
1. Add dev:desktop script to root package.json
2. Add Desktop Setup section to README.md
3. Run typecheck and next build to verify nothing broken

## Acceptance Criteria
- bun run typecheck passes
- cd apps/desktop && bun run next:build produces out/
- cd apps/desktop/src-tauri && cargo check passes
- README has Desktop Setup section

## Validation
```bash
bun run typecheck
cd apps/desktop && bun run next:build && ls out/
cd apps/desktop/src-tauri && cargo check
```

## Out of Scope
Code signing, notarization, CI/CD for desktop
