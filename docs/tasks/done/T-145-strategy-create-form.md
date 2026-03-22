# T-145 Strategy creation form

## Goal
Create `StrategyCreateView` — a form for creating a new strategy with name, direction, symbols, and timeframes fields. Wire it to `apps/web/src/app/(app)/strategies/new/page.tsx`.

## Why
EP08 — The strategy list page (T-133) has a "New Strategy" button that navigates to `/strategies/new` but the page stub is empty. Users cannot create strategies without a form. This task provides the full create form using `react-hook-form` for validation.

## Inputs
- `packages/ui/src/views/strategies/strategy-list-view.tsx` (from T-133) — for navigation context
- `packages/ui/src/components/button.tsx`, `input.tsx`, `badge.tsx` (from T-130)
- `docs/DESIGN_SYSTEM.md` §5.1 (buttons), §5.3 (direction badges)
- `apps/web/src/app/(app)/strategies/new/page.tsx` — existing stub

## Dependencies
- T-133 (strategy list page — establishes ExecutionMode type and strategy views structure)

## Expected Outputs
- `packages/ui/src/views/strategies/strategy-create-view.tsx`
- `apps/web/src/app/(app)/strategies/new/page.tsx` (wired)
- `packages/ui/__tests__/strategy-create-form.test.tsx`

## Deliverables

### 1. StrategyCreateView component
```typescript
// packages/ui/src/views/strategies/strategy-create-view.tsx
export type Direction = 'LONG' | 'SHORT' | 'BOTH';

interface StrategyCreateInput {
  name: string;
  direction: Direction;
  symbols: string[];
  timeframes: string[];
}

interface StrategyCreateViewProps {
  onSubmit?: (data: StrategyCreateInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function StrategyCreateView({ onSubmit, onCancel, isSubmitting }: StrategyCreateViewProps)
```
- `data-testid="strategy-create-view"` root element

### 2. Form fields
- Name field: `<input data-testid="strategy-name" type="text" placeholder="Strategy name">`
- Direction selector:
  - Three buttons: "LONG" (`data-testid="direction-long"`), "SHORT" (`data-testid="direction-short"`), "BOTH" (`data-testid="direction-both"`)
  - Selected direction button uses `primary` style, others use `secondary`
- Symbols input: `<input data-testid="symbols-input" placeholder="BTC/USDT, ETH/USDT">` (comma-separated)
- Timeframes checkboxes: one `<input type="checkbox">` per timeframe with `data-testid="timeframe-{tf}"` for `1m 3m 5m 15m 1h 4h 1d`

### 3. Form actions
- Submit button: `<button data-testid="submit-btn" type="submit">Create Strategy</button>` — disabled when `isSubmitting`
- Cancel button: `<button data-testid="cancel-btn" type="button">Cancel</button>` — calls `onCancel`

### 4. Form validation (react-hook-form)
- Name: required, min 2 chars, max 64 chars
- Direction: required (one of LONG/SHORT/BOTH)
- Symbols: at least one symbol required
- Timeframes: at least one timeframe required
- Validation errors shown as `<span data-testid="error-{field}">` below each field

### 5. apps/web page wiring
```typescript
// apps/web/src/app/(app)/strategies/new/page.tsx
"use client";
import { StrategyCreateView } from "@combine/ui";

export default function NewStrategyPage() {
  return <StrategyCreateView />;
}
```

### 6. Barrel update
- Export `StrategyCreateView`, `Direction`, `StrategyCreateInput` from strategy views
- Add to `packages/ui/src/index.ts`

## Constraints
- Use `react-hook-form` for form state and validation (already in packages/ui dependencies per T-133)
- Direction selection uses button group (not a `<select>`) per design system
- Symbols input accepts comma-separated text and splits on submit — no tag-input library
- Timeframe checkboxes use native `<input type="checkbox">` — no custom component
- Form does not call any API directly — calls `onSubmit` prop with validated data

## Steps
1. Write failing tests (RED):
   - StrategyCreateView renders name input, direction buttons, symbols input, timeframe checkboxes
   - Renders submit and cancel buttons
   - Clicking a direction button marks it as active
   - Submit button is disabled when isSubmitting is true
2. Implement form layout with all fields (GREEN)
3. Implement direction button toggle state (GREEN)
4. Integrate react-hook-form validation (GREEN)
5. Wire apps/web new strategy page (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `[data-testid="strategy-name"]` input renders
- `[data-testid="direction-long"]`, `[data-testid="direction-short"]`, `[data-testid="direction-both"]` buttons render
- All 7 timeframe checkboxes render with correct testids
- `[data-testid="submit-btn"]` is disabled when `isSubmitting` is true
- Clicking `[data-testid="cancel-btn"]` calls `onCancel`
- `bun run build` in `apps/web` succeeds

## Validation
```bash
bun test packages/ui/__tests__/strategy-create-form.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- API call wiring (submit sends to API — deferred to integration task)
- Strategy edit form (update operation)
- Version management on create
- Code editor for strategy logic (T-134)
