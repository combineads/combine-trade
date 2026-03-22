# T-173 Deploy script with pre-flight checks and graceful shutdown

## Goal
Implement `scripts/deploy.ts` — an operator-run deployment orchestrator that: (1) runs pre-flight safety checks, (2) gracefully drains the current system via SIGTERM, (3) swaps in the new tagged images via `docker compose -f docker-compose.prod.yml up -d`, and (4) performs post-deploy health verification. Any failure at any stage aborts the deploy and keeps the old version running.

## Why
Combine Trade manages real funds and executes live orders. Deploying while open orders exist or while the kill switch is active risks partial fill state corruption or deploying into a halted system without operator awareness. The deploy script makes the procedure explicit, automated, and safe: no deploy can succeed without a healthy pre-state, a clean shutdown, and a healthy post-state. Operator confirmation is still required (no auto-deploy on merge) because real funds are at stake.

## Inputs
- `docker-compose.prod.yml` (T-172 output) — the compose file used for the swap
- `scripts/supervisor.ts` (EP07) — receives SIGTERM to trigger graceful worker shutdown
- `docs/exec-plans/15-cicd-deployment.md` § M4 — full deploy script spec including pre-flight, drain, swap, and health check steps
- `docs/RELIABILITY.md` — graceful shutdown spec (30-second drain window)
- `db/schema/kill-switch.ts` (T-053) — kill_switch_state table schema
- `db/schema/orders.ts` (T-003) — orders table schema for open order check
- `GET /api/health` — health endpoint for pre-deploy and post-deploy verification

## Dependencies
- T-172 (`docker-compose.prod.yml` must exist — deploy script calls `docker compose -f docker-compose.prod.yml up -d`)

## Expected Outputs
- `scripts/deploy.ts` — deployment orchestrator
- `scripts/deploy-history.json` — append-only deploy log (created on first deploy if absent)
- `scripts/__tests__/deploy.test.ts` — unit tests for pre-flight check logic

## Deliverables

### `scripts/deploy.ts` — CLI interface
```
bun run scripts/deploy.ts --tag <image-tag> [--dry-run] [--force-kill-switch]
```
- `--tag`: required; the image tag to deploy (e.g., `v1.2.0-3-gabcdef`)
- `--dry-run`: print all steps and checks without executing the swap
- `--force-kill-switch`: allow deploy to proceed even if global kill switch is active (requires explicit flag)

### Pre-flight checks (step 1)
1. **CI passed**: `gh run list --commit <current-sha> --status success` — abort if no green CI run for HEAD
2. **System health**: `GET http://localhost:3000/api/health` — abort if not HTTP 200
3. **Kill switch state**: query `kill_switch_state` table — abort if `global_halt = true` (unless `--force-kill-switch` passed; log warning either way)
4. **No open live orders**: query `orders` table for `status IN ('submitted', 'partially_filled')` with strategy `execution_mode = 'live'` — abort if any found

### Graceful shutdown (step 2)
1. Send `SIGTERM` to the worker supervisor process
2. Poll for clean shutdown every 2 seconds, up to 30-second timeout
3. If timeout: log `ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT`, abort deploy, keep old version running

### Image swap (step 3)
1. Pull new tagged images: `docker compose -f docker-compose.prod.yml pull`
2. Set `TAG=<new-tag>` in environment
3. `docker compose -f docker-compose.prod.yml up -d` to replace containers
4. Wait for containers to report healthy (poll `GET /api/health` every 3 seconds, 60-second timeout)

### Post-deploy verification (step 4)
1. `GET /api/health` returns HTTP 200 with all workers reported alive
2. Candle gap count = 0 (from health response `candle_gaps` field)
3. Pipeline p95 latency < 2 seconds (from health response `pipeline_p95_ms` field)
4. If any check fails: auto-trigger rollback (read previous tag from `deploy-history.json`)

### `scripts/deploy-history.json` — append-only log
```json
[
  {
    "sha": "abc123",
    "tag": "v1.0.0",
    "deployed_at": "2026-03-23T10:00:00Z",
    "deployed_by": "operator",
    "status": "success"
  }
]
```
- Appended on every deploy attempt (including failures)
- `status`: `"success"` | `"failed"` | `"rolled_back"`

### Error codes used in logs
| Code | Meaning |
|------|---------|
| `ERR_PREFLIGHT_CI_NOT_GREEN` | No passing CI run for commit |
| `ERR_PREFLIGHT_UNHEALTHY` | Current system health check failed |
| `ERR_PREFLIGHT_KILL_SWITCH_ACTIVE` | Global kill switch is active |
| `ERR_PREFLIGHT_OPEN_ORDERS` | Open live orders exist |
| `ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT` | Worker drain timed out |
| `ERR_POSTDEPLOY_UNHEALTHY` | New version failed health check |

## Constraints
- Script is operator-run only — no auto-trigger on merge
- `--dry-run` must not execute any Docker commands or write to `deploy-history.json`
- Script must exit with non-zero code on any abort condition
- All monetary queries must use Drizzle ORM (not raw SQL strings)
- All DB queries go through the existing repository layer (no direct DB access in deploy script)
- `deploy-history.json` must be append-only — never overwrite existing entries
- Deploy script must be readable without deep framework knowledge (no AOP, no IoC in this script)

## Steps
1. Write failing tests for each pre-flight check: unhealthy system → abort, open orders → abort, active kill switch without `--force` → abort, CI not green → abort (RED)
2. Write failing test for graceful shutdown timeout → abort with error code (RED)
3. Implement pre-flight check functions (GREEN)
4. Implement graceful shutdown poller (GREEN)
5. Implement image swap and post-deploy health check (GREEN)
6. Implement `deploy-history.json` append logic (GREEN)
7. Wire all steps with `--dry-run` and `--force-kill-switch` flag support (GREEN)
8. Run `--dry-run` against local stack to verify step output (REFACTOR)
9. Run full validation

## Acceptance Criteria
- `bun run scripts/deploy.ts --tag v1.0.0 --dry-run` prints all steps without executing any Docker command
- Script aborts with `ERR_PREFLIGHT_OPEN_ORDERS` when open live orders exist (unit test passes)
- Script aborts with `ERR_PREFLIGHT_KILL_SWITCH_ACTIVE` when kill switch is active and `--force-kill-switch` not passed
- Script aborts with `ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT` when drain exceeds 30 seconds
- Successful deploy appends a `"status": "success"` entry to `deploy-history.json`
- Failed deploy appends a `"status": "failed"` entry to `deploy-history.json`
- Post-deploy verification checks `/api/health` and triggers rollback if it fails
- `bun run typecheck` passes

## Validation
```bash
bun test scripts/__tests__/deploy.test.ts
bun run typecheck

# Dry-run against local stack (requires docker-compose.prod.yml)
bun run scripts/deploy.ts --tag v1.0.0 --dry-run

# Full integration (requires running local prod stack)
bun run scripts/deploy.ts --tag v1.0.0
curl http://localhost:3000/api/health
cat scripts/deploy-history.json | bun x js-yaml
```

## Out of Scope
- Rollback script — T-174 (deploy script calls rollback on post-deploy failure, but rollback.ts is implemented in T-174)
- Staging deploy and promotion gate — T-175 (release workflow)
- Slack alert on deploy success/failure — referenced in rollback spec; can be added post-MVP
- Database migration execution — migrations are manual-confirmed for safety per non-goals
- Cloud registry push — deferred until cloud migration
