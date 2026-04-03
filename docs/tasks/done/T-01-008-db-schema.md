# T-01-008 db/schema.ts — Drizzle ORM schema for base tables

## Goal
Define Drizzle ORM schema definitions for the initial Master and Reference tables (Symbol, SymbolState, CommonCode) in `src/db/schema.ts`, including pgvector extension support. This is the physical database schema that Drizzle uses for both type-safe queries and migration generation.

## Why
The schema file is the single source of truth for database table structure. Drizzle ORM generates migrations from this file and provides type-safe query builders. The base tables (Symbol, SymbolState, CommonCode) must exist before any business logic can run — they hold symbol configuration, FSM state, and all system settings.

## Inputs
- `docs/DATA_MODEL.md` — Symbol, SymbolState, CommonCode entity definitions, relationships, CHECK constraints, indexes
- `docs/ARCHITECTURE.md` — pgvector extension requirement, numeric type for money
- `src/core/types.ts` (T-01-002) — enum string unions for CHECK constraints
- `src/db/pool.ts` (T-01-007) — Drizzle instance type

## Dependencies
T-01-002 (core/types.ts — enum types for CHECK constraints)

## Expected Outputs
- `src/db/schema.ts` — Drizzle pgTable definitions for Symbol, SymbolState, CommonCode
- Migration generation uses this file: `bunx drizzle-kit generate`
- Query builders reference these table definitions

## Deliverables
- `src/db/schema.ts`

## Constraints
- L1 module: imports from `core/types.ts` for enum values only
- All price/monetary columns must be `numeric` type (never float/real/double)
- Composite PK for Symbol: (symbol, exchange)
- Composite PK for CommonCode: (group_code, code)
- UUID PK for SymbolState
- All CHECK constraints from DATA_MODEL.md must be defined
- All indexes from DATA_MODEL.md Physical Design Guide must be included
- Foreign key relationships must match DATA_MODEL.md exactly
- CASCADE policies must match: Symbol→SymbolState = CASCADE

## Steps
1. Import Drizzle schema builders: `pgTable`, `text`, `boolean`, `integer`, `numeric`, `uuid`, `timestamp`, `jsonb`, `uniqueIndex`, `index`, `primaryKey`
2. Define custom pgvector column type (for future Vector table — just the extension enablement)
3. Define `symbol` table:
   - Columns: symbol (text), exchange (text), name (text), base_asset (text), quote_asset (text), is_active (boolean, default true), created_at (timestamptz), updated_at (timestamptz)
   - Primary key: composite (symbol, exchange)
4. Define `symbol_state` table:
   - Columns: id (uuid, PK), symbol (text), exchange (text), fsm_state (text, CHECK), execution_mode (text, CHECK, default 'analysis'), daily_bias (text, nullable), daily_open (numeric, nullable), session_box_high (numeric, nullable), session_box_low (numeric, nullable), losses_today (numeric, default 0), losses_session (integer, default 0), losses_this_1h_5m (integer, default 0), losses_this_1h_1m (integer, default 0), updated_at (timestamptz)
   - FK: (symbol, exchange) → Symbol, CASCADE
   - Unique: (symbol, exchange)
5. Define `common_code` table:
   - Columns: group_code (text), code (text), value (jsonb), description (text, nullable), sort_order (integer, default 0), is_active (boolean, default true), created_at (timestamptz), updated_at (timestamptz)
   - Primary key: composite (group_code, code)
6. Define all indexes from DATA_MODEL.md Physical Design Guide for these tables
7. Export table definitions and inferred types (InferSelectModel, InferInsertModel)
8. Verify `bun run typecheck` passes

## Acceptance Criteria
- Symbol table has composite PK (symbol, exchange)
- SymbolState has UUID PK, FK to Symbol with CASCADE, UNIQUE (symbol, exchange)
- CommonCode has composite PK (group_code, code)
- All monetary columns (daily_open, session_box_high, etc.) use `numeric` type
- All CHECK constraints match DATA_MODEL.md enum values exactly
- SymbolState.fsm_state CHECK includes: IDLE, WATCHING, HAS_POSITION
- SymbolState.execution_mode CHECK includes: analysis, alert, live
- `bun run typecheck` passes
- `bunx drizzle-kit generate` produces valid SQL migration

## Test Scenarios
- Symbol table schema includes composite PK on (symbol, exchange) → verified via Drizzle introspection
- SymbolState FK references Symbol.(symbol, exchange) with CASCADE → schema definition correct
- CommonCode PK is (group_code, code) → verified via schema
- All numeric columns for monetary values use 'numeric' pgType → no float/real/double
- SymbolState has UNIQUE constraint on (symbol, exchange) → prevents duplicate rows
- Exported InferSelectModel types match core/types.ts entity types structurally
- Schema compiles and drizzle-kit can generate migration SQL from it

## Validation
```bash
bun run typecheck
bunx drizzle-kit generate 2>&1 | head -20
bun test --grep "db/schema"
```

## Out of Scope
- Transaction tables (Candle, Signal, Ticket, etc.) — added in their respective epics
- pgvector Vector table — added in EP-04 (vectors)
- Seed data insertion — T-01-012
- Migration execution — T-01-009
