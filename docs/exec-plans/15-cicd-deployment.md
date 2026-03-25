# 15-cicd-deployment

## Objective

Establish a robust CI/CD pipeline and deployment strategy for Combine Trade — a 24/7 crypto trading system managing real funds. Every code change must be validated automatically before it can reach production. Deployment must never interrupt live trading: strategies in progress must reach a safe state before processes are replaced.

## Scope

- GitHub Actions CI pipeline (lint, typecheck, test, build on every PR)
- Automated quality gates: coverage enforcement, sandbox escape tests, performance regression detection
- Container builds: Docker images for API server, workers, web app
- Deployment pipeline: local (laptop) deployment with a clear path to cloud
- Staging → production promotion flow with environment parity
- Semantic versioning and automated changelog generation
- Zero-downtime deployment via graceful shutdown + process supervisor coordination
- Rollback procedure: revert to prior image tag within 2 minutes
- Security in CI: secret scanning, dependency audit, lockfile integrity
- Kill switch integration: deployment gate checks kill switch state before promoting to production

## Non-goals

- Cloud infrastructure provisioning (Kubernetes, ECS, managed DB) — deferred post-MVP
- Multi-region or high-availability distributed deployment
- Blue/green deployment at the load-balancer level (out of scope for single-node MVP)
- CD to a cloud registry before cloud migration is decided
- Monitoring dashboards (covered by EP07-M4 metrics, and future observability EP)
- Database schema migrations as part of automated deploy (migrations are manual-confirmed for safety)

## Prerequisites

- `00-project-bootstrap` M2 — monorepo scaffold with `bun install`, `bun run lint`, `bun run typecheck`, `bun run build`
- `00-project-bootstrap` M4 — first vertical slice with passing `bun test`
- `07-realtime-pipeline` M4 — Docker Compose full stack and `scripts/supervisor.ts` (graceful shutdown)
- `10-auth` M1 — JWT auth foundation (CI must validate auth middleware, not bypass it)
- `09-risk-management` M1 — kill switch state table (deployment gate reads this)

## Milestones

### Phase grouping

- **Phase A — CI foundation** (M1): Automated validation on every PR
- **Phase B — Security gates** (M2): Audit, secret scanning, sandbox escape in CI
- **Phase C — Container pipeline** (M3): Build and tag Docker images
- **Phase D — Deployment** (M4): Local deploy, zero-downtime swap, rollback
- **Phase E — Release management** (M5): Versioning, changelog, promotion flow

---

### M1 — GitHub Actions CI pipeline

- Deliverables:
  - `.github/workflows/ci.yml` — triggered on every PR and push to `main`
  - Jobs (all must pass before merge is permitted):
    1. **lint** — `bun run lint` via Biome; fails on any lint error
    2. **typecheck** — `bun run typecheck` (tsc --noEmit strict mode)
    3. **test:unit** — `bun run test:unit`; coverage collected
    4. **test:integration** — `bun run test:integration` (requires PostgreSQL + pgvector service container)
    5. **build** — `bun run build`; fails if any package does not compile
    6. **coverage-gate** — parse coverage report; fail if `packages/core/*` < 90% or overall < 80%
    7. **performance-regression** — run `bun run bench`; compare against `.harness/benchmarks/baseline.json`; fail on >20% degradation from baseline
  - PostgreSQL + pgvector service container in CI (matches `docker compose` version in EP07)
  - Branch protection rules: require all CI jobs to pass before merge
  - Job concurrency groups: cancel in-progress runs for the same PR on new push (no queue buildup)
  - `.github/dependabot.yml` — weekly Bun/npm dependency updates with auto-PR creation

- Acceptance criteria:
  - A PR with a failing test is blocked from merging
  - A PR that drops `packages/core` coverage below 90% is blocked
  - A PR that degrades any benchmark by >20% is blocked
  - A green PR can be merged without manual CI re-run
  - CI completes in < 10 minutes for a typical PR

- Validation:
  ```bash
  # Trigger manually via CLI or open a test PR
  gh workflow run ci.yml
  gh run list --workflow=ci.yml --limit=5
  gh run view <run-id>
  ```

---

### M2 — Security gates in CI

