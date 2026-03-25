# T-01-012 Multi-symbol concurrent candle collection

## Goal
Extend the CandleCollector worker to accept a list of symbols and run per-symbol WebSocket connections concurrently, publishing `candle_closed` events per symbol with full error isolation.

## Why
Currently the collector handles a single symbol sequentially. Real strategies span multiple symbols (e.g. BTCUSDT, ETHUSDT, SOLUSDT). Running them concurrently reduces end-to-end latency from N×(candle close delay) to 1×(candle close delay) and ensures the pipeline meets the <1s total latency budget regardless of symbol count.

## Inputs
- `workers/candle-collector/src/collector.ts` — CandleCollector class (T-01-005)
- `workers/candle-collector/src/health.ts` — health endpoint (T-01-005)
- `packages/candle/types.ts` — Candle, Timeframe types
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher
- `packages/shared/event-bus/channels.ts` — Channels.candleClosed
- `docs/exec-plans/01-candle-collection.md` — EP01 M5 multi-symbol spec

## Dependencies
- T-01-005 (CandleCollector — single-symbol implementation)

## Expected Outputs
- Updated `workers/candle-collector/src/collector.ts` — accepts `symbol[]` and manages per-symbol loops
- `workers/candle-collector/src/symbol-slot.ts` — isolated per-symbol connection state
- Updated `workers/candle-collector/__tests__/collector.test.ts` — multi-symbol tests added
- Updated `workers/candle-collector/src/main.ts` — reads `CANDLE_SYMBOLS` (comma-separated) from env

## Deliverables
- `CandleCollector` class updated:
  - `start(exchange, symbols: string[], timeframe): Promise<void>` — spawns one `SymbolSlot` per symbol
  - `stop(): Promise<void>` — signals all slots to stop and awaits clean shutdown
  - Each slot runs its own startup recovery + WebSocket loop independently
  - A crash/disconnect in one slot does not affect other slots
- `SymbolSlot` class:
  - Encapsulates single-symbol state: adapter, backoff counter, running flag
  - `start(exchange, symbol, timeframe): Promise<void>`
  - `stop(): Promise<void>`
  - Emits `candle_closed` NOTIFY on live confirmed close
  - Reconnects with exponential backoff (1s → 2s → 4s → max 30s) independently
- Shared event bus: all slots share a single `PgEventPublisher` instance (one DB connection pool)
- Health endpoint updated:
  - `GET /health` returns `{ status, symbols: { [symbol]: { lastCandleTime, backoffMs, connected } } }`
- `main.ts` updated: reads `CANDLE_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT` from env, passes array to `collector.start()`

## Constraints
- Error in one symbol's WS connection must NOT crash or pause other symbols
- NOTIFY is emitted only on live `isClosed=true` closes — same rule as single-symbol
- Each SymbolSlot has its own backoff state; backoff reset is per-slot, not global
- All symbols share the same timeframe configured for the worker instance
- Do NOT import Elysia in the worker
- Price conversion from ExchangeCandle (number) → Candle (string) must happen per slot at ingestion boundary
- Maximum concurrent symbols: governed by available DB connections in the pool (document in code)

## Steps
1. Write failing tests first (RED):
   - Test: `start(exchange, ["BTC", "ETH"], tf)` creates two independent slots
   - Test: slot A WS error does not stop slot B from receiving candles
   - Test: slot A and slot B each publish `candle_closed` independently with correct symbol in payload
   - Test: `stop()` shuts down all slots cleanly
   - Test: each slot has independent backoff; slot A backoff does not affect slot B
   - Test: health returns per-symbol status object
2. Implement `SymbolSlot` class (GREEN):
   - Extract single-symbol loop from existing `CandleCollector` into `SymbolSlot`
   - Slot accepts (adapter, repository, gapRepair, publisher, symbol, timeframe) via constructor
3. Update `CandleCollector.start()` to accept `symbol[]`, spawn one `SymbolSlot` per symbol via `Promise.allSettled`
4. Update `main.ts` to parse `CANDLE_SYMBOLS` env var (comma-separated, trim whitespace)
5. Update health endpoint to aggregate per-slot status
6. Refactor (REFACTOR): ensure `SymbolSlot` is independently testable with no dependency on `CandleCollector`

## Acceptance Criteria
- `start()` with N symbols spawns exactly N concurrent slots
- A WS error in slot A does not interrupt slot B's candle stream
- Each slot publishes `candle_closed` with the correct `symbol` field in the payload
- `stop()` shuts down all slots and resolves only after all slots have exited their WS loops
- Health endpoint returns per-symbol connection status
- `bun test --filter "candle-collector"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "candle-collector"
bun run typecheck
bun run lint
```

## Out of Scope
- Multi-exchange parallel collection (T-01-013)
- Dynamic symbol watch-list updates at runtime (no hot-reload of symbol list)
- Per-symbol timeframe configuration (all symbols share one timeframe per worker instance)
- Symbol-level kill switch integration (EP08)
- Binance Vision archive downloader (EP05)
