# T-007 Implement AOP decorators (@Transactional, @Log)

## Goal
Implement AOP (Aspect-Oriented Programming) decorators in `packages/shared/aop/` for declarative transaction management and structured logging at service boundaries.

## Why
Transaction management and logging are cross-cutting concerns that must be consistent across all services. The `@Transactional` decorator eliminates manual transaction management (an architecture guardrail), and `@Log` provides uniform structured logging at service entry/exit points.

## Inputs
- `docs/ARCHITECTURE.md` § "AOP (Aspect-Oriented Programming)"
- `docs/TECH_STACK.md` § "IoC Container & AOP Decorators" and § "pino"
- T-001 outputs: `packages/shared/aop/` directory, `packages/shared/logger/` (pino)
- T-006 outputs: IoC container for injecting DB transaction context

## Dependencies
- T-001 (monorepo structure, pino logger)
- T-006 (IoC container — @Transactional needs transaction context injection)

## Expected Outputs
- `packages/shared/aop/transactional.ts` — @Transactional decorator
- `packages/shared/aop/log.ts` — @Log decorator
- `packages/shared/aop/types.ts` — TransactionContext type, LogContext type
- `packages/shared/aop/index.ts` — barrel export
- Unit tests for both decorators

## Deliverables
- Working @Transactional decorator that wraps methods in DB transactions
- Working @Log decorator that logs method entry/exit with structured JSON
- Unit tests with mocked dependencies

## Constraints
- @Transactional uses Drizzle transaction API under the hood
- @Log uses pino (from packages/shared/logger/) — structured JSON output
- No manual transaction management allowed in decorated code
- Decorators must work with TypeScript 5 standard decorators (Stage 3)
- @Transactional must handle nested transactions (savepoints or skip-if-in-transaction)
- @Log must not log sensitive data (API keys, passwords)

## Steps
1. Define TransactionContext type (wraps Drizzle transaction)
2. Implement @Transactional decorator:
   - Begin transaction before method execution
   - Commit on success, rollback on error
   - Support nested calls (detect existing transaction context)
3. Define LogContext type (method name, args summary, duration, result/error)
4. Implement @Log decorator:
   - Log method entry with args (sanitized)
   - Log method exit with duration and result summary
   - Log errors with stack trace
5. Write unit tests for @Transactional:
   - Successful method → transaction committed
   - Error thrown → transaction rolled back
   - Nested @Transactional → uses existing transaction
6. Write unit tests for @Log:
   - Method entry/exit logged with structured JSON
   - Error logged with stack trace
   - Sensitive args are not logged
7. Create barrel export

## Acceptance Criteria
- @Transactional wraps methods in DB transactions (commit/rollback)
- @Log produces structured JSON logs via pino
- Nested @Transactional calls handled correctly
- Sensitive data is not logged
- At least 6 test cases across both decorators
- `bun test --filter aop` passes

## Validation
```bash
bun test --filter "aop"
```

## Out of Scope
- Actual service methods using these decorators (domain tasks)
- Performance profiling decorator
- Rate limiting decorator
- Other AOP concerns (caching, retry)

## Implementation Plan
- Files: aop/types.ts, transactional.ts, log.ts, decorators.ts, index.ts, __tests__/aop.test.ts
- Approach: Legacy decorator pattern (Bun 1.2.11 doesn't support Stage 3 method replacement)
- Test strategy: 6 tests — 3 for @Transactional (commit, rollback, nested), 3 for @Log (entry/exit, error, redaction)

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/shared/aop/types.ts, transactional.ts, log.ts, decorators.ts, index.ts, __tests__/aop.test.ts, packages/shared/index.ts
- Tests: 6 passing
- Approach: Used legacy decorator pattern instead of Stage 3 decorators — Bun 1.2.11 does not support Stage 3 method decorator return-value replacement. TransactionContext is abstract interface; Drizzle impl deferred to EP01. @Log redacts SENSITIVE_KEYS set.
- Validation: `bun test --filter aop` → 6/6 pass, lint pass, typecheck pass
- Discovered work: Stage 3 decorator support in Bun may improve in future versions

## Outputs
- `packages/shared/aop/types.ts` — TransactionContext, TransactionProvider, LogEntry types
- `packages/shared/aop/transactional.ts` — @Transactional decorator + TX_CONTEXT symbol
- `packages/shared/aop/log.ts` — @Log decorator with sensitive arg redaction
- `packages/shared/aop/index.ts` — barrel export
