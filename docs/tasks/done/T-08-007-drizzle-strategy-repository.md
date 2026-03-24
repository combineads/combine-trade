# T-08-007 Implement Drizzle strategy repository

## Goal
Create a concrete Drizzle ORM implementation of the StrategyRepository interface, connecting strategy CRUD operations to the PostgreSQL database.

## Why
EP08 M1 — API routes use `StrategyRepository` interface but no concrete implementation exists. Without this, the API server cannot persist or query strategies.

## Inputs
- `packages/core/strategy/repository.ts` (StrategyRepository interface)
- `packages/core/strategy/types.ts` (Strategy, CreateStrategyInput, UpdateStrategyInput types)
- `db/schema/strategies.ts` (Drizzle schema)

## Dependencies
None (foundational repository)

## Expected Outputs
- Concrete `DrizzleStrategyRepository` class implementing all StrategyRepository methods
- Proper mapping between Drizzle schema columns and domain types

## Deliverables
- `packages/core/strategy/drizzle-repository.ts`
- `packages/core/strategy/__tests__/drizzle-repository.test.ts`

## Constraints
- Must implement all StrategyRepository methods: create, findById, findByNameAndVersion, findActive, findAll, update, softDelete, createNewVersion
- findAll/findActive must exclude soft-deleted strategies (deletedAt IS NULL)
- createNewVersion: increment version, copy strategy with new code/config
- Use Drizzle query builder (no raw SQL)
- Repository takes `db` instance as constructor param (DI)

## Steps
1. Write tests for all repository methods using mock Drizzle db
2. Implement DrizzleStrategyRepository class
3. Map between Drizzle row types and Strategy domain types
4. Handle soft delete (set deletedAt instead of actual delete)

## Acceptance Criteria
- All CRUD operations work with correct SQL generation
- Soft delete sets deletedAt, doesn't remove row
- createNewVersion increments version number
- findActive returns only strategies with status != 'deleted' and deletedAt IS NULL

## Validation
```bash
bun test packages/core/strategy/__tests__/drizzle-repository.test.ts
bun run typecheck
```

## Out of Scope
- Database migrations (use existing schema)
- Vector table management (separate concern)
- Strategy sandbox execution

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/core/strategy/drizzle-repository.ts` (new), `packages/core/strategy/__tests__/drizzle-repository.test.ts` (new — 11 tests)
- **Approach**: TDD. Repository uses `StrategyDbDeps` interface for query-level DI (thin layer over Drizzle). `mapRowToStrategy()` converts DB rows to domain types. `createNewVersion` reads existing strategy, merges with input, delegates to create. All JSONB columns cast to domain types via type assertions.
- **Validation**: 11/11 tests pass, typecheck clean.

## Outputs
- `DrizzleStrategyRepository` class implementing `StrategyRepository`
- `StrategyDbDeps` interface for Drizzle query injection
- `StrategyRow` interface matching DB schema shape
- `mapRowToStrategy()` mapping function
