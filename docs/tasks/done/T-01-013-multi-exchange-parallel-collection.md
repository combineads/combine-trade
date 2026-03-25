# T-01-013 Multi-exchange parallel candle collection

## Goal
Implement an `ExchangeCollectorManager` that spawns and supervises one `CandleCollector` instance per configured exchange, running Binance and OKX (and future exchanges) in parallel with independent health monitoring and reconnection.

## Why
Combine Trade supports multiple exchanges. Each exchange has its own WebSocket protocol, rate limits, and failure modes. Running collectors in separate, supervised instances provides exchange-level fault isolation — an OKX outage does not interrupt Binance data collection — and allows the pipeline to meet the <1s latency budget across all exchanges simultaneously.

## Inputs
- `workers/candle-collector/src/collector.ts` — CandleCollector with multi-symbol support (T-01-012)
- `packages/exchange/binance/adapter.ts` — BinanceAdapter (T-01-001)
- `packages/exchange/okx/adapter.ts` — OKXFuturesAdapter (T-01-008)
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher
- `packages/shared/di/container.ts` — IoC container
- `docs/exec-plans/01-candle-collection.md` — EP01 M5 multi-exchange spec

## Dependencies
- T-01-012 (CandleCollector with multi-symbol support)
- T-01-008 (OKXFuturesAdapter)

## Expected Outputs
- `workers/candle-collector/src/exchange-manager.ts` — ExchangeCollectorManager class
- `workers/candle-collector/__tests__/exchange-manager.test.ts` — unit tests
- Updated `workers/candle-collector/src/main.ts` — reads `EXCHANGES` config from env, instantiates manager
- Updated health endpoint — aggregates per-exchange status

## Deliverables
- `ExchangeCollectorManager` class:
  - `constructor(exchanges: ExchangeConfig[], publisher: PgEventPublisher, repository: CandleRepository)`
  - `start(): Promise<void>` — starts all per-exchange `CandleCollector` instances concurrently
  - `stop(): Promise<void>` — gracefully stops all collectors
  - `getHealth(): ExchangeHealthMap` — returns per-exchange health summary
  - Each exchange runs in its own `CandleCollector` instance with its own adapter, backoff, and slot state
  - A fatal error in one exchange collector is caught, logged, and triggers that collector's restart cycle without affecting others
- `ExchangeConfig` type:
  ```ts
  interface ExchangeConfig {
    id: string;           // e.g. "binance", "okx"
    adapter: ExchangeAdapter;
    symbols: string[];
    timeframe: Timeframe;
    restartDelayMs?: number; // default 5000
  }
  ```
- Exchange-level restart loop:
  - On collector crash: wait `restartDelayMs`, then call `collector.start()` again
  - Maximum 5 consecutive restarts before marking exchange as `degraded` and alerting via log ERROR
  - Restart counter resets after 10 minutes of stable operation
- Health endpoint updated:
  - `GET /health` returns `{ status, exchanges: { [exchangeId]: { status, symbols: {...}, restartCount, lastRestartAt } } }`
  - Overall `status` is `"ok"` only if all exchanges are healthy; `"degraded"` if any exchange has failed over; `"error"` if any exchange has hit max restarts
- `main.ts` updated:
  - Reads `EXCHANGES=binance,okx` from env
  - Reads per-exchange symbol lists: `BINANCE_SYMBOLS=BTCUSDT,ETHUSDT`, `OKX_SYMBOLS=BTC-USDT-SWAP`
  - Instantiates adapters via IoC, builds `ExchangeConfig[]`, passes to manager

## Constraints
- A crash in the Binance collector must NOT affect the OKX collector and vice versa
- All collectors share a single `PgEventPublisher` (one DB pool)
- Each exchange uses only its own adapter — no cross-exchange adapter calls
- `ExchangeCollectorManager` must be injectable (accept all deps via constructor) for unit testing
- `main.ts` is the only file that reads from env and instantiates concrete classes
- Do NOT import Elysia in the worker
- Restart loop must use `setTimeout`-based delay, not blocking sleep
- Log format for restart events: `[exchange-manager] exchange=<id> event=restart attempt=<n>`

## Steps
1. Write failing tests first (RED):
   - Test: `start()` calls `collector.start()` for each configured exchange
   - Test: a crash in exchange A's collector triggers restart, exchange B remains running
   - Test: after 5 restarts exchange A is marked `degraded`, no further restart attempted
   - Test: restart counter resets after stable period
   - Test: `stop()` stops all collectors and resolves
   - Test: `getHealth()` reflects per-exchange status including restart counts
2. Implement `ExchangeCollectorManager` (GREEN):
   - Spawn one `CandleCollector` per `ExchangeConfig`
   - Wrap each collector in an async restart loop with counter
   - Aggregate health from per-collector status
3. Update `main.ts`: parse `EXCHANGES` env, build config array, instantiate manager
4. Update health endpoint to call `manager.getHealth()` and merge into response
5. Refactor (REFACTOR): extract restart loop logic into a standalone `withRestartLoop(fn, options)` utility for reuse

## Acceptance Criteria
- `start()` launches all configured exchange collectors concurrently
- A fatal error in one exchange's collector triggers that collector's restart cycle without interrupting others
- After 5 consecutive restarts, exchange is marked `degraded` and no further restarts are attempted
- Restart counter resets after 10 minutes of stable operation
- Health endpoint reports per-exchange status, restart count, and last restart timestamp
- Overall health is `"degraded"` if any exchange failed over, `"error"` if any hit max restarts
- `bun test -- --filter "exchange-collector"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "exchange-collector"
bun run typecheck
bun run lint
```

## Out of Scope
- Dynamic exchange list updates at runtime
- Per-exchange rate limit coordination (each exchange manages its own via adapter)
- Slack alerting on degraded state (EP08 / alerting epic)
- Binance Vision archive downloader (EP05)
- Adding a third exchange beyond Binance + OKX (future task)
