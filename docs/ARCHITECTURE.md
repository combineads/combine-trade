# Architecture

## System overview
combine-trade is a 24/7 crypto futures auto-trading daemon that implements Kim Jikseon's Double-BB strategy. A single operator monitors it via a web dashboard. The system collects multi-timeframe candles, runs a signal pipeline (direction filter → WATCHING → Evidence Gate → Safety Gate → KNN), executes orders on up to 4 exchanges, and manages positions with 3-stage exits. Backtest reuses the identical signal pipeline code.

## Platform
- Interface type: Background daemon + Web SPA + REST API
- Runtime: Bun + TypeScript
- Deployment target: Single server (VPS or local)
- Operator: 1 person

## Stack
- Runtime: Bun
- Frontend: React + Vite + Zustand + TanStack Query
- Database: PostgreSQL + pgvector (HNSW, 202-dim)
- Exchange: CCXT (Binance first, then OKX/Bitget/MEXC — all exchanges collect candles + execute orders)
- Precision: Decimal.js
- Alerts: Slack Webhook

## Architectural pattern: Pipeline Module Monolith

Single process with clearly bounded modules arranged as a processing pipeline. Each module owns a specific domain concern and communicates via typed function calls.

**Why this fits:**
- Single operator — no distributed coordination needed
- Data flows linearly: candles → indicators → signals → vectors → KNN → orders → exits
- Backtest must use identical code paths — shared modules, not services
- 24/7 daemon with in-process FSM state — no serialization overhead

**Orchestration model:**
On each candle close (received via WebSocket), the daemon invokes the pipeline synchronously per symbol:
1. Indicators recalculated for the closed candle
2. Direction filter evaluated (on 1D/1H close)
3. WATCHING state evaluated (on 1H close) or entry signals checked (on 5M/1M close)
4. If signal: vectorize → KNN query → position sizing → order execution
5. If open position: exit manager checks TP1/TP2/trailing

The reconciliation worker runs on a separate 60-second interval timer, independent of candle events.

**Pipeline latency budget:**
- Indicator calculation: < 10ms
- Signal pipeline (evidence + safety gate): < 5ms
- Vectorization + KNN (202-dim, ~100K vectors): < 100ms
- Order execution (network): < 1000ms
- **Total target: < 1200ms from candle close to order placed**

## Proposed repository layout
```text
.
├── AGENTS.md
├── CLAUDE.md
├── # config.json removed — all settings in CommonCode DB table
├── docs/
├── src/
│   ├── core/                   # L0: types, constants, Decimal wrappers
│   │   ├── types.ts
│   │   ├── constants.ts        # BB20(20,2), BB4(4,4), MA(20/60/120) — immutable
│   │   ├── decimal.ts          # Decimal.js wrappers, arithmetic helpers
│   │   └── ports.ts            # ExchangeAdapter interface, DB interface
│   ├── db/                     # L1: connection pool, migrations, query helpers
│   │   ├── pool.ts
│   │   ├── migrations/
│   │   └── queries.ts          # typed query builder
│   ├── config/                 # L1: config schema, loader, validation
│   ├── indicators/             # L2: BB20, BB4, MA, RSI, ATR calculations
│   ├── exchanges/              # L2: per-exchange adapter implementations
│   │   ├── binance.ts
│   │   ├── okx.ts
│   │   ├── bitget.ts
│   │   └── mexc.ts
│   ├── candles/                # L3: WebSocket collector, history loader, gap recovery
│   ├── vectors/                # L3: 202-dim vectorizer, normalization
│   ├── filters/                # L4: daily direction filter, trade block manager
│   ├── knn/                    # L4: KNN engine, distance metrics, time decay
│   ├── signals/                # L5: WATCHING detector, evidence gate, safety gate
│   ├── positions/              # L5: FSM, ticket manager, position sizer
│   ├── limits/                 # L5: loss limit (daily/session/hourly)
│   ├── orders/                 # L6: order executor, adapter dispatch
│   ├── exits/                  # L6: 3-stage exit manager, trailing stop
│   ├── labeling/               # L6: trade result recording, pending labels
│   ├── reconciliation/         # L7: DB↔exchange sync, panic close
│   ├── notifications/          # L7: Slack webhook
│   ├── api/                    # L8: REST routes (Bun.serve)
│   ├── backtest/               # L8: backtest runner, WFO optimizer
│   ├── web/                    # standalone: React UI (Vite build → ./public)
│   │                            # Design tokens: docs/assets/tokens.css (import in app entry)
│   ├── daemon.ts               # L9: main entry point, start/stop
│   └── daemon/                 # L9: daemon sub-modules
│       ├── pipeline.ts         # candle-close → trading pipeline orchestration
│       ├── crash-recovery.ts   # startup position reconciliation + SL re-registration
│       └── shutdown.ts         # graceful shutdown + execution mode management
├── tests/
├── scripts/
│   └── kill-switch.ts          # emergency: flatten all positions + halt
└── public/                     # built web UI (gitignored)
```

