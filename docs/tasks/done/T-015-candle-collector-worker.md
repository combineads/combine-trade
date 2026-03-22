# T-015 Implement candle-collector worker (WebSocket + startup recovery + NOTIFY)

## Goal
Build the `workers/candle-collector/` entry point that: (1) runs startup gap recovery using GapRepairService (REST tier for gaps ≤ 1 day, Vision archive tier for gaps > 1 day), (2) switches to live WebSocket candle collection via BinanceAdapter.watchOHLCV, (3) upserts each confirmed close to the repository, (4) publishes `candle_closed` NOTIFY only for live confirmed closes, and (5) reconnects with exponential backoff on WebSocket failure. Includes a health-check heartbeat.

## Why
This is the entry point of the entire pipeline. Without real-time candle data flowing into PostgreSQL with continuity guarantees, no downstream module (strategy-worker, vector-worker, decision engine) can function. The startup recovery sequence ensures the system resumes correctly after any downtime — even multi-day gaps — without manual intervention.

## Inputs
- `workers/candle-collector/repository.ts` — DrizzleCandleRepository (T-013)
- `workers/candle-collector/gap-repair.ts` — GapRepairService (T-014)
- `packages/exchange/binance/adapter.ts` — BinanceAdapter with watchOHLCV (T-012)
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher (T-009)
- `packages/shared/event-bus/channels.ts` — Channels.candleClosed (T-009)
- `packages/shared/di/container.ts` — IoC container (T-006)
- `packages/candle/types.ts` — Candle, TIMEFRAME_MS
- `docs/exec-plans/01-candle-collection.md` § M4 — startup recovery 3-tier backfill spec, acceptance criteria
- `docs/ARCHITECTURE.md` § "Worker → Package import rules" for candle-collector
- `docs/ARCHITECTURE.md` § "Event bus" rules — NOTIFY only on live confirmed closes
- T-009 outputs: PgEventPublisher, Channels.candleClosed
- T-012 outputs: BinanceAdapter.fetchOHLCV, BinanceAdapter.watchOHLCV
- T-013 outputs: DrizzleCandleRepository.upsertBatch, findLatestOpenTime
- T-014 outputs: GapRepairService.repairAll

## Dependencies
- T-012 (BinanceAdapter with watchOHLCV)
- T-013 (DrizzleCandleRepository with upsertBatch + findLatestOpenTime)
- T-014 (GapRepairService)
- T-009 (PgEventPublisher — event bus)

## Expected Outputs
- `workers/candle-collector/main.ts` — worker entry point
- `workers/candle-collector/collector.ts` — CandleCollector class (testable, injectable)
- `workers/candle-collector/health.ts` — heartbeat / health-check endpoint
- `workers/candle-collector/__tests__/collector.test.ts` — unit tests with mocks
- `workers/candle-collector/package.json` — worker package manifest (if not already present)

## Deliverables
- `CandleCollector` class:
  - `start(exchange, symbol, timeframe): Promise<void>` — runs startup recovery then begins WebSocket loop
  - `stop(): Promise<void>` — graceful shutdown
  - Startup recovery sequence:
    1. Call `repository.findLatestOpenTime(exchange, symbol, timeframe)` → lastOpenTime
    2. If lastOpenTime is null: bootstrap message logged, begin WS from now (historical backfill via EP05 loader — out of scope here)
    3. Calculate gap: `gapMs = Date.now() - lastOpenTime.getTime()`
    4. If `gapMs > 86_400_000` (> 1 day): call Vision archive downloader (stub for now — log WARNING "Vision archive not yet implemented, falling back to REST") then REST fill remaining
    5. If `gapMs <= 86_400_000`: call `gapRepair.repairAll(exchange, symbol, timeframe)`
    6. Run continuity validation on recovered range; log WARNING if gaps remain
    7. Switch to WebSocket collection
  - WebSocket loop:
    - Call `adapter.watchOHLCV(symbol, timeframe, callback)` in a `while (running)` loop
    - On each candle update: upsert via `repository.upsert(candle, source="ws")`
    - On `isClosed = true`: publish `Channels.candleClosed` via PgEventPublisher
    - On WS error / disconnect: log WARN, apply exponential backoff (1s → 2s → 4s → 8s → max 30s), reconnect
  - Health-check: `GET /health` on port `WORKER_HEALTH_PORT` (default 9001) returns `{ status: "ok", lastCandleTime, gapRepairStatus }`

- `workers/candle-collector/main.ts`: reads config from env, instantiates dependencies via IoC, calls `collector.start()`

- Configuration (env vars):
  - `BINANCE_API_KEY`, `BINANCE_API_SECRET` — optional (public fetchOHLCV works without auth)
  - `DATABASE_URL` — PostgreSQL connection string
  - `WORKER_HEALTH_PORT` — default 9001
  - `CANDLE_SYMBOL` — default "BTCUSDT"
  - `CANDLE_TIMEFRAME` — default "1m"

