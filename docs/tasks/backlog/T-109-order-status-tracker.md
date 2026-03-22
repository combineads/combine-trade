# T-109 Implement order status tracker

## Goal
Build a service that polls the exchange for order status updates and syncs them to the local database.

## Why
EP06 M4 — after submitting an order, the system needs to track fill status, detect partial fills, and update order records.

## Inputs
- `packages/exchange/types.ts` (ExchangeAdapter.createOrder response, ExchangeOrder)
- `db/schema/orders.ts` (orders table with status field)

## Dependencies
- T-105 (Binance adapter — need fetchOrder or createOrder response)
- T-107 (execution worker — orders get submitted here)

## Expected Outputs
- `OrderStatusTracker` that polls exchange for unfilled orders
- Status transitions: submitted → partially_filled → filled | canceled
- Filled order → emit order_filled event for downstream (journal, PnL tracking)

## Deliverables
- `packages/execution/order-tracker.ts`
- `packages/execution/__tests__/order-tracker.test.ts`

## Constraints
- Poll interval: configurable (default 5 seconds)
- Only poll orders in "submitted" or "partially_filled" status
- Max poll age: 24 hours (orders older than 24h without fill → cancel + warn)
- Exchange API errors → retry next cycle (don't crash)
- All deps injected (exchange adapter, order repository)

## Steps
1. Write tests for status sync logic with mock exchange
2. Implement OrderStatusTracker with poll loop
3. Handle status transitions and emit events
4. Handle stale orders (24h timeout)

## Acceptance Criteria
- Submitted orders polled at configured interval
- Status correctly synced from exchange
- Partial fills tracked with filled quantity
- Stale orders detected and warned
- Exchange errors don't crash the tracker

## Validation
```bash
bun test packages/execution/__tests__/order-tracker.test.ts
bun run typecheck
```

## Out of Scope
- SL/TP order management
- Position-level tracking
- PnL calculation