## Architectural boundaries

### Layer rules (numbered for enforcement)

```
L0  core         — zero dependencies
L1  db, config   — core only
L2  indicators, exchanges — core, db
L3  candles, vectors       — core, db, config, indicators
L4  filters, knn           — core, db, config, indicators, vectors
L5  signals, positions, limits — core, db, config, indicators, filters
L6  orders, exits, labeling    — core, db, positions, exchanges (via ports)
L7  reconciliation, notifications — core, db, positions, exchanges
L8  api, backtest              — may read from L0-L7 (specific imports listed below)
L9  daemon                     — orchestrates all layers
```

**Dependency direction rule:** A module at layer N may only import from layers 0..N-1. Never upward. Diamond dependencies through lower layers are permitted.

**Enforcement:** ESLint `eslint-plugin-boundaries` with zone config matching layer numbers. CI runs `bun run lint` which includes boundary checks. If eslint-plugin-boundaries is not available for Bun, a custom script scans `import` statements and validates layer ordering.

**Key structural rules:**
- `ExchangeAdapter` interface lives in `core/ports.ts` — modules depend on the interface, not concrete adapters
- Exchange adapter implementations live in `exchanges/` — only `orders`, `reconciliation`, and `daemon` import concrete adapters
- `positions` module must NOT directly import exchange code — `orders` mediates
- `api` reads from: positions, candles, signals, knn, limits, labeling, config (not "all")
- `backtest` imports: candles, indicators, filters, signals, vectors, knn, positions, limits, exits, labeling (full pipeline)

## Module map

| Module | Layer | Owns | Public API | Depends on |
|--------|-------|------|-----------|------------|
| `core` | L0 | Types, constants, Decimal wrappers, port interfaces | `types.ts`, `constants.ts`, `decimal.ts`, `ports.ts` | nothing |
| `db` | L1 | Connection pool, migrations, query helpers | `getPool()`, `migrate()`, `query()` | core |
| `config` | L1 | Config schema, loader, validation | `loadConfig()`, `ConfigSchema`, `watchConfig()` | core |
| `indicators` | L2 | BB20, BB4, MA, RSI, ATR | `calcBB20()`, `calcBB4()`, `calcMA()`, `calcRSI()`, `calcATR()` | core |
| `exchanges` | L2 | Per-exchange adapter implementations | `BinanceAdapter`, `OkxAdapter`, `BitgetAdapter`, `MexcAdapter` | core (ports), CCXT |
| `candles` | L3 | WS collection, history, gap recovery | `CandleCollector`, `HistoryLoader`, `GapRecovery` | core, db, config |
| `vectors` | L3 | 202-dim vectorizer, normalization | `Vectorizer.vectorize(candles): Float32Array` | core, indicators |
| `filters` | L4 | Direction filter, trade block | `DailyDirectionFilter`, `TradeBlockManager` | core, config, indicators |
| `knn` | L4 | KNN engine, distance, time decay | `KnnEngine.query(vector): KnnResult` | core, db, vectors |
| `signals` | L5 | WATCHING, Evidence Gate, Safety Gate | `WatchingDetector`, `EvidenceGate`, `SafetyGate` | core, indicators, filters |
| `positions` | L5 | FSM, ticket manager, position sizer, pyramid | `canTransition()`, `createTicket()`, `closeTicket()`, `calculateSize()`, `canPyramid()`, `executePyramid()` | core, db |
| `limits` | L5 | Loss limit (daily/session/hourly) | `checkLossLimit()`, `recordLoss()`, `resetAllExpired()` | core, db (schema direct — no positions import) |
| `orders` | L6 | Order executor, slippage check | `executeEntry()`, `emergencyClose()`, `recordOrder()`, `checkSlippage()` | core, db |
| `exits` | L6 | 3-stage exit checker, trailing stop, exit manager | `checkExit()`, `processExit()`, `processTrailing()`, `calculateTrailingSl()` | core, db, orders |
| `labeling` | L6 | Trade result classification, Vector label | `classifyResult()`, `classifyGrade()`, `finalizeLabel()` | core, db |
| `reconciliation` | L7 | 60s interval position reconciliation | `comparePositions()`, `runOnce()`, `startReconciliation()` | core, db, orders, exchanges (via ports) |
| `notifications` | L7 | Slack webhook alerts (fire-and-forget) | `sendSlackAlert()`, `formatMessage()`, `getWebhookUrl()` | core, db (CommonCode) |
| `api` | L8 | REST routes | `createRouter(): Router` | core, positions, candles, signals, knn, limits, labeling, config |
| `backtest` | L8 | Backtest runner, WFO | `BacktestRunner.run(): BacktestResult` | full pipeline (candles→labeling) |
| `daemon` | L9 | Main entry, pipeline, crash recovery, shutdown | `startDaemon()`, `handleCandleClose()`, `recoverFromCrash()`, `gracefulShutdown()`, `getExecutionMode()`, `killSwitch()` | all |

