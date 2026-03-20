# RELIABILITY.md

## Reliability stance
24/7 uptime target. Fail loudly, recover predictably. Crypto markets never close — system availability directly impacts profitability.

## Critical path latency budget

> **Authoritative source**: This section is the single source of truth for all latency budget values. Other documents (CLAUDE.md, QUALITY.md, ARCHITECTURE.md) should reference this section rather than restating values.

```
candle close → alert/execution: < 1s total (p99 envelope)
├── candle ingestion:    < 50ms  (p95)
├── strategy evaluation: < 200ms (p95)
├── vectorization:       < 100ms (p95)
├── L2 search:           < 100ms (p95)
├── decision:            < 50ms  (p95)
├── alert/order:         < 200ms (p95)
└── statistical slack:   300ms
```

> **Budget interpretation**: Each component target is a **p95 upper bound**. The 1-second total is the **p99 envelope** — it is statistically unlikely that all components simultaneously hit their p95 targets. The sum of individual p95 values (1000ms) represents the absolute worst-case, not the expected behavior. At p50, each component should operate at ~60-70% of its budget.

> Note: The 300ms statistical slack (not a guaranteed buffer; represents the statistical improbability of all components simultaneously hitting p95 ceiling) assumes all components operate at or below their individual budgets. Component-level p50/p95 breakdown will be established after EP07 integration benchmarks.

## Expected failure modes

### Exchange connectivity
- WebSocket disconnect: exponential backoff reconnect (max 30s)
- REST API rate limit: per-exchange rate limiter with queue
- Exchange maintenance detection:
  - Primary: WebSocket disconnection pattern (3 consecutive reconnect failures within 2 minutes)
  - Secondary: Exchange status API polling (Binance: `GET /sapi/v1/system/status`, OKX: `GET /api/v5/system/status`)
  - On detection: pause all workers for affected exchange, log WARNING, Slack notification
  - Recovery: resume when status API returns healthy AND WebSocket reconnects successfully
- Order rejection: log + retry with adjusted parameters (max 3 attempts)

### Partial fill recovery
- On partial fill + disconnect: query exchange for order status via `client_order_id` on reconnect
- Adjust SL/TP order quantities to match actual `filled_quantity` (not original order quantity)
- Remaining unfilled quantity: cancel or re-submit based on strategy configuration
- Record partial fill event in decision audit trail
- If position size after partial fill is below minimum lot size: close position at market

### Order reconciliation
- After exchange order submission, if DB write fails: reconcile via `client_order_id` query on next cycle
- Reconciliation runs on execution-worker startup and every 60 seconds during operation
- Compares local `orders` table against exchange open/closed orders
- Discrepancies trigger WARNING log + Slack alert + automatic state synchronization
- Reconciliation is idempotent: safe to run multiple times

### Database
- Connection pool exhaustion: bounded pool (max 30), health check (see ARCHITECTURE.md § DB connection pool sizing)
- pgvector index corruption: periodic REINDEX scheduled job
- Migration failure: rollback-safe migrations only

### Strategy sandbox
- Infinite loop: execution timeout (5s per evaluation)
- Memory leak: worker memory limit, restart on threshold breach
- Runtime error: catch, log, skip event, continue

### Candle data
- Gap detection: continuity check on every insert
- Missing candles: REST backfill repair within 1 minute
- Duplicate candles: idempotent upsert on (exchange, symbol, timeframe, open_time)

### Candle gap policy
- On gap detection: immediately pause strategy evaluation for the affected symbol+timeframe
- Trigger REST backfill repair (existing mechanism, target < 1 minute)
- Resume strategy evaluation only after backfill completes and continuity re-validates
- During pause: no new events, no vectorization, no decisions for that symbol+timeframe
- Log WARNING with gap details (symbol, timeframe, missing range, duration)

### Worker failures
- Crash: auto-restart via process supervisor
- Stuck: health heartbeat check every 30s, force restart on timeout
- Backpressure: bounded queue per worker; real-time events never dropped (block new backtest work instead); alert-worker drops oldest with WARNING log; execution-worker rejects new work when full (never drops queued orders)

### Disk space exhaustion
- **Symptoms**: WAL archiving fails, PostgreSQL crashes, log files cannot be written
- **Prevention**: Monitor disk usage with alert at 80% threshold
- **Mitigation**:
  - Automated log rotation (max 500MB per log file, 7 days retention)
  - Candle data partitioning by month for targeted pruning
  - WAL size monitoring with alert at 1GB
- **Recovery**: Free disk space → restart PostgreSQL → verify WAL integrity → resume operations

### Exchange API key invalidation
- **Symptoms**: Exchange unilaterally revokes API key. All authenticated exchange requests begin returning authentication errors.
- **Detection**: 3 or more consecutive authentication failures from the same exchange adapter trigger auto-suspension.
- **Response**: Auto-suspend the affected exchange (pause all order submissions and data fetching for that exchange), log ERROR, send Slack alert to operator with exchange name and failure details.
- **Recovery**: Operator registers a new valid API key via the UI. Manual re-enablement of the exchange required. Audit logged.

