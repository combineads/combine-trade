# T-23-009 Lockup UI Component

## Goal
Create a reusable `Lockup` React component in `packages/ui` that renders the full Combine Trade logo (icon mark + "Combine Trade" wordmark) with dark/light theme support.

## Why
The full lockup is used in branding contexts (login screen, about dialog, splash). A shared component ensures the wordmark styling (green "Combine", theme-colored "Trade") is consistent.

## Inputs
- `docs/assets/logo/lockup-dark.svg`, `lockup-light.svg` (reference design)
- T-23-008 `Logo` component (reuse the icon mark)
- `packages/ui/src/components/` (component directory)

## Dependencies
- T-23-008 (Logo component — Lockup composes it)

## Expected Outputs
- `packages/ui/src/components/lockup.tsx`
- Exported from `packages/ui/src/index.ts` as `Lockup`
- Test file for the component

## Deliverables
- `packages/ui/src/components/lockup.tsx`:
  - Props: `variant?: "dark" | "light" | "auto"` (default "auto")
  - Props: `size?: "sm" | "md" | "lg"` (controls icon + text scaling)
  - Renders: `<Logo />` + `<span>Combine</span><span>Trade</span>` in a horizontal flex layout
  - "Combine" text: `#22C55E` (green, always)
  - "Trade" text: `#E2E8F0` on dark, `#1E293B` on light
  - Font: Inter / Geist Sans / system-ui, weight 600 for "Combine", 400 for "Trade"
- Export `Lockup` and `LockupProps` from `packages/ui/src/index.ts`
- Unit test: renders icon + two text spans, correct colors per variant

## Constraints
- Must compose the `Logo` component (not duplicate SVG)
- Text must be actual DOM text (accessible, selectable), not SVG `<text>`
- Responsive: text should not wrap at any defined size
- Follow existing component patterns in `packages/ui`

## Steps
1. RED: Write test for `<Lockup />` — renders Logo + "Combine" (green) + "Trade" (theme-appropriate)
2. GREEN: Implement `lockup.tsx` composing Logo + styled text spans
3. Export from `index.ts`
4. REFACTOR: Align sizing with design system spacing tokens

## Acceptance Criteria
- `<Lockup />` renders the icon mark + "Combine Trade" text
- "Combine" is always green (#22C55E)
- "Trade" adapts to theme (light text on dark, dark text on light)
- Three size variants work correctly
- Component is exported from `@combine/ui`
- Tests pass

## Validation
```bash
bun test --filter=lockup
bun run typecheck
bun run lint
```

## Out of Scope
- Vertical/stacked lockup layout
- Animated reveal
- Custom color overrides
