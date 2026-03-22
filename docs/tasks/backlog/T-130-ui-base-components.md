# T-130 Implement base UI components (Button, Badge, Card, Table, Input)

## Goal
Create the core reusable UI components in `packages/ui/` following the design system.

## Why
EP08 M3 — all pages need these foundational components. Must match DESIGN_SYSTEM.md specifications.

## Inputs
- `docs/DESIGN_SYSTEM.md` §5 (components: buttons, badges, cards, tables, inputs)
- `packages/ui/` (from T-128)

## Dependencies
- T-128 (packages/ui scaffold)

## Expected Outputs
- Button component (Primary, Secondary, Tertiary, Danger variants)
- StatusBadge component (active, stopped, warning, draft)
- DirectionBadge component (LONG, SHORT, PASS)
- Card component (default, active, paused, draft, error, kill-switch states)
- DataTable component (sortable columns, mono numbers, alternating rows)
- Input component (text, number with focus/error states)
- Loading skeleton components

## Deliverables
- `packages/ui/src/components/button.tsx`
- `packages/ui/src/components/badge.tsx`
- `packages/ui/src/components/card.tsx`
- `packages/ui/src/components/data-table.tsx`
- `packages/ui/src/components/input.tsx`
- `packages/ui/src/components/skeleton.tsx`
- `packages/ui/__tests__/components.test.tsx`

## Constraints
- All components use CSS custom properties (not hardcoded colors)
- Button variants match DESIGN_SYSTEM.md §5.1 exactly
- Badge alpha backgrounds per §5.2 and §5.3
- Card states per §5.4
- Table styling per §5.5 (mono right-aligned numbers)
- All financial figures must use mono font

## Steps
1. Write tests for component variants and states
2. Implement Button with all variants
3. Implement StatusBadge and DirectionBadge
4. Implement Card with state variants
5. Implement DataTable with sorting
6. Implement Input with states
7. Implement Skeleton loaders

## Acceptance Criteria
- All component variants render correctly
- Components use design tokens (CSS custom properties)
- Theme switching changes component appearance
- DataTable supports sorting and mono number columns

## Validation
```bash
bun test packages/ui/__tests__/components.test.tsx
bun run typecheck
```

## Out of Scope
- Chart components (separate task)
- Monaco editor
- Form integration (react-hook-form)
