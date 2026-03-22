# T-077 Backtest API route

## Goal
Implement `POST /backtest` in `apps/api/src/routes/backtest.ts` that accepts a backtest configuration, runs the backtest engine synchronously (or queues it), and returns the result.

## Why
The UI needs to trigger backtests on demand and display results. Exposing backtest execution as an API endpoint decouples the UI from the backtest engine internals and makes the workflow testable end-to-end through HTTP.

## Inputs
- Backtest engine interface / service from `packages/core/` (or existing backtest implementation)
- DI container wiring in `apps/api/`
- T-073 error helpers (`ApiError`, `ValidationError`, `ok`)

## Dependencies
- T-073

## Expected Outputs
- `apps/api/src/routes/backtest.ts`
  - `POST /backtest` — accepts backtest config body, returns backtest result
  - Request body schema: `strategyId`, `symbol`, `timeframe`, `from` (ISO date), `to` (ISO date), optional `initialBalance`
  - Response: backtest result object (trades, PnL, win rate, drawdown, etc.)
  - Returns 422 for invalid config (missing fields, `from` >= `to`)
  - Returns 404 if strategy not found
  - Returns 500 wrapping engine errors as `BACKTEST_FAILED`
- `apps/api/__tests__/backtest.test.ts`
  - In-memory mock of backtest engine
  - Tests for success, validation errors, strategy-not-found, and engine failure

## Deliverables
- `apps/api/src/routes/backtest.ts`
- `apps/api/__tests__/backtest.test.ts`

## Constraints
- No direct DB access — backtest engine is injected via DI
- Request body must be validated with Elysia type-safe schema
- `from` must be strictly before `to` — otherwise 422
- Engine errors must be caught and re-thrown as `ApiError` (code `BACKTEST_FAILED`, status 500)
- All tests use `bun:test` with a mock engine — no real computation
- If backtest engine is async, the route must `await` it within request scope (no fire-and-forget in this task)

## Steps
1. Identify backtest engine interface (input/output types)
2. Write failing tests (RED):
   - `POST /backtest` with valid config → 200 with result object
   - `POST /backtest` missing `strategyId` → 422
   - `POST /backtest` with `from` equal to `to` → 422
   - `POST /backtest` with `from` after `to` → 422
   - `POST /backtest` with unknown `strategyId` → 404
   - `POST /backtest` where engine throws → 500 with `BACKTEST_FAILED`
3. Implement route handler (GREEN)
4. Refactor: add JSDoc to schema and handler

## Acceptance Criteria
- Valid config returns 200 with backtest result
- All validation rules enforced (missing fields, date order)
- Unknown strategy returns 404
- Engine failure returns 500 with `BACKTEST_FAILED` code
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test apps/api/__tests__/backtest.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Async job queue for long-running backtests
- Backtest result persistence to DB
- Progress streaming / WebSocket updates
- Authentication guard (T-079)
