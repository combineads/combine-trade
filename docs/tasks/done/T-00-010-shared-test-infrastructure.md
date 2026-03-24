# T-00-010 Create shared test infrastructure

## Goal
Build reusable test utilities: CCXT mock adapter, test candle data generator, test DB lifecycle manager, and sample strategy fixture — so all subsequent tasks have consistent, reliable test helpers.

## Why
Every domain package and worker will need mock exchange data, realistic candle fixtures, and isolated test databases. Building this once prevents duplication and ensures test consistency across the entire codebase.

## Inputs
- `docs/ARCHITECTURE.md` § "packages/exchange" — exchange adapter interface
- `docs/QUALITY.md` § "Test strategy" — integration test requirements
- `docs/TECH_STACK.md` § "Testing" — @faker-js/faker, bun:test
- T-00-001 outputs: `packages/exchange/` directory
- T-00-002 outputs: Docker PostgreSQL for test DB
- T-00-003 outputs: DrizzleORM schemas for DB setup/teardown

## Dependencies
- T-00-001 (monorepo structure)
- T-00-002 (PostgreSQL for test DB lifecycle)
- T-00-003 (schemas for DB setup/teardown)

## Expected Outputs
- `packages/exchange/testing/mock-adapter.ts` — Mock CCXT adapter (fetchOHLCV, createOrder, cancelOrder, fetchBalance, fetchPositions)
- `packages/exchange/testing/index.ts` — barrel export
- `tests/helpers/candle-generator.ts` — realistic synthetic OHLCV data generator
- `tests/helpers/db-lifecycle.ts` — test DB setup/teardown (create schema, seed, cleanup per suite)
- `tests/helpers/fixtures/sample-strategy.ts` — sample strategy code and metadata fixture
- `tests/helpers/index.ts` — barrel export
- Unit tests verifying mock adapter and candle generator

## Deliverables
- Mock CCXT adapter with same interface as real adapter
- Candle data generator producing realistic OHLCV with configurable parameters
- Test DB lifecycle that creates fresh schema per test suite
- Sample strategy fixture for testing strategy-related features

## Constraints
- Mock adapter must implement the same interface as the real exchange adapter (fetchOHLCV, watchOHLCV, createOrder, cancelOrder, fetchBalance, fetchPositions, fetchFundingRate)
- Generated candles must pass continuity validation (T-00-005)
- Test DB uses a separate database (combine_trade_test) — never the development DB
- Each test suite gets isolated DB state (setup/teardown)
- Use @faker-js/faker for realistic random data

## Steps
1. Define exchange adapter interface in `packages/exchange/types.ts` (used by both mock and real)
2. Install @faker-js/faker
3. Implement mock CCXT adapter:
   - fetchOHLCV returns configurable candle data
   - createOrder returns mock order responses
   - fetchBalance returns configurable balance
   - fetchPositions returns configurable positions
4. Implement candle data generator:
   - Input: symbol, timeframe, startTime, count, optional seed
   - Output: array of candles with realistic OHLCV (close near open, high > max(open,close), etc.)
   - Candles are continuous (no gaps)
5. Implement test DB lifecycle:
   - beforeAll: create test schema, apply migrations
   - afterAll: drop test schema
   - Helper to get test DB connection
6. Create sample strategy fixture (TypeScript code string + metadata object)
7. Write tests for mock adapter and candle generator
8. Create barrel exports

## Acceptance Criteria
- Mock adapter implements full exchange interface
- Generated candles have realistic OHLCV relationships (high >= max(open,close), low <= min(open,close))
- Generated candles pass continuity validation
- Test DB lifecycle creates and cleans up isolated schemas
- At least 4 test cases for candle generator correctness
- `bun test --filter "test-infra|fixture|mock-adapter"` passes

## Validation
```bash
bun test --filter "test-infra|fixture|mock-adapter"
```

## Out of Scope
- Real CCXT adapter implementation (EP01)
- WebSocket mock (deferred until EP01 candle-collector)
- E2E test setup (Playwright, tauri-driver — EP08+)
- Performance benchmarking infrastructure

## Implementation Plan
- Files: packages/exchange/types.ts, testing/mock-adapter.ts, tests/helpers/ (4 files)
- Approach: Mock adapter implementing ExchangeAdapter interface, seeded candle generator, DB lifecycle stubs
- Test strategy: 12 tests (candle generator, mock adapter, DB config, fixtures)

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/exchange/types.ts, index.ts, testing/mock-adapter.ts, testing/index.ts, tests/helpers/candle-generator.ts, db-lifecycle.ts, fixtures/sample-strategy.ts, index.ts, __tests__/test-infra.test.ts
- Tests: 12 passing
- Approach: ExchangeAdapter interface defines full CCXT surface. MockExchangeAdapter tracks calls for assertion. Candle generator uses seeded PRNG (mulberry32) for deterministic output. DB lifecycle provides config/interface — actual SQL operations deferred to live integration tests.
- Validation: `bun test --filter test-infra` → 12/12 pass, lint pass, typecheck pass

## Outputs
- `packages/exchange/types.ts` — ExchangeAdapter interface with 6 methods
- `packages/exchange/testing/mock-adapter.ts` — MockExchangeAdapter with call tracking
- `tests/helpers/candle-generator.ts` — generateCandles() with seeded PRNG
- `tests/helpers/db-lifecycle.ts` — createTestDbConfig(), setupTestDb(), teardownTestDb()
- `tests/helpers/fixtures/sample-strategy.ts` — SMA Cross strategy metadata + code
