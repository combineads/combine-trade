# T-107 Implement execution worker handler

## Goal
Build the execution worker handler that receives decision_completed events, runs risk gate validation, submits orders to the exchange, and tracks order status.

## Why
EP06 M4 — the execution-worker entry point is a stub. This is the core handler logic that bridges decisions → exchange orders.

## Inputs
- `packages/execution/order-builder.ts` (buildOrder, OrderPayload)
- `packages/execution/mode.ts` (ExecutionModeService, requiresOrder)
- `packages/core/risk/gate.ts` (validateOrder)
- `packages/exchange/types.ts` (ExchangeAdapter.createOrder)

## Dependencies
- T-105 (Binance adapter order methods)

## Expected Outputs
- `ExecutionWorkerHandler` class with `handle(eventId, decisionResult)` method
- Order submission flow: check mode → risk gate → build order → submit → track status
- Deduplication via clientOrderId

## Deliverables
- `workers/execution-worker/src/handler.ts`
- `workers/execution-worker/__tests__/handler.test.ts`

## Constraints
- Must check execution mode first — skip if not `requiresOrder(mode)`
- Must run risk gate validation before submitting
- Risk gate rejection → log + skip (no order)
- Exchange order failure → log + save as "rejected"
- Deduplication: check if order with same clientOrderId already exists
- Order status tracking: planned → submitted → (exchange confirms) filled/canceled
- All deps injected via constructor (no direct imports of concrete implementations)

## Steps
1. Write tests with mock deps (exchange adapter, risk gate, mode service, order repo)
2. Implement handler: mode check → dedup check → risk gate → build order → submit → save
3. Handle exchange errors gracefully (log, save as rejected)
4. Track order status transitions

## Acceptance Criteria
- PASS decisions → no order submitted
- Analysis/alert mode → no order submitted
- Risk gate rejection → no order, reason logged
- Duplicate clientOrderId → skip
- Successful order → saved with exchange order ID and "submitted" status
- Exchange error → saved as "rejected" with error message

## Validation
```bash
bun test workers/execution-worker/__tests__/handler.test.ts
bun run typecheck
```

## Out of Scope
- Order status polling (exchange → DB sync)
- Partial fill handling
- SL/TP bracket order submission
- Advisory lock serialization (EP09-M0)

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `workers/execution-worker/src/handler.ts` (new), `workers/execution-worker/__tests__/handler.test.ts` (new — 9 tests)
- **Approach**: TDD. All deps injected via `ExecutionWorkerDeps` interface. Handler follows chain: PASS check → mode check → dedup check → risk gate → build order → submit → save result.
- **Error handling**: Exchange errors caught and saved as "rejected" status. Build errors logged and skipped gracefully.
- **Validation**: 9/9 tests pass, 975 total pass, typecheck clean.

## Outputs
- `ExecutionWorkerHandler` class with `handle(eventId, strategyId, result)` method
- `ExecutionWorkerDeps` interface for dependency injection
