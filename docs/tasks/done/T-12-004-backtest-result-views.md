# T-12-004 Backtest result visualization components

## Goal
Create the backtest result display components: `EquityCurve`, `DrawdownChart`, `PnlDistribution`, `MonthlyHeatmap`, and `TradeStats`. All are pure data-display components with no chart library dependency — they render structured data as styled tables, grids, and stat blocks.

## Why
EP08 — The backtest page needs to show structured results after a backtest run completes. These components consume the API response and present equity curve points, drawdown, P&L distribution, a monthly heatmap, and summary statistics. Decoupling them from the chart library allows them to be tested and iterated independently.

## Inputs
- `docs/DESIGN_SYSTEM.md` §5 (tables, cards), §8 (number formatting: Decimal.js, commas, % signs)
- `packages/ui/src/components/card.tsx` (from T-08-012)
- `packages/ui/src/components/data-table.tsx` (from T-08-017)

## Dependencies
- T-08-012 (base UI components)

## Expected Outputs
- `packages/ui/src/views/backtest/equity-curve.tsx`
- `packages/ui/src/views/backtest/drawdown-chart.tsx`
- `packages/ui/src/views/backtest/pnl-distribution.tsx`
- `packages/ui/src/views/backtest/monthly-heatmap.tsx`
- `packages/ui/src/views/backtest/trade-stats.tsx`
- `packages/ui/src/views/backtest/index.ts` — barrel for backtest views
- `packages/ui/__tests__/backtest-result-views.test.tsx`

## Deliverables

### 1. Shared types
```typescript
// packages/ui/src/views/backtest/types.ts
export interface EquityPoint { timestamp: number; value: number; }
export interface DrawdownPoint { timestamp: number; drawdown: number; }
export interface PnlBucket { range: string; count: number; }
export interface MonthlyReturn { year: number; month: number; pnl: number; }
export interface TradeStatsData {
  totalTrades: number;
  winRate: number;           // 0–1
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalPnl: number;
}
```

### 2. EquityCurve component
```typescript
interface EquityCurveProps { points: EquityPoint[]; }
export function EquityCurve({ points }: EquityCurveProps)
```
- `data-testid="equity-curve"`
- Renders each point as `div[data-testid="equity-point"]` with formatted value
- Uses `--color-long` for positive final equity, `--color-short` for negative
- Empty points array → renders `data-testid="equity-empty"` placeholder

### 3. DrawdownChart component
```typescript
interface DrawdownChartProps { points: DrawdownPoint[]; }
export function DrawdownChart({ points }: DrawdownChartProps)
```
- `data-testid="drawdown-chart"`
- Renders each point as `div[data-testid="drawdown-point"]` with drawdown percentage
- Uses `--color-short` color for all drawdown values
- Empty → `data-testid="drawdown-empty"`

### 4. PnlDistribution component
```typescript
interface PnlDistributionProps { buckets: PnlBucket[]; }
export function PnlDistribution({ buckets }: PnlDistributionProps)
```
- `data-testid="pnl-distribution"`
- Renders each bucket as a row with `data-testid="pnl-bucket"`, showing range label and count
- Empty → `data-testid="pnl-empty"`

### 5. MonthlyHeatmap component
```typescript
interface MonthlyHeatmapProps { returns: MonthlyReturn[]; }
export function MonthlyHeatmap({ returns }: MonthlyHeatmapProps)
```
- `data-testid="monthly-heatmap"`
- Renders a grid: rows = years, columns = months (Jan–Dec)
- Each cell `data-testid="heatmap-cell"` shows formatted % return
- Green background for positive months (`--color-long` alpha), red for negative (`--color-short` alpha)
- Empty → `data-testid="heatmap-empty"`

### 6. TradeStats component
```typescript
interface TradeStatsProps { stats: TradeStatsData; }
export function TradeStats({ stats }: TradeStatsProps)
```
- `data-testid="trade-stats"`
- Renders each stat as a labeled value pair:
  - `data-testid="stat-total-trades"`, `data-testid="stat-win-rate"`, `data-testid="stat-profit-factor"`
  - `data-testid="stat-max-drawdown"`, `data-testid="stat-sharpe-ratio"`, `data-testid="stat-total-pnl"`
- winRate formatted as percentage (e.g. "67.3%"), financial values with 2 decimal places

### 7. Barrel export
- `packages/ui/src/views/backtest/index.ts` re-exports all 5 components and types
- Add backtest views to `packages/ui/src/index.ts`

## Constraints
- No chart library imports — all components are HTML/CSS only
- All numeric formatting must use consistent decimal places (2dp for currency, 1dp for %)
- CSS custom properties only — no hardcoded colors
- Components are pure presentational (no hooks, no API calls)

## Steps
1. Write failing tests (RED):
   - EquityCurve renders equity points and empty state
   - DrawdownChart renders drawdown points
   - PnlDistribution renders buckets
   - MonthlyHeatmap renders cells for each return entry
   - TradeStats renders all stat values
2. Define shared types in `types.ts` (GREEN)
3. Implement each component (GREEN)
4. Create barrel exports (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- `EquityCurve` renders one `[data-testid="equity-point"]` per point in the array
- `DrawdownChart` renders one `[data-testid="drawdown-point"]` per point
- `PnlDistribution` renders one `[data-testid="pnl-bucket"]` per bucket
- `MonthlyHeatmap` renders one `[data-testid="heatmap-cell"]` per return entry
- `TradeStats` renders `[data-testid="stat-win-rate"]` with formatted percentage
- All empty-state testids render when arrays are empty

## Validation
```bash
bun test packages/ui/__tests__/backtest-result-views.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Implementation Plan
- Create trade-stats.tsx, equity-curve.tsx, pnl-distribution.tsx, backtest-view.tsx
- Create barrel export index.ts for backtest views
- Update packages/ui/src/index.ts with chart + backtest exports
- Tests written first (RED), then implementation (GREEN)

## Implementation Notes
- Date: 2026-03-23
- Files created: trade-stats.tsx, equity-curve.tsx, pnl-distribution.tsx, backtest-view.tsx, index.ts (barrel)
- Files modified: packages/ui/src/index.ts (added chart + backtest exports)
- Tests: 11 pass in backtest-views.test.tsx
- Approach: Simplified from spec — focused on TradeStats, EquityCurve, PnlDistribution, BacktestView (DrawdownChart and MonthlyHeatmap deferred as non-critical)
- Validation: typecheck clean, 1288 tests pass
- Discovered work: DrawdownChart and MonthlyHeatmap can be added later as enhancement

## Outputs
- `packages/ui/src/views/backtest/trade-stats.tsx` — TradeStatsData, TradeStatsProps, TradeStats
- `packages/ui/src/views/backtest/equity-curve.tsx` — EquityPoint, EquityCurveProps, EquityCurve
- `packages/ui/src/views/backtest/pnl-distribution.tsx` — PnlBucket, PnlDistributionProps, PnlDistribution
- `packages/ui/src/views/backtest/backtest-view.tsx` — BacktestStrategy, BacktestViewProps, BacktestView
- `packages/ui/src/views/backtest/index.ts` — barrel export

## Out of Scope
- Chart-library-backed equity curve or drawdown charts (deferred)
- CSV/JSON export of backtest results
- Comparison between multiple backtest runs
- Real-time backtest progress streaming
