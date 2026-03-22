# T-139 SSR-safe chart container component

## Goal
Create a generic `ChartContainer` wrapper component in `packages/ui/` that handles client-only rendering via the dynamic import pattern required by `lightweight-charts`. SSR renders a skeleton placeholder; the chart library is loaded only on the client.

## Why
`lightweight-charts` accesses the DOM directly and cannot run in a Node.js SSR environment. All candlestick and equity-curve chart views depend on a safe mounting boundary. Without this wrapper, Next.js SSR will throw at build time. This is the foundational component for all chart-based views.

## Inputs
- `packages/ui/src/components/skeleton.tsx` — existing skeleton component (from T-130)
- `docs/DESIGN_SYSTEM.md` §6 (chart specifications, background color `--color-chart-bg`)
- Next.js dynamic import docs — `next/dynamic` with `ssr: false`

## Dependencies
- T-130 (base UI components — skeleton, design tokens)

## Expected Outputs
- `packages/ui/src/components/chart-container.tsx` — ChartContainer component
- `packages/ui/__tests__/chart-container.test.tsx` — unit tests

## Deliverables

### 1. ChartContainer component
```typescript
// packages/ui/src/components/chart-container.tsx
interface ChartContainerProps {
  height?: number;          // default 400
  className?: string;
  children: React.ReactNode;
  loading?: boolean;
}

export function ChartContainer({ height = 400, className, children, loading }: ChartContainerProps)
```
- Wraps children in a `div` with `data-testid="chart-container"` and correct height
- When `loading` is true → renders `<Skeleton>` at same height
- Applies `--color-chart-bg` background via CSS custom property
- Sets `overflow: hidden` and `position: relative`

### 2. ClientOnly guard
```typescript
// packages/ui/src/components/client-only.tsx
export function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode })
```
- Uses `useState` + `useEffect` to flip `mounted` flag after hydration
- Renders `fallback` (or null) on server/pre-hydration, `children` after mount
- Exported alongside ChartContainer for re-use by chart views

### 3. Index export
- Export `ChartContainer` and `ClientOnly` from `packages/ui/src/index.ts`

## Constraints
- No import of `lightweight-charts` in this file — the wrapper must be library-agnostic
- Must pass `bun run build` in `apps/web` without errors (SSR safety is the primary constraint)
- Use CSS custom properties only — no hardcoded hex colors
- Skeleton height must match the container height prop so layout does not shift on hydration

## Steps
1. Write failing tests (RED):
   - SSR renders skeleton (test that `ChartContainer` with `loading` renders `data-testid="skeleton"`)
   - Client renders children (test that children appear after hydration)
   - Exports `ChartContainer` from package index
2. Implement `ClientOnly` guard (GREEN)
3. Implement `ChartContainer` using `ClientOnly` (GREEN)
4. Export from `packages/ui/src/index.ts`
5. Run `bun run typecheck` and `cd apps/web && bun run build` (REFACTOR/validate)

## Acceptance Criteria
- `ChartContainer` with `loading={true}` renders skeleton at the configured height
- `ChartContainer` without `loading` renders its children
- `bun run build` in `apps/web` passes — no SSR errors from chart imports
- Component is exported from `packages/ui` barrel

## Validation
```bash
bun test packages/ui/__tests__/chart-container.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- `lightweight-charts` integration (T-140, T-141)
- Chart toolbar or controls
- Responsive resize observer (can be added in chart-specific views)
