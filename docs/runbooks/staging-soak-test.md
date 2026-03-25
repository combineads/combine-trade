# Staging Soak-Test Runbook — Combine Trade

This runbook defines the mandatory procedure for validating a new release in the staging
environment before promoting it to production. Follow every step in order. Do not skip
sections or shorten the soak window.

---

## Purpose and Scope

**Purpose**: Confirm that a new release is stable under real market conditions before it
manages real funds in production.

**Scope**: Applies to every release promoted through the staging environment. A "release"
is any new Docker image tag produced by `docs/runbooks/go-live.md` step 6 or the release
workflow (`.github/workflows/release.yml`).

**Out of scope**: Initial go-live activation (see `docs/runbooks/go-live.md`), database
schema migrations (run manually by the operator before this procedure begins), and
infrastructure provisioning.

---

## Pre-requisites

Confirm all of the following before starting the soak test. Do not proceed if any item
is unchecked.

- [ ] New Docker image tag is built and available (e.g., `v1.2.0`)
       Verify: `docker pull ghcr.io/<owner>/combine-trade-api:<tag>`
- [ ] Staging compose project is configured (separate project from production)
       Verify: `docker compose -p combine-staging -f docker-compose.prod.yml ps`
- [ ] Staging database is migrated to the new schema version
       Run: `bun run db:migrate` (staging DATABASE_URL must be set in staging `.env`)
- [ ] Staging environment variables are set in `.env.staging`
       Required: `DATABASE_URL`, `JWT_SECRET`, `SLACK_WEBHOOK_URL` (staging channel), `EXCHANGE_*`
- [ ] All strategies are in `execution_mode = 'analysis'` in staging — live orders are forbidden
       Verify: `curl http://localhost:3001/api/strategies -H "Authorization: Bearer <JWT>"`
       All strategies must show `"executionMode":"analysis"`
- [ ] Kill switch is inactive in staging
       Verify: `curl http://localhost:3001/api/kill-switch -H "Authorization: Bearer <JWT>"`
       Expected: `{"isActive":false}` or empty (defaults to inactive)
- [ ] Production is running normally — this soak test must not affect production
- [ ] Operator has a 24-hour monitoring window available (alerts enabled)
- [ ] Slack staging alert channel is active and receiving messages

---

## Soak Test Procedure

### Step 1 — Deploy new release to staging

```bash
# Deploy the new image tag to the staging compose project
bun run scripts/deploy.ts --tag v1.2.0 --target staging

# The script will:
# 1. Verify CI passed for the target tag
# 2. Pull new images
# 3. Replace containers (docker compose -p combine-staging up -d)
# 4. Poll GET /api/health every 3 seconds until healthy (60s timeout)
```

Confirm staging is healthy:

```bash
curl http://localhost:3001/api/health
# Expected: HTTP 200, all workers listed as alive, no gap count errors
```

Record the deploy start time: `SOAK_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)`

---

### Step 2 — Confirm analysis-only mode

All strategies in staging must be in analysis mode throughout the entire soak window. Live
orders are not permitted in staging.

```bash
curl http://localhost:3001/api/strategies \
  -H "Authorization: Bearer <JWT>" \
  | jq '.[] | {name: .name, executionMode: .executionMode}'
# Every strategy must show "executionMode": "analysis"
```

If any strategy shows `"live"` or `"paper"`, switch it to analysis before continuing:

```bash
# PATCH /api/strategies/:id
curl -X PATCH http://localhost:3001/api/strategies/<id> \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"executionMode":"analysis"}'
```

---

### Step 3 — Verify pipeline end-to-end

Confirm the full pipeline is processing candle closes in staging:

```bash
# Check that vectors are being written (candle close → vectorization)
curl http://localhost:3001/api/health \
  -H "Authorization: Bearer <JWT>"
# Expected: "pipelineLatencyP95Ms" < 2000, "candleGapCount": 0

# Check Slack staging channel — signals should appear within 1 candle close
# (15 minutes for 15m timeframe, 60 minutes for 1h timeframe)
```

