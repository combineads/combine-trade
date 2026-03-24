# T-09-024 Pessimistic Balance Locking

## Goal
Implement balance reservation/locking in `packages/core/risk/` so that when an order is placed, the required margin is locked from available balance, preventing concurrent orders from over-committing.

## Why
Without locking, two simultaneous order signals can both read the same available balance, both pass the position-size check, and together commit more capital than available. Pessimistic locking reserves balance at signal time and releases it on order completion/cancellation.

## Inputs
- `packages/core/risk/` — existing risk module
- `packages/core/risk/types.ts` — type definitions
- `packages/core/risk/index.ts` — public exports

## Dependencies
None

## Expected Outputs
- `packages/core/risk/balance-lock.ts` — BalanceLock class
- `packages/core/risk/__tests__/balance-lock.test.ts` — tests including concurrency scenarios
- `packages/core/risk/index.ts` updated to export BalanceLock

## Deliverables
- `BalanceLock` class:
  - `acquire(lockId, amount)` → reserves `amount` from available balance; throws if insufficient
  - `release(lockId)` → releases reservation for `lockId`
  - `available(totalBalance)` → `totalBalance - sum(active reservations)`
  - `lockedAmount(lockId)` → amount locked under this lockId (or 0 if not found)
  - `releaseAll()` → clears all locks (for cleanup/testing)
- Amounts handled as `string` (Decimal.js compatible) — arithmetic done internally with Decimal.js

## Constraints
- In-memory only (no DB)
- Decimal.js for all arithmetic (monetary values)
- packages/core only — no Elysia/CCXT imports

## Steps
1. Write failing tests
2. Implement BalanceLock
3. Export from index.ts
4. Run `bun test` + `bun run typecheck`

## Acceptance Criteria
- acquire() reduces available balance immediately
- Concurrent acquire() calls respect the locked state
- acquire() throws when insufficient available balance
- release() restores the locked amount
- All tests pass

## Validation
```bash
bun test packages/core/risk/__tests__/balance-lock.test.ts
bun run typecheck
```

## Implementation Notes
<!-- filled by implementer -->

## Outputs
<!-- filled by implementer -->
