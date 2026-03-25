# T-14-009 Paper Trading Status/Orders/Performance API

## Goal
Build API endpoints that expose paper trading state — current balance and positions, paginated order history, and aggregated performance metrics — so the web and desktop UI can display a complete paper trading dashboard.

## Why
The UI needs structured API endpoints to display the current state of paper trading. Without status, orders, and performance endpoints, the UI cannot show traders what their paper portfolio looks like, what trades have been taken, or how the strategy is performing in simulation.

## Inputs
- `packages/shared/db/schema/paper_balances.ts` — paper balance table (T-14-002)
- `packages/shared/db/schema/paper_positions.ts` — paper positions table (T-14-002)
- `packages/shared/db/schema/paper_orders.ts` — paper orders table (T-14-002)
- `apps/api/src/routes/` — Elysia router structure
- `docs/exec-plans/14-paper-trading.md` — EP14 paper trading API spec

## Dependencies
- T-14-002 (paper trading engine — provides the paper_balances, paper_positions, paper_orders schema and data)

## Expected Outputs
- `apps/api/src/routes/paper/status.ts` — status endpoint handler
- `apps/api/src/routes/paper/orders.ts` — orders endpoint handler
- `apps/api/src/routes/paper/performance.ts` — performance endpoint handler
- `apps/api/src/routes/paper/index.ts` — Elysia router grouping all paper routes
- `apps/api/__tests__/routes/paper.test.ts` — test suite
- Updated `apps/api/src/routes/index.ts` — registers paper router

## Deliverables
- `GET /api/v1/paper/:strategyId/status` — current paper trading state:
  - Response: `{ strategyId; balance: { available: string; reserved: string; total: string }; positions: Position[]; mode: 'paper' | 'live'; runId: string }`
  - All monetary values as decimal strings
  - `positions`: `[{ symbol; side; size; entryPrice; unrealizedPnl }]`
- `GET /api/v1/paper/:strategyId/orders` — paginated order history:
  - Query params: `page` (default 1), `limit` (default 20, max 100), `status` (`filled` | `cancelled` | `open`), `symbol`
  - Response: `{ data: PaperOrder[]; total: number; page: number; limit: number }`
  - `PaperOrder`: `{ id; symbol; side; size; price; status; filledAt; pnl }`
- `GET /api/v1/paper/:strategyId/performance` — aggregated performance summary:
  - Response: `{ totalPnl: string; winrate: string; tradeCount: number; sharpe: string; maxDrawdown: string; startBalance: string; currentBalance: string; runId: string }`
  - All monetary values as decimal strings computed with Decimal.js
  - Sharpe ratio computed over all filled orders in current run

## Constraints
- User isolation: strategy must belong to authenticated userId — return 403 otherwise
- All monetary values returned as decimal strings, never native floats
- Sharpe ratio and max drawdown computed with Decimal.js
- `limit` capped at 100 for orders pagination
- Endpoints must return data for the current active run only (not historical runs)

## Steps
1. Write failing tests first (RED):
   - Test: `GET /status` returns balance, positions, and mode for own strategy
   - Test: `GET /status` returns 403 for another user's strategy
   - Test: `GET /orders` returns paginated orders with correct shape
   - Test: `GET /orders` filters by status and symbol correctly
   - Test: `GET /performance` returns correct winrate and totalPnl for known fixtures
   - Test: Sharpe and maxDrawdown computed correctly for known order sequence
   - Test: all monetary fields are strings, not numbers
2. Implement status, orders, performance handlers (GREEN)
3. Register routes in `apps/api/src/routes/paper/index.ts` and mount at `/api/v1/paper`
4. Refactor (REFACTOR): extract Sharpe and drawdown computation into testable pure functions

## Acceptance Criteria
- `GET /status` returns current balance and all open positions
- `GET /orders` correctly paginates and filters order history
- `GET /performance` returns correct PnL, winrate, Sharpe, and drawdown for known fixtures
- All monetary values returned as decimal strings
- User isolation enforced with 403 on cross-user access
- `bun test -- --filter "paper-api"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "paper-api"
bun run typecheck
bun run lint
```

## Out of Scope
- Paper reset API (T-14-010)
- Real-time SSE events for paper state (T-14-011)
- Historical run comparison (T-14-010)
- UI dashboard components (EP22)