## Data ownership

| Entity | Owner module | Table | Storage notes |
|--------|-------------|-------|---------------|
| Symbol | core | `symbol` | PK=(symbol, exchange). Per-exchange symbol. |
| SymbolState | positions | `symbol_state` | Per symbol×exchange FSM + loss counters. Upsert. |
| CommonCode | config | `common_code` | PK=(group_code, code). All settings. Replaces config.json. |
| TradeBlock | filters | `trade_block` | Recurring + one-off trade blocks. Replaces BlackoutWindow + EconomicEvent. |
| Candle | candles | `candles` | Per exchange×symbol×timeframe. Append-only. |
| WatchSession | signals | `watch_session` | Lifecycle: open → active → invalidated. Per symbol×exchange. |
| Signal | signals | `signals` | Core judgment columns only. Details in SignalDetail. |
| SignalDetail | signals | `signal_details` | Key-value observation data per signal. |
| Vector | vectors | `vectors` | pgvector 202-dim + label/grade. HNSW index. |
| Ticket | positions | `tickets` | FSM + trade result (Label absorbed). Per-ticket independent. |
| Order | orders | `orders` | Exchange order records with fill details. |
| Backtest | backtest | `backtests` | Backtest + WFO results (merged). |
| EventLog | daemon | `event_log` | Append-only audit trail. Replaces ReconciliationLog, CrashRecoveryLog, etc. |
| DaemonState | daemon | derived on startup | No persistent table. Reconstructed from tickets + exchange positions on restart. |

**Data access rule:** Each module reads/writes only its own table(s). Cross-module data access goes through the owning module's public API. Exception: `db` module provides shared connection pool and migration infrastructure.

## Integration boundaries

| External system | Protocol | Adapter location | Rate limit | Notes |
|----------------|----------|-----------------|------------|-------|
| Binance Futures | WS + REST | `exchanges/binance.ts` | 1200 req/min | Candles + orders (first exchange) |
| OKX Swap | WS + REST | `exchanges/okx.ts` | 60 req/2s | Candles + orders |
| Bitget Futures | WS + REST | `exchanges/bitget.ts` | 20 req/s | Candles + orders |
| MEXC Futures | WS + REST | `exchanges/mexc.ts` | 20 req/s | Candles + orders. May need 2-step SL |
| Slack | HTTPS webhook | `notifications/slack.ts` | — | Fire-and-forget |
| Investing.com | REST/scrape | `filters/economic-calendar.ts` | TBD | Fail-closed (assume trade block on failure) |
| PostgreSQL | TCP | `db/pool.ts` | — | pgvector extension required |

**Rate limiting strategy:** Each exchange adapter maintains its own rate limiter (token bucket). CCXT provides built-in rate limiting per exchange instance. Additional guard: if rate limit error received, back off exponentially (1s, 2s, 4s, max 30s) and alert via Slack. Each exchange collects its own candles via WebSocket. Rate limit budgets must account for both candle streams and order operations per exchange.

## Operational safety

