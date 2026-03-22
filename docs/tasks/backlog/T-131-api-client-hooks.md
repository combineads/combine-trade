# T-131 Implement API client and React Query hooks

## Goal
Create typed API client and React Query hooks for all API endpoints.

## Why
EP08 M3 — pages need data fetching. React Query provides caching, refetching, and loading states.

## Inputs
- `apps/api/src/routes/` (all route interfaces)
- `apps/web/src/lib/api-client.ts` (from T-129)
- `docs/TECH_STACK.md` (@tanstack/react-query)

## Dependencies
- T-129 (apps/web scaffold)

## Expected Outputs
- Typed API client functions for all endpoints
- React Query hooks for: strategies, events, candles, orders, alerts, risk, execution mode
- SSE hook for real-time data subscription
- Mutation hooks for: create/update strategy, activate/deactivate kill switch, change mode

## Deliverables
- `packages/ui/src/hooks/api/use-strategies.ts`
- `packages/ui/src/hooks/api/use-events.ts`
- `packages/ui/src/hooks/api/use-candles.ts`
- `packages/ui/src/hooks/api/use-orders.ts`
- `packages/ui/src/hooks/api/use-alerts.ts`
- `packages/ui/src/hooks/api/use-risk.ts`
- `packages/ui/src/hooks/api/use-auth.ts`
- `packages/ui/src/hooks/use-sse.ts`
- `packages/ui/src/lib/api-client.ts`
- `packages/ui/__tests__/hooks.test.ts`

## Constraints
- All API calls go through centralized client (not direct fetch)
- React Query for GET operations (automatic cache + refetch)
- useMutation for POST/PUT/DELETE operations
- SSE hook must handle reconnection
- Auth token passed via httpOnly cookie (no manual header)
- Error responses mapped to typed errors

## Steps
1. Write tests for API client functions
2. Implement typed API client (fetch wrapper)
3. Implement React Query hooks per domain
4. Implement SSE subscription hook
5. Implement mutation hooks

## Acceptance Criteria
- All API endpoints have corresponding hooks
- Hooks return typed data matching API response shapes
- Loading/error/success states properly managed
- SSE hook reconnects on disconnect

## Validation
```bash
bun test packages/ui/__tests__/hooks.test.ts
bun run typecheck
```

## Out of Scope
- UI rendering (separate page tasks)
- Authentication flow (login page task)
- Optimistic updates
