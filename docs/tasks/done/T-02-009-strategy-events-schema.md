# T-02-009 Create strategy_events schema and event model

## Goal
Define the `strategy_events` table schema and event model for storing strategy evaluation results.

## Why
EP02-M6 requires persisting strategy evaluation outputs. When a strategy condition is met, the event (with features vector) is stored for downstream vectorization and decision making.

## Inputs
- `db/schema/` — existing schema patterns
- `packages/core/strategy/types.ts` — Strategy types from T-02-004
- EP02 exec plan M6 specification
- ARCHITECTURE.md — event bus channels (strategy_event_created)

## Dependencies
- T-02-004 (strategy types)

## Expected Outputs
- `db/schema/strategy-events.ts` — DrizzleORM schema
- `packages/core/strategy/event-types.ts` — StrategyEvent domain types
- `packages/core/strategy/event-repository.ts` — StrategyEventRepository interface
- Updated event bus channels if needed

## Deliverables
- strategy_events table: id, strategy_id, strategy_version, exchange, symbol, timeframe, open_time, features (jsonb), entry_condition, exit_condition, created_at
- StrategyEvent domain type
- StrategyEventRepository interface: insert, findByStrategy, findByRange
- Migration generation

## Constraints
- features stored as JSONB (array of { name, value, normalization })
- Must reference strategies table via strategy_id
- Index on (strategy_id, strategy_version, symbol, timeframe) for vector isolation queries

## Steps
1. Define StrategyEvent type in event-types.ts
2. Write failing tests for event model validation
3. Create strategy_events DrizzleORM schema
4. Define StrategyEventRepository interface
5. Generate migration
6. Test: event creation with valid features

## Acceptance Criteria
- strategy_events table created with correct columns
- Features stored as JSONB
- Index supports vector isolation queries
- StrategyEvent type matches schema
- Migration generates cleanly

## Validation
```bash
bun test --filter "strategy-event"
bun run typecheck
bun run lint
bun run db:generate
```

## Out of Scope
- Strategy worker that writes events (T-02-010)
- Vector engine that reads events (EP03)
