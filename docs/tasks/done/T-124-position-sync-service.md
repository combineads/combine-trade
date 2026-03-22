# T-124 Implement position sync service

## Goal
Build a service that periodically synchronizes open positions between the exchange and local DB, detecting discrepancies and external positions.

## Why
EP09 M4 — without position sync, the system can lose track of open positions, leading to incorrect exposure calculations and missed risk triggers.

## Inputs
- `packages/exchange/types.ts` (ExchangePosition interface)
- `packages/core/risk/` (risk interfaces)
- `db/schema/orders.ts` (orders table for local position tracking)

## Dependencies
None (uses exchange adapter interface)

## Expected Outputs
- `PositionSyncService` that polls exchange and reconciles with local state
- Discrepancy detection: missing local, missing exchange, quantity mismatch
- External position detection (positions not created by the system)

## Deliverables
- `packages/execution/position-sync.ts`
- `packages/execution/__tests__/position-sync.test.ts`

## Constraints
- Exchange positions fetched via ExchangeAdapter.fetchPositions() (DI)
- Local positions from DB query (DI)
- Reconciliation output: { synced, discrepancies[], externalPositions[] }
- Discrepancy types: "missing_local", "missing_exchange", "quantity_mismatch"
- No automatic correction — report only (human reviews discrepancies)
- All amounts as strings (Decimal.js compatible)

## Steps
1. Write tests for sync scenarios: perfect match, missing local, missing exchange, quantity mismatch, external position
2. Implement PositionSyncService.syncOnce() method
3. Implement reconciliation algorithm
4. Return structured sync report

## Acceptance Criteria
- Perfect match returns empty discrepancies
- Missing local position detected and reported
- Missing exchange position detected and reported
- Quantity mismatch detected with expected vs actual
- External positions (not in system) flagged separately

## Validation
```bash
bun test packages/execution/__tests__/position-sync.test.ts
bun run typecheck
```

## Out of Scope
- Automatic position correction
- Liquidation price tracking (separate task)
- UI for position management
