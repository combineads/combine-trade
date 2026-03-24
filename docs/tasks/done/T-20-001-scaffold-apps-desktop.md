# T-20-001 scaffold-apps-desktop

## Goal
Create apps/desktop/ Next.js static-export scaffold (package.json, next.config.ts, tsconfig.json, globals.css, redirect stub page.tsx).

## Why
apps/desktop/ does not exist. This is the foundation for the Tauri-wrapped desktop app.

## Inputs
- apps/web/package.json (reference)
- apps/web/next.config.ts (reference)
- packages/ui/ (shared UI package)

## Dependencies
- T-18-009

## Expected Outputs
apps/desktop/ directory with Next.js static-export config ready; `bunx next build` produces out/

## Deliverables
- `apps/desktop/package.json` — next, @combine/ui, @tauri-apps/api, @tauri-apps/plugin-notification, @tauri-apps/plugin-store; scripts: dev/build/next:build/typecheck
- `apps/desktop/next.config.ts` — output: 'export', trailingSlash: true, images: { unoptimized: true }
- `apps/desktop/tsconfig.json` — extends root tsconfig.json
- `apps/desktop/src/app/globals.css` — re-exports @combine/ui/src/globals.css
- `apps/desktop/src/app/page.tsx` — 'use client'; redirect stub using router.replace('/dashboard')

## Constraints
- Must be static export only (no SSR). All pages must be 'use client'. No Server Components.

## Steps
1. Create apps/desktop/package.json with correct deps
2. Create apps/desktop/next.config.ts with output: 'export'
3. Create apps/desktop/tsconfig.json extending root
4. Create apps/desktop/src/app/globals.css
5. Create apps/desktop/src/app/page.tsx redirect stub
6. Run bun install && bun run typecheck && cd apps/desktop && bunx next build

## Acceptance Criteria
- bun install succeeds with new desktop deps
- cd apps/desktop && bunx next build produces out/index.html
- bun run typecheck passes

## Validation
```bash
bun install
bun run typecheck
cd apps/desktop && bunx next build && ls out/index.html
```

## Out of Scope
Tauri Rust setup (T-20-002), platform adapter (T-20-003), pages (T-20-005 through T-20-007)
