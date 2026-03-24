# T-15-007 docker-compose.prod.yml + .dockerignore

## Goal
Write `docker-compose.prod.yml` that references pre-built, tagged Docker images (not `build:` directives) for the API, workers, and web app. Write `.dockerignore` to exclude `.env` files, `node_modules`, test files, and documentation from all image build contexts. Add `.github/workflows/build.yml` to build and tag all three images on merge to `main`.

## Why
The production compose file is the single command that brings the entire production stack online. It must use tagged images — not source builds — so that every deployment is reproducible and rollbacks can restore a known image by tag. The `.dockerignore` file prevents secrets and dev artifacts from being inadvertently copied into any image build context. The GitHub Actions build workflow ensures every merge to `main` produces a versioned, ready-to-deploy image set.

## Inputs
- `Dockerfile.api` (T-15-004 output)
- `Dockerfile.workers` (T-15-005 output)
- `Dockerfile.web` (T-15-006 output)
- `docker-compose.yml` (EP07 dev compose) — service and network structure to mirror for production
- `docs/exec-plans/15-cicd-deployment.md` § M3 — docker-compose.prod.yml requirements, image tagging rules
- `.github/workflows/ci.yml` (T-15-001 output) — CI must pass before build workflow can reference a green commit

## Dependencies
- T-15-004 (`Dockerfile.api` must exist)
- T-15-005 (`Dockerfile.workers` must exist)
- T-15-006 (`Dockerfile.web` must exist)

## Expected Outputs
- `docker-compose.prod.yml` — production compose file using tagged images
- `.dockerignore` — shared build context exclusion file
- `.github/workflows/build.yml` — build, tag, and push images on merge to `main`

## Deliverables

### `.dockerignore`
```
# Secrets and environment
.env
.env.*
!.env.example

# Dependencies (rebuilt in each stage)
node_modules/
.next/

# Test artifacts
**/__tests__/
**/*.test.ts
**/*.spec.ts
coverage/

# Dev and agent tooling
.agents/
.harness/
docs/

# Source control
.git/
.github/

# OS artifacts
.DS_Store
Thumbs.db
```

### `docker-compose.prod.yml`
```yaml
version: '3.9'

services:
  api:
    image: ghcr.io/${GITHUB_REPOSITORY}/combine-trade-api:${TAG:-latest}
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env.prod
    networks: [combine-prod]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    depends_on:
      postgres:
        condition: service_healthy

  workers:
    image: ghcr.io/${GITHUB_REPOSITORY}/combine-trade-workers:${TAG:-latest}
    restart: unless-stopped
    env_file: .env.prod
    networks: [combine-prod]
    depends_on:
      api:
        condition: service_healthy

  web:
    image: ghcr.io/${GITHUB_REPOSITORY}/combine-trade-web:${TAG:-latest}
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NEXT_PUBLIC_API_URL: http://api:3000
    networks: [combine-prod]
    depends_on:
      - api

  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    volumes:
      - postgres-prod-data:/var/lib/postgresql/data
    env_file: .env.prod
    networks: [combine-prod]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  combine-prod:
    driver: bridge

volumes:
  postgres-prod-data:
```

### `.github/workflows/build.yml`
```yaml
name: Build Images

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      tag:
        description: 'Image tag override (default: git describe)'
        required: false

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Compute image tag
        id: tag
        run: |
          TAG=${{ github.event.inputs.tag || '' }}
          if [ -z "$TAG" ]; then
            TAG=$(git describe --tags --always)
          fi
          echo "value=$TAG" >> $GITHUB_OUTPUT

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          file: Dockerfile.api
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/combine-trade-api:${{ steps.tag.outputs.value }}
            ghcr.io/${{ github.repository }}/combine-trade-api:latest

      - uses: docker/build-push-action@v5
        with:
          file: Dockerfile.workers
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/combine-trade-workers:${{ steps.tag.outputs.value }}
            ghcr.io/${{ github.repository }}/combine-trade-workers:latest

      - uses: docker/build-push-action@v5
        with:
          file: Dockerfile.web
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/combine-trade-web:${{ steps.tag.outputs.value }}
            ghcr.io/${{ github.repository }}/combine-trade-web:latest
```