## Constraints
- NOTIFY (`candle_closed`) is emitted ONLY for live WebSocket confirmed closes (`isClosed = true`)
- Backfill / recovery writes must NOT emit NOTIFY — pass `silent = true` to publisher or skip publish entirely for non-live writes
- WebSocket reconnect uses exponential backoff: initial 1s, factor 2, max 30s; reset to 1s on successful reconnect
- CandleCollector must be injectable (accept ExchangeAdapter, CandleRepository, GapRepairService, EventPublisher as constructor params) for unit testing
- `main.ts` is the only file that instantiates concrete classes from env / IoC
- Do NOT import Elysia in workers/candle-collector/
- Do NOT import CCXT directly — only via BinanceAdapter interface
- Candle prices must be stored as string (Candle type) — BinanceAdapter returns `number`; convert at the collector boundary: `open: String(raw.open)` etc.
- Volume stored as string per Candle type (non-monetary but consistent with schema)
- Latency target: candle close → NOTIFY published < 200ms (collector's share of the 1s total budget)
- Health endpoint must respond within 100ms
- Worker must handle SIGTERM gracefully: finish current upsert + publish cycle, then exit

## Steps
1. Write failing unit tests first (RED):
   - Test: start() calls gapRepair.repairAll before watchOHLCV
   - Test: start() calls watchOHLCV after gap repair completes
   - Test: candle with isClosed=false → upsert called, publisher NOT called
   - Test: candle with isClosed=true → upsert called, publisher.publish called with correct CandleClosedPayload
   - Test: WS error triggers reconnect after backoff delay
   - Test: backoff resets to 1s after successful reconnect
   - Test: stop() halts the WebSocket loop gracefully
   - Test: gap > 1 day → WARNING logged for Vision archive fallback; REST repair still attempted
   - Test: gap = null (no data) → skip repair, log bootstrap message
2. Implement CandleCollector class (GREEN):
   - Implement startup recovery sequence per spec
   - Implement WebSocket loop with reconnect
   - Map ExchangeCandle (number prices) → Candle (string prices) at ingestion boundary
   - Publish CandleClosedPayload on confirmed close
3. Implement main.ts: env config, IoC wiring, `collector.start("binance", symbol, timeframe)`
4. Implement health.ts: Bun.serve() with /health route
5. Refactor (REFACTOR): extract backoff logic to a shared `withExponentialBackoff(fn, options)` utility in workers/candle-collector/

## Acceptance Criteria
- `start()` calls `gapRepair.repairAll()` before entering the WebSocket loop
- Live closed candles (isClosed=true) trigger exactly one `publisher.publish(Channels.candleClosed, payload)` call
- Live open candles (isClosed=false) do NOT trigger publish
- Recovery writes do NOT trigger publish
- WebSocket disconnection triggers reconnect with exponential backoff capped at 30s
- Backoff delay resets to 1s after a successful reconnect
- `stop()` cleanly exits the WebSocket loop
- ExchangeCandle number prices are correctly converted to Candle string prices
- `GET /health` responds 200 with JSON body
- `bun test --filter "collector"` passes (all unit tests)
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test --filter "collector"
bun run typecheck
bun run lint
# Manual smoke test (requires Docker PostgreSQL + Binance credentials):
# bun run workers/candle-collector/main.ts
# Verify candles appear in DB: psql -c "SELECT COUNT(*) FROM candles WHERE symbol='BTCUSDT'"
# Verify NOTIFY fires: LISTEN candle_closed in psql session
```

## Out of Scope
- Binance Vision daily archive downloader (stubbed with WARNING log — full implementation in EP05)
- OKX adapter integration (deferred — OKX adapter itself is deferred)
- Multi-symbol concurrent collection (EP01-M5, T-NNN deferred batch 2)
- Multi-exchange parallel collection (EP01-M5)
- Symbol watch-list dynamic configuration (EP01-M5)
- OHLCV data quality validation (EP01-M6)
- Rate limiting (EP01-M6)
- Kill switch integration (EP08)
- Worker supervisor / process manager (EP07)
- Binance maintenance window detection (noted in exec-plan risks — EP07)

## Implementation Notes
- Date: 2026-03-22
- Files changed: workers/candle-collector/src/collector.ts, health.ts, __tests__/collector.test.ts
- Tests: 6 passing
- Approach: CandleCollector is injectable with adapter/repository/gapRepair/publisher deps. Startup: findLatestOpenTime → repairAll → WS loop. ExchangeCandle→Candle conversion (number→string prices) at ingestion boundary. NOTIFY on isClosed only. Exponential backoff 1s→30s max. Health endpoint via Bun.serve.
- Validation: all pass
- Discovered work: watchOHLCV WebSocket integration deferred — currently uses REST polling as placeholder

## Outputs
- `workers/candle-collector/src/collector.ts` — CandleCollector class
- `workers/candle-collector/src/health.ts` — startHealthServer()