### Kill switch NOTIFY loss
- **Symptoms**: Network partition causes the LISTEN subscriber to miss the `kill_switch_activated` PostgreSQL NOTIFY event. Kill switch appears active in DB but workers continue submitting orders.
- **Mitigation**: Synchronous DB check before every order submission (`SELECT active FROM kill_switch_state`), independent of NOTIFY subscription status (see SECURITY.md § Kill switch specification). This ensures the kill switch is effective even when the async NOTIFY channel is unavailable.
- **Detection**: Monitor LISTEN subscription health via heartbeat NOTIFYs every 10 seconds. Alert if no heartbeat received for 30 seconds.
- **Recovery**: Worker reconnects LISTEN subscription on next heartbeat failure detection; synchronous DB check continues to protect during outage.

### Master encryption key unavailability
- **Symptoms**: System cannot decrypt exchange API keys on startup, execution-worker fails to initialize
- **Prevention**: Document key location. Verify key presence in startup health check.
- **Mitigation**: Graceful degradation to analysis-only mode (no execution) when encryption key is missing
- **Recovery**: Provide correct `MASTER_ENCRYPTION_KEY` environment variable → restart affected workers

## Operational rules

### Idempotency
- Candle upsert: unique(exchange, symbol, timeframe, open_time)
- Vector write: unique(event_id, strategy_id, version)
- Label write: unique(event_id)
- Order: client_order_id based deduplication
- Decision: `unique(event_id, strategy_id, strategy_version)` — if pipeline re-processes same event, existing decision is returned (no duplicate append)
- All handlers must be re-entrant

### Retry policy
- Exchange API calls: 3 retries with exponential backoff
- DB operations: 2 retries with 100ms delay
- Slack webhook: 3 retries, then mark as failed
- No infinite retry loops

### Timeouts

> **Authoritative source**: This is the canonical sandbox timeout value. QUALITY.md and SECURITY.md reference this section.

- Strategy sandbox execution: 5 seconds
- Exchange REST API: 10 seconds
- WebSocket heartbeat: 30 seconds
- DB query: 5 seconds
- Vector search: 2 seconds

### Clock drift and time synchronization
- System time: NTP synchronization required (drift tolerance: < 500ms)
- Exchange server time: query via CCXT `fetchTime()` on each connection establishment
- Drift threshold: if local-exchange drift > 1 second, log WARNING and pause order submission
- Candle timestamps: always use exchange-provided `open_time`, never local clock

### Logging
- Structured JSON logs at all service boundaries
- Correlation ID per pipeline execution (candle → decision)
- Log levels: ERROR (alert), WARN (investigate), INFO (audit), DEBUG (development)
- Separate log streams per worker

## Recovery procedures

### Worker restart
1. Workers resume from last committed DB state
2. No in-memory state dependency — all state in PostgreSQL
3. Missed candle_closed notifications recovered via periodic poll

### Backtest recovery
- Backtest progress checkpointed every 1000 events
- Resume from last checkpoint on failure

### Data integrity
- Candle continuity validation runs every 1 minute
- Gaps trigger automatic REST backfill
- Vector count vs event count consistency check on startup

### Graceful shutdown
- On SIGTERM/SIGINT: stop accepting new events from event bus
- Complete any in-progress order submissions (max wait: 10 seconds)
- Flush pending audit log writes
- Close exchange WebSocket connections cleanly
- Release advisory locks
- Exit with status 0 on clean shutdown, 1 on timeout

### Backup & disaster recovery
See `docs/ARCHITECTURE.md` § Backup & disaster recovery for pg_dump schedule, WAL archiving, and recovery procedures.

## Multi-strategy latency budget

When multiple strategies evaluate simultaneously against the same candle event, total latency must stay within these thresholds:

| Scenario | Budget |
|----------|--------|
| 1 strategy | < 50ms for strategy evaluation step only (within the 200ms strategy evaluation budget) |
| 10 strategies (parallel) | < 200ms total |
| 50 strategies (parallel + backpressure) | < 500ms total |

### Budget enforcement
- If evaluation exceeds budget: log a WARN, skip lowest-priority strategies for that event cycle, emit a `strategy_eval_budget_exceeded` metric.
- Priority is determined by strategy configuration (higher priority = evaluated first); unset defaults to lowest priority.

### Circuit breaker
- If latency exceeds 2× the applicable budget for 5 consecutive candle events, the circuit breaker trips.
- On trip: pause all non-critical strategies (those below a configurable priority threshold), emit a `strategy_circuit_breaker_open` metric, and log an ERROR.
- Recovery: re-enable paused strategies after 3 consecutive on-budget events.
- **Maximum open duration**: 10 minutes. After 10 minutes in open state without recovery, escalate via Slack alert and require manual intervention.
- **Manual override**: Kill switch API can force-close or force-open circuit breakers.

### Health check endpoint (`GET /api/health`)
Returns:
- DB connection: ping with 2-second timeout
- Exchange WebSocket: connected/disconnected per exchange
- Worker status: alive/dead per worker (last heartbeat < 60 seconds)
- Event bus: LISTEN subscription active
- Pipeline latency: p99 over last 5 minutes < 1.5 seconds (degraded if > 800ms, unhealthy if > 1.5s)
- Failure of any check returns HTTP 503 with failing component details

## Monitoring checklist
- Worker heartbeat (30s interval)
- Candle gap count (target: 0)
- Pipeline end-to-end latency (target: < 1s at p99)
- Exchange WebSocket connection state
- Strategy evaluation error rate
- Order execution success rate
- Slack delivery success rate
