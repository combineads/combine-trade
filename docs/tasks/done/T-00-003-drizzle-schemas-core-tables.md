# T-00-003 Create DrizzleORM schemas for core tables

## Goal
Define DrizzleORM schemas for all core database tables and verify that migration generation produces valid SQL.

## Why
The database schema is the shared data contract for all packages and workers. Defining it early enables all downstream domain work (candle model, strategy model, etc.) to reference stable type-safe schemas.

## Inputs
- `docs/ARCHITECTURE.md` § "Database schema (core tables)" — complete column definitions for all tables
- `docs/TECH_STACK.md` § "DrizzleORM"
- T-00-001 outputs: monorepo structure with `packages/shared/`
- T-00-002 outputs: running PostgreSQL with pgvector

## Dependencies
- T-00-001 (monorepo structure for db/ directory and package resolution)
- T-00-002 (PostgreSQL instance for migration validation)

## Expected Outputs
- `db/schema/candles.ts` — candles table
- `db/schema/strategies.ts` — strategies table (with execution_mode, api_version)
- `db/schema/strategy-events.ts` — strategy_events table
- `db/schema/event-labels.ts` — event_labels table
- `db/schema/decisions.ts` — decisions table (with ci_lower, ci_upper, confidence_tier)
- `db/schema/alerts.ts` — alerts table
- `db/schema/orders.ts` — orders table (with decision_id FK)
- `db/schema/vector-table-registry.ts` — vector_table_registry table
- `db/schema/users.ts` — users table
- `db/schema/exchange-credentials.ts` — exchange_credentials table (encrypted fields)
- `db/schema/funding-rates.ts` — funding_rates table
- `db/schema/trade-journals.ts` — trade_journals table (with snapshots, auto_tags)
- `db/schema/entry-snapshots.ts` — entry_snapshots table
- `db/schema/paper-balances.ts` — paper_balances table
- `db/schema/paper-positions.ts` — paper_positions table
- `db/schema/paper-orders.ts` — paper_orders table
- `db/schema/kill-switch.ts` — kill_switch_state + kill_switch_events tables
- `db/schema/daily-loss-limits.ts` — daily_loss_limits + daily_pnl_tracking tables
- `db/schema/index.ts` — barrel export
- `drizzle.config.ts` — DrizzleKit configuration
- Generated migration files in `db/migrations/`

## Deliverables
- Complete DrizzleORM schema matching ARCHITECTURE.md column definitions
- Working `drizzle.config.ts`
- `bun run db:generate` produces migration files
- `bun run db:migrate` applies migrations to PostgreSQL

## Constraints
- Price/PnL/fee columns use `text` type (exact decimal strings per ARCHITECTURE.md § "Decimal precision boundary")
- Composite primary keys where specified (candles, funding_rates, vector_table_registry)
- Foreign key relationships as specified in ARCHITECTURE.md
- decisions table is append-only (documented in schema comments)
- kill_switch_events is append-only
- Use drizzle-orm/pg-core for all schema definitions
- `postgres` driver (not pg or @neondatabase)

## Steps
1. Install `drizzle-orm`, `drizzle-kit`, `postgres` packages
2. Create `drizzle.config.ts` pointing to `db/schema/` and `db/migrations/`
3. Create schema files for each table group, matching ARCHITECTURE.md exactly
4. Create barrel export `db/schema/index.ts`
5. Add `db:generate` and `db:migrate` scripts to root package.json
6. Run `bun run db:generate` to produce initial migration
7. Run `bun run db:migrate` to apply migration to PostgreSQL
8. Verify all tables exist with correct columns

## Acceptance Criteria
- All tables from ARCHITECTURE.md § "Database schema" are defined
- `bun run db:generate` produces migration files without errors
- `bun run db:migrate` applies migrations successfully
- Schema types are exported and importable by other packages
- Price/PnL columns use text type (not numeric/float)
- Composite PKs match ARCHITECTURE.md

## Validation
```bash
bun run db:generate && bun run db:migrate && bun run typecheck
```

## Out of Scope
- Dynamic vector tables (`vectors_{strategy_id}_v{version}`) — handled in EP03
- Seed data — handled in T-00-010
- Repository interfaces — handled in domain-specific tasks
- Query logic — handled in domain-specific tasks
