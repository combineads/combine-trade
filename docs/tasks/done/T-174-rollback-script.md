# T-174 Rollback script with deploy-history.json tracking

## Implementation Notes

- `scripts/rollback.ts` implemented with full TDD cycle (RED → GREEN → REFACTOR).
- All core logic exported as pure functions: `parseRollbackArgs`, `getPreviousSuccessfulTag`, `buildRollbackRecord`, `evaluatePostRollbackHealth`, `buildRollbackPlan`.
- Re-uses types and constants from `scripts/deploy.ts` (`DeployRecord`, `HEALTH_URL`, `DOCKER_COMPOSE_FILE`, `POST_DEPLOY_PIPELINE_P95_LIMIT_MS`, `appendDeployEntry`) to avoid duplication.
- `getPreviousSuccessfulTag` accepts an optional `overrideTag` (CLI `--target-tag`) as the third argument; when provided, it returns it directly. When absent, it scans history in reverse skipping the current tag.
- `RollbackRecord` has `sha: null` (no code commit on rollback) and `rolled_back_from` field per task spec.
- Exit codes: 1 = no previous deploy, 2 = docker swap failed, 3 = health check timeout.
- `DEPLOY_HISTORY_PATH` can be overridden via `DEPLOY_HISTORY_PATH` env var (enables integration testing with a mock file).
- Slack alert is conditional on `SLACK_WEBHOOK_URL`; failure to notify never aborts rollback.
- `--dry-run` prints full plan and exits 0 without touching Docker or history.
- 30 unit tests; `bun run typecheck` passes clean.

## Outputs

- `scripts/rollback.ts`
- `scripts/__tests__/rollback.test.ts` (30 tests, all passing)

## Goal
Implement `scripts/rollback.ts` that reads the previous successful image tag from `scripts/deploy-history.json`, brings up that tag via `docker compose -f docker-compose.prod.yml up -d`, verifies system health, and appends the rollback event to the history log. Rollback must restore the previous version within 2 minutes.

## Why
In a live trading system, a bad deploy must be reversible within minutes. Without an automated rollback script, an operator under pressure must manually reconstruct the previous compose configuration, remember the previous image tag, and issue docker commands correctly — all while the system is potentially in a broken state. The rollback script makes recovery a single command with a guaranteed audit trail.

## Inputs
- `scripts/deploy-history.json` (T-173 output) — source of the previous successful image tag
- `docker-compose.prod.yml` (T-172 output) — the compose file used for the image swap
- `docs/exec-plans/15-cicd-deployment.md` § M4 — rollback script spec (read previous tag, health verify, Slack alert, append history)
- `GET /api/health` — health endpoint for post-rollback verification
- `docs/RELIABILITY.md` — 2-minute rollback target

## Dependencies
- T-173 (`scripts/deploy-history.json` format defined by deploy script; rollback.ts reads it)

## Expected Outputs
- `scripts/rollback.ts` — rollback orchestrator
- `scripts/__tests__/rollback.test.ts` — unit tests for rollback logic

## Deliverables

### `scripts/rollback.ts` — CLI interface
```
bun run scripts/rollback.ts [--target-tag <tag>] [--dry-run]
```
- `--target-tag`: optional; override which tag to roll back to (default: most recent `"status": "success"` entry before current deploy)
- `--dry-run`: print steps without executing Docker commands or writing to history log

### Rollback procedure (matches epic spec)
1. **Read previous tag**: parse `scripts/deploy-history.json` — find the most recent entry with `"status": "success"` that is not the currently running version
2. **Pull previous image**: `docker compose -f docker-compose.prod.yml pull` with previous tag set in environment
3. **Swap containers**: `TAG=<previous-tag> docker compose -f docker-compose.prod.yml up -d`
4. **Verify health**: poll `GET /api/health` every 3 seconds, up to 60-second timeout
5. **On health success**: append rollback event to `deploy-history.json`, send Slack alert (optional at MVP — log if SLACK_WEBHOOK_URL env is set)
6. **On health failure**: log `ERR_ROLLBACK_HEALTH_FAILED` — escalate manually; previous image may also be broken

