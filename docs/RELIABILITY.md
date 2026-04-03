# RELIABILITY.md

## Reliability stance
This system manages real money 24/7. It must fail loudly, recover predictably, and never leave unprotected positions.

## Expected failure modes

### Critical (data loss / financial risk)
- **Exchange WebSocket disconnect**: candle data gap → missed signals or stale indicators
- **Order rejected by exchange**: position opened without SL → unprotected exposure
- **Daemon crash with open positions**: SL on exchange protects; TP/trailing lost until restart
- **DB connection lost**: cannot read/write state → must halt trading, not continue blind
- **Exchange API downtime**: orders/cancels fail → reconciliation must detect and alert

### Significant (degraded operation)
- **Reconciliation mismatch**: DB says OPEN, exchange says no position (or vice versa)
- **Slippage exceeds threshold**: bad fill → immediate close + alert
- **Rate limit exceeded**: orders delayed → spread may have moved
- **Investing.com API failure**: economic event data stale → fail-closed (assume trade block active)

### Operational
- **Config hot-reload failure**: mode change doesn't take effect → log + alert
- **Slack webhook failure**: alerts lost but trading continues
- **Web UI unreachable**: monitoring degraded but trading unaffected

## Operational rules

### Position safety invariant
- SL must be registered on the exchange within 2 seconds of entry fill
- If SL registration fails after 3 retries, immediately close the position
- This is the #1 reliability rule — everything else is secondary

### WebSocket resilience
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Gap detection: compare last received candle timestamp with expected
- Gap recovery: fetch missing candles via REST API before resuming

### Database resilience
- Connection pool with health checks
- If DB is unreachable for >30s, halt all new entries (existing SLs remain on exchange)
- Resume only after successful DB reconnection + reconciliation pass

### Reconciliation
- Runs every 60 seconds per exchange per symbol
- DB=OPEN, exchange=no position → mark IDLE, log as anomaly
- DB=IDLE, exchange=has position → panic close, mark IDLE, alert
- Any mismatch → Slack alert with full context

### Crash recovery sequence
1. Fetch all positions from all exchanges
2. Match against DB tickets
3. Matched: restore OPEN state, verify SL exists on exchange
4. Unmatched (exchange has, DB doesn't): panic close + IDLE
5. Orphaned DB tickets (DB has, exchange doesn't): mark IDLE
6. Resume WATCHING evaluation on next 1H close

## Logging
- Structured JSON logs
- Fields: timestamp, level, module, symbol, exchange, event, details
- Critical events: order execution, SL registration, reconciliation mismatch, crash recovery
- Log rotation: daily, retain 30 days

## Recovery notes
- PostgreSQL: WAL-based point-in-time recovery
- Vector data: rebuildable from candle history (expensive but possible)
- Trade history: append-only tickets table (labels absorbed into Ticket), backed up daily
- Config: managed in CommonCode DB table, seed data version-controlled
