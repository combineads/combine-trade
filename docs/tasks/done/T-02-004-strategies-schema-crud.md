# T-02-004 Create strategies DB schema and CRUD service

## Goal
Define the `strategies` DrizzleORM schema and implement a CRUD service with repository interface pattern.

## Why
EP02-M2 requires strategy persistence. Strategies are stored in DB with code, metadata, and version information. The repository interface must be in `packages/core/strategy/` while the Drizzle implementation lives in workers.

## Inputs
- `db/schema/` — existing schema patterns (candles.ts)
- `packages/core/strategy/index.ts` — placeholder
- EP02 exec plan M2 specification
- ARCHITECTURE.md — packages/core must not import Drizzle

## Dependencies
- T-00-003 (DrizzleORM schemas — done)
- T-00-006 (IoC container — done)

## Expected Outputs
- `db/schema/strategies.ts` — DrizzleORM schema
- `packages/core/strategy/types.ts` — Strategy domain types
- `packages/core/strategy/repository.ts` — StrategyRepository interface
- `packages/core/strategy/service.ts` — StrategyCrudService (uses repository interface)
- `packages/shared/di/tokens.ts` — StrategyRepository token

## Deliverables
- strategies table: id, name, description, code, version, status (draft/active/inactive/archived), features JSON, normalization_config JSON, search_config JSON, created_at, updated_at, deleted_at (soft delete)
- StrategyRepository interface: create, findById, findByName, findActive, update, softDelete
- StrategyCrudService: create (validates features[]), read, update (bumps version), softDelete
- Version management: update creates new record with incremented version, old version preserved

## Constraints
- `packages/core/strategy/` must NOT import Drizzle — use repository interface
- features[] is required on create — reject if empty
- Soft delete only (set deleted_at, never hard delete)
- Version is auto-incremented on update

## Steps
1. Define Strategy type and StrategyStatus enum in types.ts
2. Write failing tests for StrategyCrudService
3. Create strategies DrizzleORM schema
4. Implement StrategyRepository interface
5. Implement StrategyCrudService with validation
6. Add StrategyRepository token to IoC tokens
7. Generate migration

## Acceptance Criteria
- Strategy created with valid features[] succeeds
- Strategy created without features[] is rejected
- Update creates new version, preserves old
- findActive returns only status='active' strategies
- Soft delete sets deleted_at, excluded from normal queries

## Validation
```bash
bun test --filter "strategy-model|strategy-crud"
bun run typecheck
bun run lint
bun run db:generate
```

## Out of Scope
- Code validation (T-02-005)
- Strategy activation/deactivation workflow (T-02-005)
- Drizzle repository implementation (integration test will use in-memory mock)