- Deliverables:
  - `.github/workflows/ci.yml` extended with security jobs:
    1. **audit** — `bun audit`; fails on any `high` or `critical` severity vulnerability
    2. **lockfile-integrity** — verify `bun.lockb` is committed and up-to-date with `package.json` (detect missing lockfile pin)
    3. **secret-scan** — `gitleaks detect --no-git` or GitHub secret scanning integration; fail if secrets are detected in changed files
    4. **sandbox-escape** — `bun test --filter "sandbox-escape"`; dedicated test suite that attempts known sandbox escape patterns; fail if any escape succeeds
    5. **dependency-unused** — lint for unused packages (`depcheck` or equivalent); warn-only (non-blocking for MVP, escalate to blocking post-MVP)
  - `.gitleaks.toml` configuration to allowlist false positives (e.g., test fixture keys, example env values)
  - `scripts/check-lockfile.ts` — verifies `bun.lockb` matches current `package.json` dependency tree
  - CI security job runs on all PRs; also runs on schedule (`cron: '0 3 * * *'`) to catch newly published vulnerabilities

- Acceptance criteria:
  - A PR that introduces a high-severity `bun audit` finding is blocked
  - A PR that omits `bun.lockb` update is blocked
  - A PR that contains a hardcoded secret (API key, JWT secret, webhook URL) is blocked
  - A sandbox escape attempt in test code is caught and blocks the PR
  - Scheduled audit run completes and posts results to GitHub Security tab

- Validation:
  ```bash
  bun audit
  bun test --filter "sandbox-escape"
  # verify gitleaks runs without false positives on repo
  gitleaks detect --no-git --verbose
  ```

---

### M3 — Container image builds

- Deliverables:
  - `Dockerfile.api` — multi-stage Bun image for `apps/api` (Elysia server)
  - `Dockerfile.workers` — multi-stage Bun image for all workers in `workers/`; each worker launched via `CMD` argument (single image, multiple containers)
  - `Dockerfile.web` — Next.js production build image for `apps/web`
  - `.dockerignore` — excludes `.env`, `node_modules`, test files, `.agents/`, `docs/`
  - `.github/workflows/build.yml` — triggers on merge to `main`:
    1. Build all three Docker images
    2. Tag with `git describe --tags --always` (e.g., `v1.2.0-3-gabcdef`)
    3. Also tag `latest` for HEAD of main
    4. Push to local registry (initially: GitHub Container Registry `ghcr.io/<owner>/combine-trade-*`) or skip push for pure-local deploy
  - `docker-compose.prod.yml` — production compose file referencing tagged images (not `build:` directives); separate from `docker-compose.yml` used in dev/EP07
  - Multi-stage build optimization: install dependencies in builder stage, copy only dist in runner stage; final image must not contain dev dependencies or source maps
  - Image size gate: fail build if final API image exceeds 500MB (Bun base image is ~100MB; gate prevents accidental bloat)

- Acceptance criteria:
  - `docker build -f Dockerfile.api .` succeeds and produces a working API image
  - API image starts, passes `GET /api/health`, and exits 0 on `SIGTERM`
  - Workers image starts all workers via supervisor and exits cleanly on `SIGTERM`
  - Final images contain no `.env` file or plaintext secrets
  - Image tag matches `git describe` output (reproducible tagging)

- Validation:
  ```bash
  docker build -f Dockerfile.api -t combine-trade-api:local .
  docker run --rm --env-file .env.test combine-trade-api:local &
  sleep 3 && curl http://localhost:3000/api/health
  docker stop $(docker ps -q --filter ancestor=combine-trade-api:local)
  ```

---

### M4 — Deployment pipeline and zero-downtime swap

