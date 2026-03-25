# T-01-014 Candle ingestion end-to-end integration test

## Goal
Write an end-to-end integration test suite that verifies the full candle ingestion pipeline: REST gap repair → WebSocket streaming → candle upsert → NOTIFY publish → aggregation output, using a mock exchange WebSocket and an in-memory repository.

## Why
Unit tests for individual modules (collector, gap repair, aggregator) do not catch integration bugs at module boundaries: incorrect payload shapes, missed NOTIFY triggers, aggregation not receiving closed candles, or gap repair not completing before WS starts. A pipeline integration test catches these boundary issues without requiring a live database or exchange connection.

## Inputs
- `workers/candle-collector/src/collector.ts` — CandleCollector (T-01-012)
- `workers/candle-collector/src/symbol-slot.ts` — SymbolSlot (T-01-012)
- `packages/candle/aggregator.ts` — aggregateCandles (T-01-006)
- `packages/candle/continuity-validator.ts` — validateContinuity (T-01-003)
- `packages/candle/gap-repair.ts` — GapRepairService (T-01-004)
- `packages/shared/event-bus/channels.ts` — Channels.candleClosed
- `packages/candle/__tests__/pipeline-integration.test.ts` — existing pipeline test (T-01-011) for reference

## Dependencies
- T-01-012 (CandleCollector with multi-symbol support)

## Expected Outputs
- `workers/candle-collector/__tests__/candle-ingestion-e2e.test.ts` — integration test file
- `workers/candle-collector/__tests__/helpers/mock-ws-exchange.ts` — mock WebSocket exchange helper

## Deliverables
- `MockWsExchange` test helper:
  - Simulates a WebSocket-based exchange adapter
  - `push(candle: ExchangeCandle)` — sends a candle update to the registered callback
  - `simulateDisconnect()` — triggers WS error to test reconnection path
  - `simulateReconnect()` — signals WS restored
  - Implements the `ExchangeAdapter` interface so it can be injected into `CandleCollector`
- `InMemoryCandleRepository` test helper (if not already in test utils):
  - Implements `CandleRepository` interface
  - Stores upserted candles in a `Map<string, Candle>`
  - `findLatestOpenTime()` returns the latest open time from stored candles or `null`
- Integration test cases (minimum 8):
  1. Pipeline boot: `start()` calls gap repair before first WS candle is accepted
  2. WS candle with `isClosed=false`: upserted to repository, NOTIFY not published
  3. WS candle with `isClosed=true`: upserted to repository, NOTIFY published with correct symbol + openTime
  4. NOTIFY payload shape: verify `{ exchange, symbol, timeframe, openTime, closeTime }` fields present
  5. Aggregation downstream: closed 1m candles feed into `aggregateCandles()` and produce correct 3m candle after 3 consecutive closes
  6. Continuity validation: injecting a candle with a gap triggers a WARNING log (verified via log spy)
  7. WS disconnect mid-stream: after `simulateDisconnect()`, slot reconnects and resumes publishing NOTIFY on next close
  8. Multi-symbol: two symbols each receive independent candles; NOTIFY is published for each with correct symbol field

## Constraints
- No real database connections — use `InMemoryCandleRepository`
- No real WebSocket connections — use `MockWsExchange`
- No real NOTIFY — use a mock publisher that records `publish()` calls
- Tests must complete in under 5 seconds (no real timers; use fake timers via `bun:test` mock.timers where needed)
- Test file must be self-contained — no shared mutable state between test cases (use `beforeEach` setup)
- Use `bun:test` only; no Jest or other test runners
- All assertions must be deterministic — avoid `setTimeout`-based polling

## Steps
1. Create `MockWsExchange` helper (RED setup):
   - Implement `ExchangeAdapter` interface
   - Wire `push()` to invoke the registered `watchOHLCV` callback synchronously
   - Implement `simulateDisconnect()` to throw from the callback
2. Create `InMemoryCandleRepository` if not already available in test utils
3. Write all 8 integration tests (RED — expect failures until pipeline wiring is confirmed correct)
4. Run tests and confirm they pass against the existing collector implementation (GREEN)
5. If any test exposes a pipeline bug, fix the bug in the relevant module and re-run
6. Refactor (REFACTOR): extract shared test setup (repository + publisher + collector factory) into a `createTestPipeline()` helper within the test file

## Acceptance Criteria
- All 8 integration test cases pass
- No real DB, WS, or network calls are made during the test run
- `NOTIFY` publish is verified by mock publisher call assertions, not by polling
- Aggregation output is verified by calling `aggregateCandles()` with the candles captured by the in-memory repository
- Continuity warning is verified via a log spy without relying on console output formatting
- `bun test -- --filter "candle-ingestion-e2e"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "candle-ingestion-e2e"
bun run typecheck
bun run lint
```

## Out of Scope
- Real database integration tests (require Docker — out of scope for CI unit tests)
- Binance/OKX live WebSocket smoke tests (manual verification step in go-live checklist T-17-013)
- Multi-exchange manager integration testing (covered separately in T-01-013 tests)
- Load/stress testing (separate performance epic)
