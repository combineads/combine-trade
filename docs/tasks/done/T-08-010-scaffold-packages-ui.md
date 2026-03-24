# T-08-010 Scaffold packages/ui shared component library

## Goal
Create the `packages/ui/` workspace with Tailwind CSS, shadcn/ui, and the design system CSS custom properties from DESIGN_SYSTEM.md.

## Why
EP08 M3 — foundation for all UI work. Both `apps/web/` and `apps/desktop/` import from `packages/ui/`.

## Inputs
- `docs/DESIGN_SYSTEM.md` (color tokens, typography, spacing)
- `docs/TECH_STACK.md` (React, Tailwind, shadcn/ui, zustand, react-query)
- `docs/ARCHITECTURE.md` (packages/ui structure)

## Dependencies
- None (first UI task)

## Expected Outputs
- `packages/ui/` workspace with package.json, tsconfig.json
- Tailwind CSS config with design tokens
- Global CSS with all custom properties from DESIGN_SYSTEM.md §14
- Theme provider (data-theme attribute, localStorage persistence)
- Base shadcn/ui setup (tailwind.config, components.json)
- Export barrel files

## Deliverables
- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/tailwind.config.ts`
- `packages/ui/src/globals.css` (design tokens from DESIGN_SYSTEM.md §14)
- `packages/ui/src/theme/theme-provider.tsx`
- `packages/ui/src/theme/use-theme.ts`
- `packages/ui/src/index.ts`
- `packages/ui/__tests__/theme-provider.test.tsx`

## Constraints
- Dark theme is default
- CSS custom properties must match DESIGN_SYSTEM.md §14 exactly
- Theme toggle via `data-theme` attribute on `<html>`
- Persist theme choice to localStorage
- OS `prefers-color-scheme` as initial fallback only
- Use workspace protocol for internal deps

## Steps
1. Create package.json with React, Tailwind, shadcn deps
2. Configure tailwind.config.ts with design tokens
3. Write globals.css with all CSS custom properties
4. Implement ThemeProvider + useTheme hook
5. Write tests for theme provider
6. Configure barrel exports

## Acceptance Criteria
- `packages/ui/` builds without errors
- Theme provider correctly toggles dark/light
- CSS custom properties match DESIGN_SYSTEM.md
- Tailwind config maps to design tokens

## Validation
```bash
bun run typecheck
bun test packages/ui/__tests__/theme-provider.test.tsx
```

## Out of Scope
- Individual UI components (separate tasks)
- Page-level views
- Monaco editor integration

## Implementation Notes
- Date: 2026-03-22
- Files changed: `packages/ui/package.json`, `tsconfig.json`, `src/globals.css`, `src/theme/theme-provider.tsx`, `src/theme/use-theme.ts`, `src/index.ts`, `__tests__/theme-provider.test.tsx`
- Tests: 8 tests covering ThemeProvider context, theme default/override, CSS token validation, barrel exports
- Approach: React 19 + CSS custom properties matching DESIGN_SYSTEM.md §14 exactly. ThemeProvider uses `data-theme` attribute + localStorage. Tailwind config deferred to component tasks (Tailwind v4 uses CSS-based config).
- Validation: 8/8 pass, typecheck clean, full suite 1156 pass

## Outputs
- `@combine/ui` workspace package with React 19
- `ThemeProvider` + `useTheme()` hook for dark/light theme management
- `globals.css` with all design tokens from DESIGN_SYSTEM.md
- Barrel exports from `src/index.ts`
