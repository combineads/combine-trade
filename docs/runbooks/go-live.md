# Go-Live Runbook — Double-BB Live Deployment

This runbook covers the one-time procedure for activating Double-BB live trading
on Binance Futures. Execute each section in order.

---

## Prerequisites

Before starting, confirm all of the following are true:

- [ ] Readiness score >= 70 for both `Double-BB-LONG` and `Double-BB-SHORT`
      (run `bun run scripts/check-readiness.ts --strategy-name Double-BB-LONG --manual-approved`)
- [ ] Paper trading ran for >= 7 days with >= 10 trades (T-209 complete)
- [ ] Binance Futures account is funded and verified
- [ ] Binance Futures API keys generated with Futures trading permission enabled
- [ ] Two-factor authentication (2FA) enabled on Binance account
- [ ] IP whitelist configured on Binance API key (recommended)

---

## Step 1: Register Exchange Credentials

Register Binance Futures API credentials via the API (AES-256-GCM encrypted at rest).
**Never paste credentials into any terminal, log, or chat.**

```bash
# POST /api/exchange-credentials
# Body: { "exchange": "binance", "apiKey": "<KEY>", "apiSecret": "<SECRET>", "label": "live" }
curl -X POST http://localhost:3000/api/exchange-credentials \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"exchange":"binance","apiKey":"...","apiSecret":"...","label":"live"}'
```

Verify registration:

```bash
curl http://localhost:3000/api/exchange-credentials \
  -H "Authorization: Bearer <JWT>"
# Expected: array with at least one record where exchange = "binance"
```

---

## Step 2: Configure Daily Loss Limit

Set a daily loss limit to protect capital. Recommended starting value: $100–$500 USD.

```bash
# POST /api/daily-loss-limits
# Body: { "limitAmount": "200", "resetHour": 0 }
curl -X POST http://localhost:3000/api/daily-loss-limits \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"limitAmount":"200","resetHour":0}'
```

---

## Step 3: Configure Position Sizing

Ensure position size is set in the strategy `decisionConfig` or `resultConfig`.
Recommended starting value: 1–2% of account balance per trade.

```bash
# PATCH /api/strategies/:id
# Body: { "decisionConfig": { ...existing..., "positionSizePct": 0.01 } }
```

---

## Step 4: Verify Kill Switch State

The kill switch must be **inactive** (trading enabled) before going live.
Confirm it is not active:

```bash
curl http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer <JWT>"
# Expected: { "isActive": false } or no record (defaults to inactive)
```

If active, deactivate:

```bash
curl -X DELETE http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer <JWT>"
```

---

## Step 5: Enable Binance Hedge Mode

Binance Futures hedge mode (`dualSidePosition=true`) allows simultaneous LONG and SHORT positions.
Enable via Binance API or web interface:

1. Log in to Binance Futures
2. Settings → Position Mode → Hedge Mode
3. Confirm activation

Or via API:

```bash
# Binance Futures REST API
POST https://fapi.binance.com/fapi/v1/positionSide/dual
  dualSidePosition=true
  timestamp=<ms>
  signature=<HMAC-SHA256>
```

---

## Step 6: Run the Go-Live Checklist

```bash
bun run scripts/go-live-checklist.ts
```

The script will:

1. Check Binance credentials exist (existence only — values never shown)
2. Compute readiness score (>= 70 required)
3. Verify kill switch is inactive
4. Verify daily loss limit is set and > 0
5. Verify position sizing is configured
6. Print all results with pass/fail indicators
7. If all pass: prompt `Type 'go live' to activate live trading: `
8. On confirmation: set `execution_mode = 'live'` for both strategies

**Type exactly `go live` to confirm.** Any other input cancels without changes.

---

## Post-Go-Live Monitoring

After activation:

- **Slack signals**: First signals should appear within 1 candle close (~15 min for 15m timeframe)
- **Verify order execution**: Check Binance Futures order history for filled orders
- **Monitor PnL**: Check daily PnL via API or dashboard
- **Check positions**: Verify position sizes match configured `positionSizePct`

```bash
# Check strategy execution mode (confirm 'live')
curl http://localhost:3000/api/strategies \
  -H "Authorization: Bearer <JWT>"
# Expected: executionMode = "live" for Double-BB-LONG and Double-BB-SHORT
```

---

## Emergency Rollback

If abnormal behavior is detected, activate the kill switch immediately.
All trading halts within 1 second.

```bash
# Activate kill switch (halts all trading)
curl -X POST http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Emergency rollback — abnormal behavior detected"}'
```

Or revert execution mode to paper:

```bash
# PATCH /api/strategies/:id
# Body: { "executionMode": "paper" }
```

After rollback:
1. Manually close open positions on Binance if needed
2. Investigate logs and Slack alerts
3. Address root cause before re-activating

---

## Checklist Summary

| Step | Action | Command |
|------|--------|---------|
| 1 | Register credentials | POST /api/exchange-credentials |
| 2 | Set daily loss limit | POST /api/daily-loss-limits |
| 3 | Set position size | PATCH /api/strategies/:id |
| 4 | Verify kill switch off | GET /api/kill-switch |
| 5 | Enable hedge mode | Binance UI or API |
| 6 | Run checklist | `bun run scripts/go-live-checklist.ts` |
| 7 | Monitor | Slack + Binance order history |
