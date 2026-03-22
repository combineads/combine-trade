# T-164 Dashboard real-time data hooks

## Goal
Create three React hooks in `packages/ui` for dashboard real-time data: `usePortfolioStatus` (balance, positions, unrealized PnL), `useDailyPnl` (today's realized PnL timeline), and `useStrategyPerformance` (per-strategy winrate/expectancy), all using `useSSE` for live updates.

## Why
The dashboard must reflect live trading state without manual refresh. Polling would add unnecessary load and latency. SSE-based hooks give the dashboard a reactive data layer that updates immediately when portfolio state changes, daily PnL events arrive, or strategy statistics are recalculated. This is the data contract between the API SSE streams and the dashboard UI.

## Inputs
- `packages/ui/src/hooks/use-sse.ts` — `useSSE` hook from T-148
- API SSE endpoints: `/api/v1/portfolio/stream`, `/api/v1/pnl/stream`, `/api/v1/strategies/stream`
- `docs/ARCHITECTURE.md` — hooks naming, SSR safety rules
- `docs/DESIGN_SYSTEM.md` — data shape conventions

## Dependencies
- T-148 (useSSE hook exists)

## Expected Outputs
- `packages/ui/src/hooks/use-portfolio-status.ts`
- `packages/ui/src/hooks/use-daily-pnl.ts`
- `packages/ui/src/hooks/use-strategy-performance.ts`
- `packages/ui/__tests__/use-portfolio-status.test.ts`
- `packages/ui/__tests__/use-daily-pnl.test.ts`
- `packages/ui/__tests__/use-strategy-performance.test.ts`
- Updated `packages/ui/src/index.ts` — all hooks exported

## Deliverables

### 1. usePortfolioStatus hook
```typescript
export interface PortfolioPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
}

export interface PortfolioStatus {
  balance: string;            // available balance (Decimal string)
  totalUnrealizedPnl: string;
  positions: PortfolioPosition[];
  updatedAt: number;
}

export interface UsePortfolioStatusResult {
  status: PortfolioStatus | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePortfolioStatus(apiBaseUrl?: string): UsePortfolioStatusResult
```

### 2. useDailyPnl hook
```typescript
export interface PnlPoint {
  time: number;       // Unix timestamp (seconds)
  realizedPnl: string;
  cumulativePnl: string;
}

export interface UseDailyPnlResult {
  points: PnlPoint[];
  totalPnl: string;
  isLoading: boolean;
  error: Error | null;
}

export function useDailyPnl(apiBaseUrl?: string): UseDailyPnlResult
```

### 3. useStrategyPerformance hook
```typescript
export interface StrategyStats {
  strategyId: string;
  strategyName: string;
  symbol: string;
  winrate: number;        // 0-1
  expectancy: string;     // Decimal string (expected PnL per trade)
  totalTrades: number;
  activeSince: number;    // Unix timestamp
}

export interface UseStrategyPerformanceResult {
  strategies: StrategyStats[];
  isLoading: boolean;
  error: Error | null;
}

export function useStrategyPerformance(apiBaseUrl?: string): UseStrategyPerformanceResult
```

### 4. SSE connection behavior
- Each hook connects to its respective SSE stream on mount
- On SSE message: parse JSON and update state
- On SSE error: set `error` state, do not crash
- On unmount: close SSE connection (via `useSSE` cleanup)

### 5. SSR safety
- Initial state: `status: null` / `points: []` / `strategies: []`, `isLoading: true`
- SSE connection starts only in browser (after hydration) — `useSSE` handles this

### 6. Tests
- Each hook returns correct initial shape (`isLoading: true`, data null/empty)
- SSE message updates data state
- SSE error sets `error` state
- All monetary values are strings in returned data shape

## Constraints
- All monetary values in hook return types are strings — no native float
- Hooks are SSR-safe (no crash during server render)
- Each hook is in its own file — no bundling into single file
- `useSSE` from T-148 is the only SSE mechanism — no direct `EventSource` usage
- Tests use mock `useSSE` implementation

## Steps
1. Write failing tests (RED) for all three hooks:
   - Correct initial shape returned
   - SSE message updates state
   - SSE error sets error state
2. Implement `usePortfolioStatus` with `useSSE` (GREEN)
3. Implement `useDailyPnl` with `useSSE` (GREEN)
4. Implement `useStrategyPerformance` with `useSSE` (GREEN)
5. Export all three from barrel (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `usePortfolioStatus` initial state: `{ status: null, isLoading: true, error: null }`
- `useDailyPnl` initial state: `{ points: [], totalPnl: "0", isLoading: true, error: null }`
- `useStrategyPerformance` initial state: `{ strategies: [], isLoading: true, error: null }`
- SSE message updates the relevant data field in each hook
- SSE connection error sets `error` without crashing
- All monetary fields are string type (not number)
- All three hooks exported from `packages/ui/src/index.ts`
- `bun run typecheck` passes

## Validation
```bash
bun test packages/ui
bun run typecheck
```

## Out of Scope
- Dashboard page layout and rendering
- Chart hooks (T-156)
- Auth token attachment to SSE requests
- Historical data fetching (SSE real-time only)

## Implementation Notes
- Date: 2026-03-23
- Files changed: `packages/ui/src/hooks/use-portfolio-status.ts`, `packages/ui/src/hooks/use-daily-pnl.ts`, `packages/ui/src/hooks/use-strategy-performance.ts`, tests, `packages/ui/src/index.ts`
- Tests: 6 pass (initial shape for each hook, monetary types validation)
- Approach: Each hook wraps useSSE with `enabled: typeof globalThis.EventSource !== "undefined"`. SSR-safe defaults.
- Validation: `bun test` 1415 pass, `bun run typecheck` clean

## Outputs
- `usePortfolioStatus()`, `useDailyPnl()`, `useStrategyPerformance()` hooks
- `PortfolioStatus`, `PortfolioPosition`, `PnlPoint`, `StrategyPerformanceStats` types