- Deliverables:
  - `scripts/deploy.ts` — deployment orchestrator:
    1. Pre-deploy checks:
       - Confirm CI passed for the target commit (`gh run list --commit <sha> --status success`)
       - Query `GET /api/health` on current system; abort if status is not healthy
       - Query kill switch state (`kill_switch_state` table); abort if global kill switch is active (live trading is halted — safe to deploy, but operator must confirm)
       - Confirm no strategies are in `execution_mode = 'live'` with open orders (query `orders` table for `status IN ('submitted', 'partially_filled')`)
    2. Graceful pre-swap:
       - Send `SIGTERM` to the worker supervisor (EP07 `scripts/supervisor.ts`)
       - Wait for clean shutdown confirmation (max 30 seconds — from RELIABILITY.md graceful shutdown spec)
       - If timeout: log `ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT`, abort deploy, keep old version running
    3. Swap:
       - Pull new tagged images
       - `docker compose -f docker-compose.prod.yml up -d` (Docker Compose handles image replacement)
       - Wait for all containers to report healthy (poll `GET /api/health` every 3 seconds, timeout 60 seconds)
    4. Post-deploy verification:
       - `GET /api/health` returns HTTP 200 with all workers alive
       - Candle gap count = 0
       - Pipeline p95 latency < 2 seconds (from health response)
       - All DB LISTEN subscriptions re-established
    5. Rollback on failure: see rollback procedure below
  - `scripts/rollback.ts` — restores previous image tag:
    1. Read previous tag from `scripts/deploy-history.json` (appended on every successful deploy)
    2. `docker compose -f docker-compose.prod.yml` with previous tag
    3. Verify health (same post-deploy check as above)
    4. Alert operator via Slack on rollback completion
  - `scripts/deploy-history.json` — append-only log of deploys: `{ sha, tag, deployed_at, deployed_by, status }`
  - Deployment is **not** automated on merge to main (manual trigger only for MVP — real funds require operator confirmation)

- Acceptance criteria:
  - Deploy script refuses to run if any open live orders exist
  - Deploy script refuses to run if global kill switch is active without operator override flag
  - A deploy that fails health check within 60 seconds triggers automatic rollback
  - Rollback restores the previous version within 2 minutes
  - No candle data is lost during a deploy (candle-collector reconnects and backfills any gap via REST per RELIABILITY.md)
  - Deploy history JSON is updated with outcome on every run

- Validation:
  ```bash
  bun run scripts/deploy.ts --tag v1.0.0 --dry-run
  # dry-run prints all steps without executing swap
  bun run scripts/deploy.ts --tag v1.0.0
  curl http://localhost:3000/api/health
  bun run scripts/rollback.ts
  curl http://localhost:3000/api/health
  ```

---

### M5 — Release management and promotion flow

- Deliverables:
  - `.github/workflows/release.yml` — triggered manually via `workflow_dispatch` with input `version` (semver: `v1.0.0`):
    1. Validate semver format
    2. Run full CI pipeline on `main` HEAD (re-runs, does not trust cached result)
    3. Create annotated git tag `v<version>`
    4. Generate changelog from conventional commits (`git log --oneline <prev_tag>..HEAD`)
    5. Create GitHub Release with changelog as body and Docker image tags in release notes
    6. Push Docker images with the release tag to container registry
  - Conventional commit enforcement: `.github/workflows/pr-lint.yml` — uses `commitlint` or `action-semantic-pull-request` to enforce `feat:`, `fix:`, `chore:`, `security:` prefixes on PR titles (PR title becomes the squash merge commit message)
  - `CHANGELOG.md` — auto-generated from conventional commits on each release; committed to `main` by the release workflow (bot commit, no CI loop)
  - Promotion gate (staging → production):
    - Staging environment = same `docker-compose.prod.yml` on a separate local port (e.g., `3001`) or separate compose project
    - New version is deployed to staging first, soak-tested for at least 1 hour with real market data in `execution_mode = 'analysis'` (no live orders)
    - Operator manually promotes to production using `bun run scripts/deploy.ts --tag v<version> --target production`
    - Promotion is blocked if staging health check is not green
  - `.harness/benchmarks/baseline.json` — updated automatically by the release workflow on each production deploy (captures post-deploy bench results as new baseline)

- Acceptance criteria:
  - A release tag triggers image push to container registry with the correct semver tag
  - `CHANGELOG.md` accurately reflects commits since the previous release
  - A PR with a non-conventional commit title is blocked by PR lint
  - A production promote command rejects if staging health is not green
  - Benchmark baseline is updated after each successful production deploy

- Validation:
  ```bash
  # Trigger release workflow (dry-run or test tag)
  gh workflow run release.yml -f version=v0.0.1-test
  gh run list --workflow=release.yml
  # Verify tag created
  git tag -l | grep v0.0.1-test
  # Verify changelog entry exists
  head -30 CHANGELOG.md
  ```

---

## Task candidates

