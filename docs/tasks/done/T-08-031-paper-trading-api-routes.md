# T-08-031 Paper trading API routes

## Goal
Create five paper trading API endpoints: status (balance/positions/PnL), paginated orders, period performance summaries, backtest-vs-paper comparison, and balance reset.

## Why
Paper trading is a sandboxed simulation layer that lets traders validate strategies without real capital. The frontend needs HTTP endpoints to display live paper trading state, review simulated order history, compare paper results against backtests, and reset the sandbox when needed.

## Inputs
- `packages/core/src/paper/` — paper trading types and state definitions
- `apps/api/src/server.ts` — route mounting pattern from T-08-028
- `docs/ARCHITECTURE.md` — API route conventions
- `docs/PRODUCT.md` — paper trading feature description

## Dependencies
- T-08-028 (route mounting infrastructure in place)

## Expected Outputs
- `apps/api/src/routes/paper.ts` — route factory `createPaperRoute(deps)`
- `apps/api/__tests__/paper.test.ts` — tests for all 5 endpoints
- Updated `apps/api/src/server.ts` — `PaperRouteDeps` added, route mounted
- Updated `apps/api/src/index.ts` — stub deps wired

## Deliverables

### 1. Route definitions
```typescript
// GET /api/v1/paper/status
// Response: { balance: string, positions: PaperPosition[], unrealizedPnl: string, totalPnl: string }

// GET /api/v1/paper/orders
// Query: page, pageSize
// Response: { data: PaperOrder[], total: number, page: number, pageSize: number }

// GET /api/v1/paper/performance
// Query: period ('day' | 'week' | 'month' | 'all')
// Response: { summaries: PeriodSummary[] }

// GET /api/v1/paper/comparison
// Query: strategyId, symbol
// Response: { backtest: BacktestSummary, paper: PaperSummary, delta: ComparisonDelta }

// POST /api/v1/paper/reset
// Body: { initialBalance: string }
// Response: { success: true, balance: string }
```

### 2. PaperRouteDeps interface
```typescript
export interface PaperRouteDeps {
  getPaperStatus(): Promise<PaperStatus>;
  listPaperOrders(query: PaperOrderQuery): Promise<{ data: PaperOrder[]; total: number }>;
  getPaperPerformance(period: PaperPeriod): Promise<{ summaries: PeriodSummary[] }>;
  getPaperComparison(strategyId: string, symbol: string): Promise<PaperComparison>;
  resetPaper(initialBalance: string): Promise<{ success: true; balance: string }>;
}
```

### 3. Monetary value rules
- All balance and PnL values are strings (Decimal.js serialized) — never native float
- `initialBalance` in reset body validated as numeric string

### 4. Tests
- Status returns balance + positions + PnL with correct shape
- Orders list returns paginated shape
- Performance returns period summaries array
- Comparison returns backtest + paper + delta objects
- Reset returns `{ success: true, balance }` and validates body

## Constraints
- All monetary values transmitted as decimal strings — no native float in response JSON
- `POST /api/v1/paper/reset` requires `initialBalance` in body (validated)
- Pagination: default `page=1`, `pageSize=20`, max `pageSize=100`
- Route handlers delegate fully to `PaperRouteDeps` — no business logic in handlers
- Tests use stub deps — no real execution engine calls

## Steps
1. Write failing tests (RED):
   - Status returns correct shape
   - Orders list is paginated
   - Performance varies by period param
   - Comparison returns three sub-objects
   - Reset validates body and returns balance
2. Create `PaperRouteDeps` interface and `createPaperRoute()` factory (GREEN)
3. Implement all 5 route handlers (GREEN)
4. Add to `ApiServerDeps` and mount in `createApiServer()` (GREEN)
5. Wire stub deps in `apps/api/src/index.ts` (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `GET /api/v1/paper/status` returns `{ balance, positions, unrealizedPnl, totalPnl }` with string monetary values
- `GET /api/v1/paper/orders` returns paginated order list
- `GET /api/v1/paper/performance` returns period summaries
- `GET /api/v1/paper/comparison` returns `{ backtest, paper, delta }`
- `POST /api/v1/paper/reset` with valid body returns `{ success: true, balance }`
- `POST /api/v1/paper/reset` without `initialBalance` returns validation error
- `bun run typecheck` passes

## Validation
```bash
bun test apps/api
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-23
- Files: `apps/api/src/routes/paper.ts`, `apps/api/__tests__/paper.test.ts`, server + index updated
- Tests: 5 paper route tests; Validation: 1373 pass, 0 fail

## Outputs
- `PaperRouteDeps` interface, 5 endpoints at `/api/v1/paper/*`

## Out of Scope
- Real paper trading execution engine (T-14-006)
- Auth middleware (T-08-029 handles globally)
- Paper trading SSE events