Wait for at least 2 candle closes to confirm the pipeline is processing normally before
starting the 24-hour clock.

---

### Step 4 — Begin 24-hour soak window

Record the official soak start after the first 2 successful candle closes:

```bash
SOAK_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Soak window started: $SOAK_START"
echo "Earliest promotion: $(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+24H +%Y-%m-%dT%H:%M:%SZ)"
```

During the soak window, monitor the health check endpoint every 15 minutes:

```bash
# Run as a monitoring loop (example — adapt to your monitoring setup)
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "$TIMESTAMP health=$STATUS"
  if [ "$STATUS" != "200" ]; then
    echo "ALERT: Health check failed at $TIMESTAMP" | tee -a staging-soak.log
  fi
  sleep 900  # 15 minutes
done
```

Log all health check results to `staging-soak.log` for the promotion gate review.

---

### Step 5 — Collect metrics at intervals

At 4-hour intervals during the soak window, record the following metrics:

```bash
# Health endpoint with full detail
curl -s http://localhost:3001/api/health -H "Authorization: Bearer <JWT>" \
  | jq '{
      timestamp: now | todate,
      pipelineLatencyP99Ms: .pipelineLatencyP99Ms,
      pipelineLatencyP95Ms: .pipelineLatencyP95Ms,
      candleGapCount: .candleGapCount,
      workersAlive: .workers | length,
      errorRateLast1h: .errorRateLast1h
    }'

# Worker process memory (RSS) via Docker
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" \
  $(docker compose -p combine-staging ps -q)
```

Record each snapshot in `staging-soak-metrics.json`:

```json
{
  "soakStart": "<SOAK_START>",
  "snapshots": [
    {
      "timestamp": "2026-03-25T10:00:00Z",
      "pipelineLatencyP99Ms": 420,
      "candleGapCount": 0,
      "workerRssApiMB": 145,
      "workerRssWorkersMB": 210,
      "errorRateLast1h": 0
    }
  ]
}
```

---

### Step 6 — Evaluate promotion gate (after 24 hours)

After the soak window closes, evaluate every criterion in the promotion gate checklist
(see section below). **All criteria must pass.** If any criterion fails, do not promote
and follow the rollback trigger procedure instead.

---

## Health Check Criteria

These thresholds are monitored continuously throughout the soak window. A breach of any
threshold during the soak window is a rollback trigger (see Rollback Triggers section).

| Metric | Threshold | Source |
|--------|-----------|--------|
| HTTP 200 on `GET /api/health` | 100% of checks | Polling every 15 minutes |
| Pipeline candle→decision p99 latency | < 1,000 ms | `health.pipelineLatencyP99Ms` |
| Pipeline candle→decision p95 latency | < 500 ms | `health.pipelineLatencyP95Ms` |
| Candle gap count | 0 at all times | `health.candleGapCount` |
| Worker process count | All workers alive | `health.workers` array length = expected count |
| Error rate (critical / fatal log events) | 0 per hour | Application logs or `health.errorRateLast1h` |
| Container RSS growth over 24 hours | < 50 MB total growth | `docker stats` at 4-hour intervals |

**Memory leak criterion**: Compute RSS growth as `(final RSS) - (initial RSS)` for each
container. If total growth across all containers exceeds 50 MB over 24 hours, this
indicates a memory leak. Do not promote.

---

## Promotion Gate Criteria

All criteria must be satisfied before the operator may promote the release to production.
These are evaluated once after the 24-hour soak window closes.

- [ ] **Soak duration**: Staging ran for >= 24 continuous hours without restart
- [ ] **Zero critical errors**: No `CRITICAL` or `FATAL` log events during the soak window
- [ ] **p99 latency**: Pipeline p99 < 1,000 ms throughout the entire soak window (all snapshots)
- [ ] **No memory leak**: Container RSS growth < 50 MB over 24 hours
- [ ] **No candle gaps**: `candleGapCount = 0` at all 4-hour snapshots
- [ ] **Health check green**: `GET /api/health` returned HTTP 200 on every 15-minute poll
- [ ] **Worker stability**: No worker process restarts during the soak window
- [ ] **Kill switch inactive**: Staging kill switch was never triggered during the soak

