# T-143 Backtest page with trigger form and results

## Goal
Create `BacktestView` — the full backtest page including a strategy selector, date range inputs, a trigger button, and result display area. Wire the view to `apps/web/src/app/(app)/backtest/page.tsx`.

## Why
EP08 — The backtest feature is a core capability for validating strategies before enabling live trading. Without a UI, users cannot trigger backtests or review results. This task connects the result components from T-142 into a cohesive page with a trigger form.

## Inputs
- `packages/ui/src/views/backtest/` (all 5 result components from T-142)
- `packages/ui/src/components/button.tsx` (from T-130)
- `packages/ui/src/components/input.tsx` (from T-130)
- `docs/DESIGN_SYSTEM.md` §7.2 (empty states), §7.1 (loading skeletons)

## Dependencies
- T-142 (backtest result views)

## Expected Outputs
- `packages/ui/src/views/backtest/backtest-view.tsx`
- `apps/web/src/app/(app)/backtest/page.tsx` (wired)
- `packages/ui/__tests__/backtest-page.test.tsx`

## Deliverables

### 1. BacktestView component
```typescript
// packages/ui/src/views/backtest/backtest-view.tsx
interface BacktestParams {
  strategyId: string;
  startDate: string;   // ISO date string YYYY-MM-DD
  endDate: string;
}

interface BacktestViewProps {
  strategies?: Array<{ id: string; name: string; }>;
  onRunBacktest?: (params: BacktestParams) => void;
  isRunning?: boolean;
  result?: BacktestResult | null;    // null = not yet run
  error?: string | null;
}

export interface BacktestResult {
  equityCurve: EquityPoint[];
  drawdown: DrawdownPoint[];
  pnlDistribution: PnlBucket[];
  monthlyReturns: MonthlyReturn[];
  stats: TradeStatsData;
}

export function BacktestView(props: BacktestViewProps)
```

### 2. Form section
- `data-testid="backtest-form"` wrapper
- Strategy selector: `<select data-testid="strategy-selector">` populated from `strategies` prop
- Start date: `<input type="date" data-testid="start-date">`
- End date: `<input type="date" data-testid="end-date">`
- Run button: `<button data-testid="run-backtest-btn">` — disabled when `isRunning` is true

### 3. Results section
- `data-testid="backtest-results"` wrapper — always rendered
- When `result` is null → `data-testid="results-empty"` with "Run a backtest to see results" message
- When `isRunning` is true → `data-testid="results-loading"` skeleton
- When `result` is present → renders `TradeStats`, `EquityCurve`, `DrawdownChart`, `MonthlyHeatmap`, `PnlDistribution`
- When `error` is present → `data-testid="results-error"` with error message text

### 4. apps/web page wiring
```typescript
// apps/web/src/app/(app)/backtest/page.tsx
import { BacktestView } from "@combine/ui";

export default function BacktestPage() {
  return <BacktestView />;
}
```
- The page is a thin wrapper — state management deferred to a later integration task

### 5. Barrel update
- Export `BacktestView`, `BacktestResult` from `packages/ui/src/views/backtest/index.ts`
- Ensure they appear in `packages/ui/src/index.ts`

## Constraints
- `BacktestView` manages no internal async state — all async is prop-driven (parent injects `isRunning`, `result`, `error`)
- The `apps/web` page is a thin static wrapper for now (no API calls wired yet)
- Form date inputs use native `<input type="date">` — no date-picker library
- Disabled state on run button must be visually distinct (opacity or cursor)

## Steps
1. Write failing tests (RED):
   - BacktestView renders form with strategy selector, date inputs, run button
   - BacktestView renders empty results state when result is null
   - BacktestView renders loading state when isRunning is true
   - BacktestView renders result components when result is provided
   - BacktestView renders error message when error is provided
2. Implement `BacktestView` form section (GREEN)
3. Implement results section conditional rendering (GREEN)
4. Wire `apps/web` backtest page (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- `[data-testid="backtest-form"]` renders strategy selector, date inputs, and run button
- `[data-testid="results-empty"]` renders when `result` is null
- `[data-testid="results-loading"]` renders when `isRunning` is true
- `[data-testid="trade-stats"]` renders when a full `result` is provided
- `[data-testid="results-error"]` renders with error text when `error` is provided
- `bun run build` in `apps/web` succeeds with the wired page

## Validation
```bash
bun test packages/ui/__tests__/backtest-page.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- API call wiring from the backtest page (requires API hook integration)
- Backtest progress streaming / SSE updates
- Saving or naming backtest runs
- Comparing multiple backtest runs
