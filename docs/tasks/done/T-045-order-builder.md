# T-045 Order builder

## Goal
Implement pure functions that build validated exchange order payloads from a decision result and execution context. Produces a market entry order with OCO SL/TP orders, a deterministic `client_order_id` for idempotency, and pre-submission validation (symbol format, notional cap, direction sanity).

## Why
Order construction is complex and must be free of side effects so it can be unit-tested exhaustively without touching any exchange. Separating building from execution means the executor can call build → validate → submit in a clean pipeline, and the builder can be reused across execution modes (live, paper) and tested independently of exchange connectivity.

## Inputs
- T-044 `ExecutionMode`, `requiresOrder` from `packages/execution/mode.ts`
- T-044 `packages/execution/types.ts`
- `DecisionResult` from `@combine/core/decision`
- Order context supplied by the caller:
  - `strategyId: string`
  - `eventId: string`
  - `symbol: string` (e.g. `"BTC/USDT"`)
  - `direction: "LONG" | "SHORT"`
  - `entryPrice: string` (Decimal.js string, market price at decision time)
  - `tpPct: number` (take-profit percentage, e.g. `0.02` for 2%)
  - `tpPct: number` (stop-loss percentage, e.g. `0.01` for 1%)
  - `notionalUsd: string` (Decimal.js string, intended notional in USD)
- EP06 M3 spec (order builder, client_order_id, pre-validation, notional cap)

## Dependencies
- T-044 (ExecutionMode type and requiresOrder helper)

## Expected Outputs
- `packages/execution/order-builder.ts`
  - `buildOrder(ctx: OrderContext): OrderPayload` — builds the full order payload; throws `OrderValidationError` on invalid input
  - `generateClientOrderId(strategyId: string, eventId: string, ts: number): string` — format: `ct-{strategyId}-{eventId}-{ts}`
  - `validateOrderContext(ctx: OrderContext): void` — throws `OrderValidationError` with a descriptive message on failure
  - `OrderContext` interface
  - `OrderPayload` interface: `{ clientOrderId: string; symbol: string; side: "buy" | "sell"; type: "market"; notionalUsd: string; tp: string; sl: string; tpSide: "sell" | "buy"; slSide: "sell" | "buy" }`
  - `OrderValidationError` class extending `Error`
- `packages/execution/__tests__/order-builder.test.ts`

## Deliverables
- `packages/execution/order-builder.ts`
- `packages/execution/__tests__/order-builder.test.ts`
- Updated `packages/execution/index.ts` with new exports
- Updated `packages/execution/types.ts` with `OrderContext`, `OrderPayload`, `OrderValidationError`

## Constraints
- Pure functions only — no network calls, no DB access, no filesystem access
- `generateClientOrderId` format is exactly `ct-{strategyId}-{eventId}-{ts}` — no deviations; callers supply `ts` (milliseconds since epoch) so the function remains pure and deterministic in tests
- Notional cap default: `$1000` USD; configurable via `OrderContext.notionalCapUsd?: string` (Decimal.js string); if not provided, default `"1000"` is used
- `notionalUsd > notionalCapUsd` → throw `OrderValidationError` with message including the cap value
- Symbol must match `/^[A-Z]+\/[A-Z]+$/` — throw on mismatch
- Direction `"LONG"` → `side: "buy"`, `tpSide: "sell"`, `slSide: "sell"`; Direction `"SHORT"` → `side: "sell"`, `tpSide: "buy"`, `slSide: "buy"`
- TP and SL prices computed from `entryPrice` using `tpPct` / `slPct`: LONG TP = `entry * (1 + tpPct)`, LONG SL = `entry * (1 - slPct)`, SHORT TP = `entry * (1 - tpPct)`, SHORT SL = `entry * (1 + slPct)`
- All price/notional arithmetic must use `Decimal.js` — no native float arithmetic on monetary values
- `packages/execution` must not import Elysia, Drizzle, or CCXT

## Steps
1. Add `OrderContext`, `OrderPayload`, `OrderValidationError` to `packages/execution/types.ts`
2. Write failing tests in `packages/execution/__tests__/order-builder.test.ts` (RED):
   - `generateClientOrderId("strat1", "evt1", 1700000000000)` → `"ct-strat1-evt1-1700000000000"`
   - LONG context → `side: "buy"`, `tpSide: "sell"`, `slSide: "sell"`
   - SHORT context → `side: "sell"`, `tpSide: "buy"`, `slSide: "buy"`
   - LONG entry `"50000"`, tpPct `0.02` → tp `"51000.00"`, slPct `0.01` → sl `"49500.00"`
   - SHORT entry `"50000"`, tpPct `0.02` → tp `"49000.00"`, slPct `0.01` → sl `"50500.00"`
   - notional `"1500"` with default cap → throws `OrderValidationError`
   - notional `"800"` with cap `"1000"` → succeeds
   - invalid symbol `"BTCUSDT"` (no slash) → throws `OrderValidationError`
   - empty `strategyId` → throws `OrderValidationError`
   - `buildOrder` result contains `clientOrderId` matching `ct-{strategyId}-{eventId}-{ts}` pattern
   - `OrderValidationError` is instance of `Error`
3. Implement `packages/execution/order-builder.ts` (GREEN)
4. Update `packages/execution/index.ts` barrel export
5. Refactor: add JSDoc to `buildOrder`, `validateOrderContext`, `generateClientOrderId`

## Acceptance Criteria
- All 11 tests pass
- `generateClientOrderId` always produces the exact format `ct-{strategyId}-{eventId}-{ts}`
- LONG/SHORT side and TP/SL sides are correctly mirrored
- TP and SL prices match Decimal.js computation — not native float
- Notional exceeding cap throws `OrderValidationError` with cap value in message
- Invalid symbol format throws `OrderValidationError`
- `buildOrder` is deterministic: same inputs always produce identical output
- Zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test packages/execution/__tests__/order-builder.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Exchange submission (executor, separate task)
- Limit order support (future epic)
- Partial fill handling (future task per EP06 M3)
- Order status polling
- Position sizing beyond the notional cap