### Crash recovery policy
On restart:
1. Fetch all positions from all exchanges via `fetchPositions()`
2. Match against `tickets` table in DB
3. **Matched:** Restore OPEN state, verify SL exists on exchange (re-register if missing)
4. **Unmatched (exchange has, DB doesn't):** Panic close immediately → IDLE
5. **Orphaned DB (DB has, exchange doesn't):** Mark IDLE, log anomaly
6. Resume WATCHING evaluation on next 1H close
7. Reconstruct loss limit state from `symbol_state` table

### Graceful shutdown (SIGTERM/SIGINT)
1. Stop accepting new candle events
2. Cancel any pending (unfilled) entry orders
3. **Do NOT close open positions** — SL is on exchange, positions are protected
4. Flush pending labels to DB
5. Close DB connections and WebSocket streams
6. Exit cleanly

### Kill switch (`scripts/kill-switch.ts`)
Emergency command: flatten all positions across all exchanges and halt daemon.
1. Fetch all open positions from all exchanges
2. Market close every position (`reduceOnly`)
3. Cancel all open orders
4. Set daemon mode to `analysis` (no new trades)
5. Send Slack alert: "KILL SWITCH ACTIVATED"
6. Can be triggered via: CLI (`bun scripts/kill-switch.ts`), web UI button, or API endpoint

### Reconciliation as safety net
Runs on 60-second interval timer within the daemon process. While sharing a process is a tradeoff (critic noted this), the PRD mandates single-process design. Mitigations:
- SL is always registered on the exchange — even if daemon dies, positions are protected
- External process monitor (systemd/pm2) restarts daemon on crash
- Slack webhook alerts on any reconciliation mismatch
- Kill switch is a separate script, not dependent on daemon being alive

### Alerting on process death
- systemd/pm2 configured to restart daemon and send notification on exit
- Health check endpoint (`GET /api/health`) for external monitoring
- Slack alert on: startup, clean shutdown, reconciliation mismatch, loss limit hit

## Error handling strategy

| Failure | Response | Recovery |
|---------|----------|----------|
| Exchange API call fails (order) | Retry 3× with exponential backoff | If all fail: log, alert, do NOT enter position |
| Exchange API call fails (SL registration) | Retry 3× | If all fail: immediately close position + alert |
| DB unreachable | Halt new entries after 30s | Resume after reconnection + reconciliation pass |
| WebSocket disconnect | Auto-reconnect (1s, 2s, 4s, max 30s) | Gap recovery via REST API |
| Slippage exceeds threshold | Immediate close + alert | Log as ABORT |
| Uncaught exception | Process exits, systemd restarts | Crash recovery sequence runs |
| Investing.com API failure | Fail-closed: assume trade block active | Retry on next refresh cycle |
| Slack webhook failure | Log locally, continue trading | Non-blocking |

## Observability

### Structured logging
- Format: JSON lines
- Fields: `timestamp`, `level`, `module`, `symbol`, `exchange`, `event`, `details`
- Log levels: `error` (failures), `warn` (mismatches, retries), `info` (signals, orders, exits), `debug` (indicators, state changes)
- Rotation: daily, retain 30 days

### Critical events always logged
- Order execution (entry, SL, partial close, full close)
- SL registration success/failure
- Reconciliation mismatches
- Crash recovery actions
- Loss limit triggers
- Config changes (mode, trade block)

## Explicit constraints

| Constraint | Scope | Enforcement |
|-----------|-------|-------------|
| Decimal.js for all prices/sizes/PnL | All modules | ESLint rule (no `number` for financial types) |
| BB20(20,2), BB4(4,4), MA(20/60/120) immutable | core/constants.ts | `as const`, no config override |
| Max symbols: 2 (BTCUSDT, XAUTUSDT) | config | Schema validation |
| Max exchanges: 4 | config | Schema validation |
| Max leverage: 38× | positions | Hard cap in `sizer.ts` (`HARD_CAP_LEVERAGE = 38`) |
| 202-dim vectors | vectors | Constant, validated at insertion |
| No lookahead in backtest | backtest | Mock adapter only serves data ≤ current timestamp |
| Layer dependency direction | all | eslint-plugin-boundaries or custom CI script |

## Exchange rollout strategy

Start with Binance only. Add exchanges one at a time after Binance is profitable and stable:
1. **Phase 1:** Binance (candles + orders, full pipeline)
2. **Phase 2:** OKX (candles + orders, after ExchangeAdapter proven)
3. **Phase 3:** Bitget, MEXC (candles + orders, after adapter pattern is stable)

Each new exchange requires: sandbox/testnet validation, rate limit testing, partial close API verification, SL registration confirmation.

## Architecture decisions
- `docs/decisions/ADR-001-pipeline-monolith.md`
- `docs/decisions/ADR-002-single-process-reconciliation.md`
- `docs/decisions/ADR-003-exchange-rollout.md`

## Consensus log
- Round 1: Architect drafted architecture from PRD v1.2 (interview: 0 rounds — PRD was comprehensive)
- Round 2: Validator REVISED — missing db module, incorrect dependency declarations, no layer numbers, no enforcement mechanism. 12 items total.
- Round 2: Critic REVISED — need crash recovery policy, kill switch, graceful shutdown, rate limiting strategy, exchange rollout phasing. 11 items total.
- Round 3: All feedback incorporated into final version.
- Verdict: Consensus reached after 1 revision round.