Confirm each criterion is met and sign off:

```bash
echo "Promotion gate review — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Operator: <your-name>"
echo "Release tag: <tag>"
echo "Soak start: <SOAK_START>"
echo "Soak end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Review staging-soak-metrics.json and confirm all thresholds met
```

---

## Promoting to Production

Only execute this section after all promotion gate criteria are satisfied.

```bash
# 1. Verify production health before promotion
curl http://localhost:3000/api/health -H "Authorization: Bearer <JWT>"
# Expected: HTTP 200, all workers alive

# 2. Confirm no open live orders in production
curl http://localhost:3000/api/orders?status=submitted \
  -H "Authorization: Bearer <JWT>"
# Expected: empty array — no open orders

# 3. Confirm kill switch is inactive in production
curl http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer <JWT>"
# Expected: {"isActive":false}

# 4. Run the deploy script targeting production
bun run scripts/deploy.ts --tag v1.2.0 --target production

# 5. Confirm production health post-promotion
curl http://localhost:3000/api/health -H "Authorization: Bearer <JWT>"
# Expected: HTTP 200, pipelineLatencyP99Ms < 1000, candleGapCount: 0
```

The deploy script automatically:
- Sends SIGTERM to the worker supervisor and waits for clean shutdown (30s timeout)
- Pulls and swaps containers via `docker compose -f docker-compose.prod.yml up -d`
- Polls `GET /api/health` every 3 seconds (60s timeout)
- Triggers automatic rollback if health check fails within 60 seconds
- Appends the deploy event to `scripts/deploy-history.json`

---

## Post-Promotion Verification

After production promotion completes, verify the following within 30 minutes:

```bash
# 1. Health check passes
curl http://localhost:3000/api/health -H "Authorization: Bearer <JWT>"
# Confirm: HTTP 200, all workers alive, candleGapCount: 0, pipelineLatencyP99Ms < 1000

# 2. Confirm correct image version is running
docker compose -f docker-compose.prod.yml ps
docker inspect combine-trade-api | jq '.[].Config.Image'
# Expected: contains the promoted tag (e.g., v1.2.0)

# 3. Verify pipeline is processing (wait for 1 candle close)
# Check Slack production alert channel — signals should appear within 1 candle close

# 4. Confirm strategies are in their expected execution modes
curl http://localhost:3000/api/strategies \
  -H "Authorization: Bearer <JWT>" \
  | jq '.[] | {name: .name, executionMode: .executionMode}'

# 5. Verify deploy history updated
tail -5 scripts/deploy-history.json | jq .

# 6. Update benchmark baseline
bun run bench
# The deploy script updates .harness/benchmarks/baseline.json automatically on success
```

Monitor production for at least 2 hours post-promotion. Watch Slack for anomalies.

---

## Rollback Triggers

Activate an emergency rollback immediately if any of the following occur at any time
during the soak window or post-promotion monitoring period:

| Trigger | Action |
|---------|--------|
| `GET /api/health` returns non-200 for 2 consecutive checks (30 minutes apart) | Rollback |
| Any `CRITICAL` or `FATAL` log event | Rollback |
| Pipeline p99 latency > 2,000 ms sustained for > 15 minutes | Rollback |
| Candle gap count > 0 for > 15 minutes (no self-recovery) | Rollback |
| Any worker process crashes and does not restart within 60 seconds | Rollback |
| Memory RSS grows > 100 MB in any 4-hour window | Rollback |
| Kill switch activated by the system (daily loss limit breach, etc.) | Rollback |

### Rollback procedure

**Staging rollback** (does not affect production):

```bash
# Restore previous staging image tag
bun run scripts/rollback.ts --target staging

# Verify staging health
curl http://localhost:3001/api/health -H "Authorization: Bearer <JWT>"
```

**Production rollback** (use only if promotion was already completed):

