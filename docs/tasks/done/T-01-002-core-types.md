# T-01-002 core/types.ts — Entity types, enums, FSM state types

## Goal
Define all entity types, enum types, and FSM state types in `src/core/types.ts` based on DATA_MODEL.md. This is the single source of truth for TypeScript type definitions used across all modules.

## Why
Every module depends on shared type definitions. Without a centralized type file, modules would define ad-hoc types leading to inconsistency. The DATA_MODEL.md defines 13 entities (2M + 1R + 10T) that must be faithfully represented as TypeScript types.

## Inputs
- `docs/DATA_MODEL.md` — MRT entity classification, all entity fields, enum values, CHECK constraints
- `docs/ARCHITECTURE.md` — layer rules (core is L0, zero dependencies)

## Dependencies
T-01-001 (project initialization — TypeScript and Decimal.js must be installed)

## Expected Outputs
- `src/core/types.ts` — all entity types, enum string unions, FSM state types
- Downstream tasks (T-01-003, T-01-005, T-01-008) will import these types

## Deliverables
- `src/core/types.ts`

## Constraints
- L0 module: zero external imports except `Decimal` from `decimal.js`
- All price/size/PnL fields must use `Decimal` type (never `number`)
- Enum types must use string literal unions matching DATA_MODEL.md CHECK constraints exactly
- Entity types must match DATA_MODEL.md field names and nullability
- Use `type` (not `interface`) for entity definitions to maintain consistency
- Timestamps use `Date` type
- UUIDs use `string` type

## Steps
1. Read DATA_MODEL.md and extract all 13 entities with their fields
2. Define string literal union types for all CHECK constraint enums:
   - `FsmState`: 'IDLE' | 'WATCHING' | 'HAS_POSITION'
   - `ExecutionMode`: 'analysis' | 'alert' | 'live'
   - `DailyBias`: 'LONG_ONLY' | 'SHORT_ONLY' | 'NEUTRAL'
   - `Timeframe`: '1D' | '1H' | '5M' | '1M'
   - `VectorTimeframe`: '5M' | '1M'
   - `Direction`: 'LONG' | 'SHORT'
   - `Exchange`: 'binance' | 'okx' | 'bitget' | 'mexc'
   - `DetectionType`: 'SQUEEZE_BREAKOUT' | 'SR_CONFLUENCE' | 'BB4_TOUCH'
   - `SignalType`: 'DOUBLE_B' | 'ONE_B'
   - `KnnDecision`: 'PASS' | 'FAIL' | 'SKIP'
   - `TicketState`: 'INITIAL' | 'TP1_HIT' | 'TP2_HIT' | 'CLOSED'
   - `CloseReason`: 'SL' | 'TP1' | 'TP2' | 'TRAILING' | 'TIME_EXIT' | 'PANIC_CLOSE' | 'MANUAL'
   - `TradeResult`: 'WIN' | 'LOSS' | 'TIME_EXIT'
   - `VectorGrade`: 'A' | 'B' | 'C'
   - `OrderType`: 'ENTRY' | 'SL' | 'TP1' | 'TP2' | 'TRAILING' | 'PYRAMID' | 'PANIC_CLOSE' | 'TIME_EXIT'
   - `OrderStatus`: 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'FAILED'
   - `OrderSide`: 'BUY' | 'SELL'
   - `BlockType`: 'ECONOMIC' | 'FUNDING' | 'MANUAL' | 'MARKET_OPEN'
   - `BacktestRunType`: 'BACKTEST' | 'WFO'
   - `EventType`: string (free-text with conventions, not enumerated)
3. Define entity types for all 13 entities:
   - Master: `Symbol`, `SymbolState`
   - Reference: `CommonCode`
   - Transaction: `TradeBlock`, `Candle`, `WatchSession`, `Signal`, `SignalDetail`, `Vector`, `Ticket`, `Order`, `Backtest`, `EventLog`
4. Define composite key types: `SymbolKey` = `{ symbol: string; exchange: Exchange }`
5. Define CommonCode group type: `CommonCodeGroup` string union for group_code values
6. Export all types
7. Write compile-time type tests using `@ts-expect-error` annotations:
   ```typescript
   // @ts-expect-error — number should not be assignable to Decimal price field
   const bad: Symbol = { ...validSymbol, daily_open: 100 }
   ```
8. Verify with `bun run typecheck`

## Acceptance Criteria
- All 13 entity types from DATA_MODEL.md are defined
- All enum string unions match CHECK constraint values exactly
- All price/size/PnL fields use `Decimal` type
- All nullable fields from DATA_MODEL.md are typed as `T | null`
- No `number` type used for any monetary field
- `bun run typecheck` passes
- File has zero external dependencies except `decimal.js`

## Test Scenarios
- Importing all entity types from `@/core/types` compiles without errors
- Assigning invalid enum value to FsmState type → TypeScript compile error (use `@ts-expect-error` to verify)
- Assigning `number` to a Decimal price field → TypeScript compile error (use `@ts-expect-error` to verify)
- All 19+ enum types are exported and have correct member values
- SymbolKey composite type has both `symbol` and `exchange` fields
- Nullable fields (e.g., SymbolState.daily_bias) accept `null`
- Non-nullable fields reject `null` assignment at type level (use `@ts-expect-error` to verify)

## Validation
```bash
bun run typecheck
bun test --grep "core/types"
```

## Out of Scope
- Decimal.js wrapper functions (T-01-004)
- Interface definitions for adapters (T-01-005)
- Database schema / Drizzle definitions (T-01-008)
- Runtime validation (Zod schemas are in config/schema.ts)
