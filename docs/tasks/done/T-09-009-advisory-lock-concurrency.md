# T-09-009 Implement advisory lock for order concurrency control

## Goal
Build PostgreSQL advisory lock service for symbol+direction-level order serialization, preventing concurrent orders for the same symbol.

## Why
EP09 M0 — without concurrency control, simultaneous strategy evaluations for the same symbol can submit duplicate orders, causing double-spend and exceeding position limits.

## Inputs
- `docs/exec-plans/09-risk-management.md` M0 specification
- `docs/ARCHITECTURE.md` (advisory lock design)

## Dependencies
None (foundational concurrency primitive)

## Expected Outputs
- Advisory lock service with acquire/release pattern
- Symbol+direction hash function for lock key

## Deliverables
- `packages/execution/advisory-lock.ts`
- `packages/execution/__tests__/advisory-lock.test.ts`

## Constraints
- PostgreSQL pg_advisory_xact_lock for transaction-scoped locks
- Lock key: hash of (symbol + direction) → 64-bit integer
- Timeout: 5 seconds (fail-fast if lock held too long)
- Lock is automatically released when transaction commits/rolls back
- DB instance injected via constructor (DI)

## Steps
1. Write tests for lock acquisition, timeout, and key generation
2. Implement hashLockKey(symbol, direction) → bigint
3. Implement withAdvisoryLock(db, key, fn) wrapper
4. Handle timeout with lock_timeout setting

## Acceptance Criteria
- Two concurrent calls for same symbol are serialized
- Different symbols can proceed concurrently
- Lock timeout after 5 seconds returns error
- Lock released on transaction commit/rollback

## Validation
```bash
bun test packages/execution/__tests__/advisory-lock.test.ts
bun run typecheck
```

## Out of Scope
- Balance locking (separate concern)
- Distributed locking (single DB assumed)
