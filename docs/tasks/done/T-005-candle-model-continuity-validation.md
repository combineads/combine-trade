# T-005 Implement candle model with continuity validation

## Goal
Create the candle domain model in `packages/candle/` with TypeScript types, continuity validation (gap detection), and a repository interface for candle CRUD operations.

## Why
Candle data is the primary input for the entire pipeline. Every strategy evaluation starts with candle data. Continuity validation is a critical invariant — candle gaps can cause incorrect strategy signals and must be detected immediately.

## Inputs
- `docs/ARCHITECTURE.md` § "candles" table schema
- `docs/ARCHITECTURE.md` § "packages/candle" description
- `docs/ARCHITECTURE.md` § "Critical invariants" — #3: All candles must pass continuity validation
- T-001 outputs: `packages/candle/` directory
- T-003 outputs: DrizzleORM candle schema

## Dependencies
- T-001 (monorepo structure)
- T-003 (candle DB schema for type alignment)

## Expected Outputs
- `packages/candle/types.ts` — Candle type, Timeframe enum, CandleKey type
- `packages/candle/validation.ts` — continuity validation function (gap detection)
- `packages/candle/repository.ts` — CandleRepository interface (insert, findByRange, findLatest)
- `packages/candle/index.ts` — barrel export
- Unit tests for continuity validation

## Deliverables
- Candle domain model with typed interfaces
- Continuity validation that detects gaps in candle sequences
- Repository interface (implementation deferred to EP01)
- Unit tests for gap detection

## Constraints
- packages/candle must not import Drizzle directly (repository is an interface, not implementation)
- Candle prices are `string` type (decimal strings per ARCHITECTURE.md § "Decimal precision boundary")
- Timeframe enum: 1m, 3m, 5m, 15m, 1h, 4h, 1d
- Gap detection must work for all timeframes
- Must not import from packages/core/ (candle is a peer package, not a sub-package of core)

## Steps
1. Define Candle type matching ARCHITECTURE.md schema (exchange, symbol, timeframe, open_time, OHLCV, is_closed)
2. Define Timeframe enum with interval-to-milliseconds mapping
3. Implement continuity validation: given a sorted array of candles, detect missing intervals
4. Define CandleRepository interface with methods: insert, upsert, findByRange, findLatest, countGaps
5. Write unit tests for continuity validation:
   - Continuous sequence → no gaps detected
   - Missing candle in middle → gap detected
   - Multiple gaps → all detected
   - Different timeframes (1m, 1h) work correctly
6. Create barrel export

## Acceptance Criteria
- Candle type matches ARCHITECTURE.md column definitions
- Continuity validation correctly identifies gaps for all timeframes
- At least 6 test cases covering: no gaps, single gap, multiple gaps, different timeframes, empty input, single candle
- Repository interface defined (not implemented)
- `bun test --filter candle` passes

## Validation
```bash
bun test --filter "candle"
```

## Out of Scope
- Repository implementation (Drizzle-based, handled in EP01)
- Real-time candle collection (EP01)
- Historical backfill (EP01)
- Exchange adapter integration (EP01)

## Implementation Plan
- Files: types.ts, validation.ts, repository.ts, index.ts, __tests__/candle.test.ts
- Approach: TDD — define types, write validation tests, implement validation
- Test strategy: 6 test cases covering all edge cases

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/candle/types.ts, validation.ts, repository.ts, index.ts, __tests__/candle.test.ts
- Tests: 6 passing (continuous, single gap, multiple gaps, 1h timeframe, empty input, single candle)
- Approach: Candle type uses string prices per decimal precision boundary. TIMEFRAME_MS map for interval calculation. validateContinuity walks sorted array, detecting missing intervals. CandleRepository is interface-only.
- Validation: `bun test --filter candle` → 6/6 pass, lint pass, typecheck pass

## Outputs
- `packages/candle/types.ts` — Candle, CandleKey, CandleGap types, TIMEFRAME_MS constant
- `packages/candle/validation.ts` — validateContinuity(), isContinuous()
- `packages/candle/repository.ts` — CandleRepository interface
- `packages/candle/index.ts` — barrel export
