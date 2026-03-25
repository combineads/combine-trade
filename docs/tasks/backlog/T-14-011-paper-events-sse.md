# T-14-011 Paper Trading Events in SSE Stream

## Goal
Publish paper trading state-change events (order filled, position opened/closed, balance updated) to the existing SSE stream so the web and desktop UI receive real-time paper trading updates without polling.

## Why
The paper trading status API provides a snapshot but requires polling for updates. Traders need real-time visibility when a paper order fills, a position opens or closes, or the balance changes. Publishing these events to the existing SSE stream enables the UI to update instantly without repeated API calls, which would add latency and unnecessary load.

## Inputs
- `apps/api/src/routes/sse/` — existing SSE endpoint implementation (T-18-011)
- `packages/shared/event-bus/channels.ts` — existing event channel definitions
- `workers/paper-matcher/src/` — paper order matching engine that produces fill events (T-14-002)
- `packages/shared/db/schema/paper_orders.ts` — paper_orders table (T-14-002)
- `docs/exec-plans/14-paper-trading.md` — EP14 SSE spec

## Dependencies
- T-14-009 (paper trading status/orders/performance API — establishes paper trading data layer)
- T-18-011 (SSE endpoint — provides the SSE infrastructure to extend)

## Expected Outputs
- Updated `packages/shared/event-bus/channels.ts` — adds paper event channel definitions
- `packages/shared/event-bus/paper-events.ts` — paper event type definitions
- Updated `workers/paper-matcher/src/` — publishes paper events to event bus after each match
- Updated `apps/api/src/routes/sse/index.ts` — handles paper event types in SSE stream with user/strategy filtering
- `apps/api/__tests__/routes/sse-paper.test.ts` — test suite

## Deliverables
- New event types published to event bus:
  - `paper_order_filled`: `{ strategyId; userId; orderId; symbol; side; size; price; pnl; filledAt }`
  - `paper_position_opened`: `{ strategyId; userId; symbol; side; size; entryPrice; openedAt }`
  - `paper_position_closed`: `{ strategyId; userId; symbol; side; size; entryPrice; exitPrice; pnl; closedAt }`
  - `paper_balance_updated`: `{ strategyId; userId; available: string; reserved: string; total: string }`
- SSE stream event filtering:
  - Client subscribes with `?strategyId=<uuid>` query param
  - Server sends only events matching the client's userId (from JWT) and strategyId
  - Event type field included in SSE data: `{ type: 'paper_order_filled'; data: {...} }`
- SSE `event:` field set to event type name for client-side `addEventListener` filtering

## Constraints
- User isolation: SSE stream must only deliver events matching the authenticated userId — never leak another user's paper events
- All monetary values in events must be decimal strings, not floats
- Paper events must not be delivered to live trading SSE subscribers (use event type filtering, not separate endpoint)
- Do not create a new SSE endpoint — extend the existing one
- Paper matcher must not block on SSE publish — publish is fire-and-forget

## Steps
1. Write failing tests first (RED):
   - Test: paper_order_filled event published to event bus after paper match
   - Test: paper_position_opened event published when position first opened
   - Test: paper_position_closed event published when position fully closed
   - Test: paper_balance_updated event published after balance change
   - Test: SSE stream delivers paper events to correct userId/strategyId subscriber
   - Test: SSE stream does not deliver paper events to a different user's connection
   - Test: SSE event `type` field matches event type name
   - Test: all monetary values in events are strings
2. Add paper event type definitions to shared event bus (GREEN)
3. Update paper-matcher to publish events after each fill (GREEN)
4. Update SSE handler to filter and forward paper event types (GREEN)
5. Refactor (REFACTOR): extract paper event filtering predicate as a pure function

## Acceptance Criteria
- All four paper event types published correctly by paper-matcher after state changes
- SSE stream delivers events only to the matching userId + strategyId subscriber
- No cross-user event leakage in SSE stream
- All monetary values in SSE payloads are decimal strings
- Existing SSE events (non-paper) unaffected by this change
- `bun test -- --filter "paper-sse"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "paper-sse"
bun run typecheck
bun run lint
```

## Out of Scope
- WebSocket-based real-time updates (SSE only)
- Paper event persistence/replay (events are fire-and-forget)
- UI SSE client integration (EP22)
- Live trading events via SSE (T-18-011)