- T-15-001: Write GitHub Actions CI workflow (lint, typecheck, test:unit, test:integration, build)
- T-15-002: Add coverage gate and performance regression gate to CI (packages/core >= 90%, overall >= 80%, bench vs baseline.json)
- T-15-003: Add security gates to CI (bun audit, lockfile integrity, gitleaks secret scanning, sandbox escape test)
- T-15-004: Write Dockerfile.api (multi-stage, Bun, Elysia)
- T-15-005: Write Dockerfile.workers (multi-stage, all workers via supervisor)
- T-15-006: Write Dockerfile.web (Next.js production build)
- T-15-007: Write docker-compose.prod.yml for tagged image deployment
- T-15-008: Implement deploy script with pre-flight checks, graceful shutdown, and post-deploy health verification
- T-15-009: Implement rollback script with deploy-history.json tracking
- T-15-010: Write release workflow (semver tagging, changelog generation, image push) and conventional commit PR lint workflow
- T-15-011: Document staging soak-test procedure and promotion gate in runbook

## Risks and rollback

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Graceful shutdown timeout during deploy (open orders not draining in 30s) | Medium | High | Deploy script aborts; old version remains live; operator investigates open orders manually |
| CI performance regression false positive (noisy benchmark) | Medium | Low | 20% threshold provides headroom; baseline updated on each production deploy to track real drift |
| Docker image layer cache invalidation inflates build time | Low | Low | Pin Bun base image version; use `--cache-from` in CI build |
| Kill switch active at deploy time (operator forgot to check) | Low | Medium | Deploy script reads kill switch state and requires explicit `--force` flag to override |
| Candle gap during worker restart (< 60 second window) | Low | Low | candle-collector REST backfill repairs gaps within 1 minute per RELIABILITY.md |
| bun.lockb merge conflicts after dependabot PRs | Medium | Low | Merge bot PRs one at a time; lockfile-integrity gate prevents stale lockfiles from reaching main |
| Secrets inadvertently committed in test fixtures | Low | High | gitleaks with `.gitleaks.toml` allowlist runs on every PR |
| Container image bloat (dev deps leaked into final stage) | Low | Low | Image size gate (500MB) catches this before deploy |

### Rollback procedure (abbreviated)

1. Run `bun run scripts/rollback.ts` — restores previous tag from `deploy-history.json`
2. Script pulls previous image, runs `docker compose -f docker-compose.prod.yml up -d`
3. Polls `GET /api/health` until healthy or 60-second timeout
4. On success: appends rollback event to `deploy-history.json`, sends Slack alert
5. On failure: escalate manually — previous image is also broken; restore from backup

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Manual deploy trigger only (no auto-deploy on merge) | Real funds at stake; operator must confirm deployment window; exchange orders must be drained before swap |
| 2026-03-21 | Zero-downtime via graceful shutdown (SIGTERM + 30s drain), not blue/green routing | Single-node MVP; blue/green requires load balancer; SIGTERM approach is sufficient and already defined in RELIABILITY.md |
| 2026-03-21 | Kill switch state check as deploy pre-flight | If kill switch is active, system is in halted state — safe deployment window; but operator must be aware |
| 2026-03-21 | Open live orders block deploy | Swapping the execution-worker mid-fill risks partial fill state corruption; drain is mandatory |
| 2026-03-21 | Single Docker image for all workers (CMD-based dispatch) | Reduces image management overhead at MVP scale; one image build, multiple containers |
| 2026-03-21 | Benchmark baseline stored in .harness/benchmarks/baseline.json | Co-located with code; versioned with codebase; updated on production deploys so baseline tracks real production performance |
| 2026-03-21 | Staging = same machine, different compose project | No cloud budget for MVP; staging on same host with analysis-only mode is sufficient to catch regressions before production |
| 2026-03-21 | Conventional commits enforced on PR title (not body) | Squash merge makes PR title the commit message; enforcing on title is sufficient for changelog generation |
| 2026-03-21 | Coverage gate: packages/core >= 90%, overall >= 80% | QUALITY.md targets; EP15 is the enforcement mechanism |
| 2026-03-21 | Regression threshold: >20% degradation from baseline | QUALITY.md threshold; 20% provides headroom for benchmark noise while catching real regressions |

## Progress notes

- 2026-03-21: EP15 created. No implementation yet. Pending EP00-M2 (monorepo scaffold) and EP07-M4 (Docker Compose) completion before M3 and M4 can begin.
- 2026-03-25: All tasks complete. T-15-001 through T-15-011 in done/. Epic fully implemented.