### `deploy-history.json` rollback entry format
```json
{
  "sha": null,
  "tag": "v0.9.0",
  "deployed_at": "2026-03-23T10:05:00Z",
  "deployed_by": "rollback",
  "status": "rolled_back",
  "rolled_back_from": "v1.0.0"
}
```

### `scripts/rollback.ts` exit codes
| Exit code | Meaning |
|-----------|---------|
| 0 | Rollback succeeded and health check passed |
| 1 | No previous successful deploy found in history |
| 2 | Docker swap failed |
| 3 | Post-rollback health check timed out |

### Slack alert (conditional)
```typescript
// Only sends if SLACK_WEBHOOK_URL is set in environment
if (process.env.SLACK_WEBHOOK_URL) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({
      text: `Rollback complete: ${rolledBackFrom} → ${previousTag} at ${new Date().toISOString()}`,
    }),
  });
}
```

## Constraints
- Script must complete the full rollback (pull → swap → health verified) within 2 minutes total
- `scripts/deploy-history.json` must be append-only — never modify or delete existing entries
- `--dry-run` must not execute any Docker commands or write to history
- Script exits with non-zero code on any failure condition (see exit codes above)
- Slack alert is optional (conditional on `SLACK_WEBHOOK_URL` env) — absence must not cause script failure
- Script must be runnable without IoC container or AOP infrastructure (standalone script)
- If history file is absent or empty, script exits 1 with clear message: `No deploy history found — cannot rollback`

## Steps
1. Write failing tests: no history → exit 1, valid history → selects most recent success entry (RED)
2. Write failing test: `--dry-run` produces no Docker calls and no history write (RED)
3. Write failing test: health check timeout → exits with code 3 (RED)
4. Implement history parsing logic — find previous successful tag (GREEN)
5. Implement Docker swap and health poll loop (GREEN)
6. Implement history append and conditional Slack alert (GREEN)
7. Wire CLI flags: `--target-tag`, `--dry-run` (GREEN)
8. Validate timing: `--dry-run` log shows expected 2-minute budget is achievable (REFACTOR)
9. Run full validation

## Acceptance Criteria
- `bun run scripts/rollback.ts --dry-run` prints all rollback steps without executing Docker commands
- Script exits 1 when `deploy-history.json` is absent
- Script exits 1 when no previous successful deploy entry exists in history
- Script correctly identifies the most recent `"status": "success"` entry as the rollback target
- After successful rollback, `deploy-history.json` has a new entry with `"status": "rolled_back"`
- `rolled_back_from` field in history captures the tag being replaced
- Slack alert is sent when `SLACK_WEBHOOK_URL` is set; script does not fail if not set
- `bun run typecheck` passes

## Validation
```bash
bun test scripts/__tests__/rollback.test.ts
bun run typecheck

# Dry-run with a mock history file
echo '[{"sha":"abc","tag":"v0.9.0","deployed_at":"2026-01-01T00:00:00Z","deployed_by":"test","status":"success"},{"sha":"def","tag":"v1.0.0","deployed_at":"2026-01-02T00:00:00Z","deployed_by":"test","status":"success"}]' \
  > /tmp/test-history.json
DEPLOY_HISTORY_PATH=/tmp/test-history.json bun run scripts/rollback.ts --dry-run

# Integration: requires docker-compose.prod.yml and running local stack
bun run scripts/rollback.ts --dry-run
bun run scripts/rollback.ts
curl http://localhost:3000/api/health
cat scripts/deploy-history.json
```

## Out of Scope
- Deploy script — T-173
- Automatic rollback trigger during deploy — T-173 calls `rollback.ts` when post-deploy health fails (import relationship)
- Database state rollback — only image rollback is in scope; DB schema migrations are manual-confirmed
- Blue/green routing rollback — single-node MVP; image swap is sufficient
- Full observability dashboard for rollback events — deferred to future observability epic
