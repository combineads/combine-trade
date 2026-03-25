# T-23-008 Logo UI Component

## Goal
Create a reusable `Logo` React component in `packages/ui` that renders the Combine Trade icon mark SVG inline with dark/light theme support.

## Why
The icon mark is used in multiple places (sidebar header, loading states, about dialog). A shared component ensures consistent rendering and theme adaptation across web and desktop.

## Inputs
- `docs/assets/logo/icon.svg` (transparent), `icon-dark.svg`, `icon-light.svg`
- `packages/ui/src/components/` (existing component directory)
- `packages/ui/src/index.ts` (barrel exports)

## Dependencies
None (uses source SVGs directly, no dependency on generation script)

## Expected Outputs
- `packages/ui/src/components/logo.tsx`
- Exported from `packages/ui/src/index.ts` as `Logo`
- Test file for the component

## Deliverables
- `packages/ui/src/components/logo.tsx`:
  - Props: `variant?: "dark" | "light" | "auto"` (default "auto" — uses current theme)
  - Props: `size?: number` (default 32)
  - Renders the icon SVG inline (not as `<img>` — allows CSS color inheritance)
  - "auto" variant reads from ThemeContext to pick dark/light
- Export `Logo` and `LogoProps` from `packages/ui/src/index.ts`
- Unit test: renders at specified size, applies correct variant colors

## Constraints
- SVG must be inlined (not external file) for theme reactivity
- Component must work in both SSR (Next.js) and CSR (static export) contexts
- Do not use `dangerouslySetInnerHTML` — use JSX SVG elements
- Follow existing component patterns in `packages/ui` (style approach, prop naming)

## Steps
1. RED: Write test for `<Logo />` — renders SVG element, respects size prop, applies correct stroke colors per variant
2. GREEN: Implement `logo.tsx` with inline SVG, theme detection via `useTheme`
3. Export from `index.ts`
4. REFACTOR: Extract SVG paths to constants if needed, ensure consistent prop API

## Acceptance Criteria
- `<Logo size={48} />` renders a 48×48 SVG with the crossing lines icon
- `<Logo variant="dark" />` uses green (#22C55E) and red (#EF4444) strokes on dark bg assumption
- `<Logo variant="light" />` uses appropriate colors for light background
- Component is exported from `@combine/ui`
- Tests pass

## Validation
```bash
bun test --filter=logo
bun run typecheck
bun run lint
```

## Out of Scope
- Lockup (icon + wordmark) — that's T-23-009
- Animation or hover effects
- Favicon generation — this is a runtime UI component only
