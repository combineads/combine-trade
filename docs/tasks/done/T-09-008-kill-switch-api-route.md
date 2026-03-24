# T-09-008 Implement kill switch API route

## Goal
Build Elysia API endpoints for manual kill switch activation/deactivation, status query, and audit event history.

## Why
EP09 M1 — users need API endpoints to manually trigger and release the kill switch. This is the primary safety control for the trading system.

## Inputs
- `packages/core/risk/kill-switch.ts` (activate, deactivate, isBlocked functions)
- T-09-006 (KillSwitchDbService for persistence)
- `apps/api/src/lib/errors.ts` (error types)

## Dependencies
- T-09-006 (kill switch DB service)

## Expected Outputs
- `POST /api/v1/risk/kill-switch/activate` — activate kill switch
- `POST /api/v1/risk/kill-switch/deactivate` — deactivate kill switch
- `GET /api/v1/risk/kill-switch/status` — current kill switch states
- `GET /api/v1/risk/kill-switch/events` — audit event history

## Deliverables
- `apps/api/src/routes/kill-switch.ts`
- `apps/api/__tests__/kill-switch.test.ts`

## Constraints
- activate: requires scope (global/exchange/strategy), scopeTarget, trigger reason
- deactivate: requires kill switch state id, financial triggers require acknowledgment
- status: returns all active kill switch states
- events: paginated audit event history
- All endpoints require authentication (auth middleware)
- Route follows existing DI pattern (factory function with deps)

## Steps
1. Write tests for activate, deactivate, status, events endpoints
2. Implement killSwitchRoutes(deps) factory function
3. Wire to kill switch core functions + DB service
4. Add input validation with Elysia schemas

## Acceptance Criteria
- Activate sets kill switch and returns new state
- Deactivate clears kill switch (financial triggers require acknowledgment flag)
- Status returns current active states
- Events returns paginated audit history
- Invalid requests return proper error responses

## Validation
```bash
bun test apps/api/__tests__/kill-switch.test.ts
bun run typecheck
```

## Out of Scope
- Auto-triggers (separate implementation)
- Slack notification integration
- UI components