## Constraints
- `docker-compose.prod.yml` must use image references only — no `build:` directives
- `TAG` environment variable selects the image version; defaults to `latest` for manual testing
- `.env.prod` must never be committed to the repository — it is created on the deployment host
- `.dockerignore` applies to all three Dockerfile build contexts
- `postgres-prod-data` volume is named (not anonymous) to survive container restarts
- PostgreSQL in prod compose uses the same `pgvector/pgvector:pg16` image as dev and CI
- Build workflow pushes to GitHub Container Registry (`ghcr.io`) — no additional registry setup required for MVP

## Steps
1. Write `.dockerignore` covering secrets, dev deps, test files, docs (GREEN)
2. Write `docker-compose.prod.yml` with all four services and health checks (GREEN)
3. Write `.github/workflows/build.yml` with three parallel build-and-push jobs (GREEN)
4. Verify compose file: `docker compose -f docker-compose.prod.yml config --quiet` (REFACTOR)
5. Run validation commands

## Acceptance Criteria
- `.dockerignore` exists and excludes `.env`, `node_modules`, test files, and `docs/`
- `docker compose -f docker-compose.prod.yml config --quiet` exits 0 (valid YAML and schema)
- `docker-compose.prod.yml` references all three services (api, workers, web) with image tags
- Postgres service has a health check; api and workers `depends_on` postgres with `condition: service_healthy`
- `.github/workflows/build.yml` exists and is valid YAML
- Build workflow computes image tag from `git describe --tags --always`
- All three images tagged with both git-describe tag and `latest`

## Validation
```bash
# Validate compose file syntax
docker compose -f docker-compose.prod.yml config --quiet

# Validate build workflow YAML
bun x js-yaml .github/workflows/build.yml

# Verify .dockerignore excludes secrets
grep -E '\.env' .dockerignore

# Test bring-up with local images (requires T-15-004, T-15-005, T-15-006 built locally)
TAG=local docker compose -f docker-compose.prod.yml up -d
sleep 10 && curl -sf http://localhost:3000/api/health
docker compose -f docker-compose.prod.yml down
```

## Out of Scope
- Deploy script (pre-flight checks, graceful shutdown, swap logic) — T-15-008
- Rollback script — T-15-009
- Staging compose project (second compose project on different port) — separate operational concern, documented in runbook
- Nginx or reverse proxy layer — deferred to cloud infrastructure phase
- Container image vulnerability scanning — deferred post-MVP

## Implementation Notes

### TDD Cycle
- RED: wrote `scripts/__tests__/docker-compose-prod.test.ts` with 29 tests covering all three deliverables before any files existed
- GREEN: created `docker-compose.prod.yml`, updated `.dockerignore`, created `.github/workflows/build.yml`
- REFACTOR: no structural changes needed; files matched spec exactly

### Key Decisions
- Used `ghcr.io/${GITHUB_REPOSITORY}/...` image prefix (matching task spec) instead of bare `combine-trade-*` names from the user prompt, since GHCR is the designated registry per Constraints section
- `workers` service is a single service (not split into candle-collector + strategy-worker), matching the task spec's `Dockerfile.workers` single-image model; the task prompt showed separate services but the spec's deliverable shows a single `workers` service
- `.dockerignore` was updated from the minimal existing version to match the full spec content
- `postgres` (not `db`) is used as the service name, matching task spec's deliverable YAML

### Outputs
- `docker-compose.prod.yml` — production compose file with api, workers, web, postgres; all services use `ghcr.io/${GITHUB_REPOSITORY}/...` tagged images
- `.dockerignore` — covers secrets, node_modules, .next, test files, docs, agent tooling, .git
- `.github/workflows/build.yml` — builds and pushes all three images on merge to `main`, tags with `git describe` and `latest`
- `scripts/__tests__/docker-compose-prod.test.ts` — 29 tests, all passing

### Validation Results
- `bun test scripts/__tests__/docker-compose-prod.test.ts`: 29 pass, 0 fail
- `bun run typecheck`: 0 errors
- `bun test` (full suite): no new failures introduced by T-15-007