```bash
# Activate kill switch first (halts all trading immediately)
curl -X POST http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Emergency rollback — soak-test anomaly detected post-promotion"}'

# Restore previous image tag
bun run scripts/rollback.ts --target production

# Verify production health
curl http://localhost:3000/api/health -H "Authorization: Bearer <JWT>"

# Deactivate kill switch only after health check passes and root cause is identified
curl -X DELETE http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer <JWT>"
```

After any rollback:
1. Inspect application logs: `docker compose -f docker-compose.prod.yml logs --since 2h`
2. Inspect worker logs: `docker compose -p combine-staging logs workers --since 2h`
3. Document the failure in `staging-soak.log` with timestamp and description
4. Do not re-attempt promotion until root cause is identified and fixed

---

## Troubleshooting

### Health check returns non-200

```bash
# Check container status
docker compose -p combine-staging ps

# Check container logs
docker compose -p combine-staging logs api --tail 100
docker compose -p combine-staging logs workers --tail 100

# Check database connectivity
docker compose -p combine-staging exec api bun run scripts/check-db.ts 2>/dev/null \
  || curl http://localhost:3001/api/health -v
```

### Pipeline p99 latency is elevated (> 1s)

```bash
# Check DB query performance
docker compose -p combine-staging exec postgres \
  psql -U postgres -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check vector search latency (should be < 200ms for L2 search)
# Review logs for slow-query warnings
docker compose -p combine-staging logs workers --since 30m | grep "slow"

# Check if HNSW index needs reindexing
# (Run reindex only if vector table was bulk-loaded without index)
```

### Memory growing faster than expected

```bash
# Inspect per-container memory over time
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Check for DB connection leaks (common cause of memory growth)
docker compose -p combine-staging exec postgres \
  psql -U postgres -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
# Expected: no large count of 'idle in transaction' connections
```

### Candle gaps appearing

```bash
# Check candle-collector worker
docker compose -p combine-staging logs candle-collector --tail 50

# Candle-collector automatically backfills gaps via REST
# If gaps persist > 15 minutes, the backfill is failing:
curl http://localhost:3001/api/health \
  -H "Authorization: Bearer <JWT>" \
  | jq '.candleGapCount'

# Force a manual backfill (if the worker exposes this endpoint)
curl -X POST http://localhost:3001/api/candles/backfill \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","since":"2026-03-25T00:00:00Z"}'
```

### Staging Slack alerts not appearing

```bash
# Verify Slack webhook is configured in staging env
docker compose -p combine-staging exec workers env | grep SLACK

# Test Slack connectivity manually
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text":"Staging soak-test connectivity check"}'
# Expected: HTTP 200, "ok"
```

### Deploy script times out during staging promotion

```bash
# Check if worker supervisor shut down cleanly
docker compose -p combine-staging logs workers --tail 20

# If shutdown timed out, manually stop and redeploy
docker compose -p combine-staging stop workers
bun run scripts/deploy.ts --tag v1.2.0 --target staging
```

---

## Soak Test Sign-Off Template

Copy and complete this template when the soak window closes and promotion gate is
evaluated. Store the signed-off copy in `staging-soak.log`.

```
STAGING SOAK-TEST SIGN-OFF
===========================
Release tag:          v<x.y.z>
Soak start (UTC):     <timestamp>
Soak end (UTC):       <timestamp>
Duration (hours):     <N> (must be >= 24)
Operator:             <name>

PROMOTION GATE CHECKLIST
[ ] Soak duration >= 24 hours
[ ] Zero critical/fatal errors
[ ] p99 latency < 1,000 ms (all snapshots)
[ ] Memory RSS growth < 50 MB over 24 hours
[ ] No candle gaps at any 4-hour snapshot
[ ] Health check green on all 15-minute polls
[ ] No worker restarts during soak window
[ ] Kill switch never triggered during soak

DECISION: [ ] PROMOTE  [ ] DO NOT PROMOTE

Reason (if not promoting):
<explain root cause>

Attachments:
- staging-soak-metrics.json
- staging-soak.log
```

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-25 | Implementer | Initial version — T-15-011 |
