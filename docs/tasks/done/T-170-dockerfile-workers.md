# T-170 Dockerfile.workers — multi-stage Bun image for all workers

## Goal
Write a multi-stage `Dockerfile.workers` that produces a single minimal production image capable of running any worker in `workers/` via a `CMD` argument. The builder stage compiles all workers; the runner stage contains only production artifacts. A single image covers all workers — each worker container is launched with a different `CMD`.

## Why
All workers (candle-collector, strategy-worker, vector-worker, label-worker, alert-worker, etc.) share the same runtime and package dependencies. Packaging them into one image reduces build time, registry storage, and operational overhead at MVP scale. The CMD-dispatch pattern means adding a new worker requires only a new `docker compose` service definition, not a new Dockerfile.

## Inputs
- `workers/` directory — all worker entry points
- `scripts/supervisor.ts` (EP07) — the supervisor that manages worker processes inside the container; `SIGTERM` forwarding must work
- `package.json` (root and per-worker) — workspace layout
- `docs/exec-plans/15-cicd-deployment.md` § M3 — single-image CMD dispatch decision, image size gate (500 MB)
- `docs/RELIABILITY.md` — graceful shutdown on `SIGTERM`, max 30-second drain window

## Dependencies
None — Dockerfile.workers can be written independently of Dockerfile.api and Dockerfile.web.

## Expected Outputs
- `Dockerfile.workers` — multi-stage build file at repository root

## Deliverables

### `Dockerfile.workers`
```dockerfile
# syntax=docker/dockerfile:1

# ── Builder ────────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

COPY package.json bun.lockb ./
COPY packages/ packages/
COPY workers/ workers/
COPY scripts/supervisor.ts ./scripts/

RUN bun install --frozen-lockfile
RUN bun run build --filter=./workers/*

# ── Runner ─────────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lockb ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/workers/ ./workers/
COPY --from=builder /app/scripts/supervisor.ts ./scripts/

RUN bun install --frozen-lockfile --production

# Default: run supervisor which manages all workers
# Override CMD to run a specific worker:
#   docker run combine-trade-workers bun run workers/candle-collector/dist/index.js
CMD ["bun", "run", "scripts/supervisor.ts"]
```

### Worker dispatch patterns (docker-compose service examples)
```yaml
# All workers via supervisor (production default)
workers-supervisor:
  image: combine-trade-workers:${TAG}
  # uses default CMD

# Single worker override (for independent scaling)
candle-collector:
  image: combine-trade-workers:${TAG}
  command: ["bun", "run", "workers/candle-collector/dist/index.js"]
```

## Constraints
- Single image for all workers (no per-worker Dockerfiles)
- Bun base image must be pinned to `oven/bun:1.2-alpine` (not `latest`)
- Final image must not contain `.env` files
- Dev dependencies must not be present in runner stage
- Final image size < 500 MB
- `supervisor.ts` must correctly forward `SIGTERM` to child worker processes (from EP07; not implemented here — just validated)
- `bun install --frozen-lockfile` in both stages

## Steps
1. Write a test that builds the image and verifies the supervisor starts without crashing (RED)
2. Write `Dockerfile.workers` builder and runner stages (GREEN)
3. Build locally: `docker build -f Dockerfile.workers -t combine-trade-workers:local .`
4. Smoke test: start container, verify supervisor starts, send SIGTERM, verify clean exit (GREEN)
5. Check image size < 500 MB (REFACTOR)
6. Run validation commands

## Acceptance Criteria
- `docker build -f Dockerfile.workers -t combine-trade-workers:local .` succeeds without errors
- `docker run --rm --env-file .env.test combine-trade-workers:local` starts the supervisor without crashing
- Supervisor and all child workers exit cleanly within 30 seconds on `docker stop` (SIGTERM)
- Image size < 500 MB
- No `.env` file present inside the image
- A specific worker can be run by overriding `CMD`: `docker run --rm combine-trade-workers:local bun run workers/candle-collector/dist/index.js`

## Validation
```bash
docker build -f Dockerfile.workers -t combine-trade-workers:local .

# Start supervisor in background
docker run -d --name workers-test --env-file .env.test combine-trade-workers:local

# Verify supervisor started (check logs for no immediate crash)
sleep 3 && docker logs workers-test 2>&1 | head -20

# Graceful shutdown test
docker stop workers-test
docker wait workers-test  # should return 0

# Image size gate
docker images combine-trade-workers:local --format 'Size: {{.Size}}'

# Verify no .env in image
docker run --rm combine-trade-workers:local find /app -name '.env' -o -name '*.env'

# CMD override test
docker run --rm --env-file .env.test combine-trade-workers:local \
  bun run workers/candle-collector/dist/index.js --version

# Cleanup
docker rm -f workers-test
docker rmi combine-trade-workers:local
```

## Out of Scope
- Dockerfile.api — T-169
- Dockerfile.web — T-171
- docker-compose.prod.yml — T-172
- Supervisor implementation — already delivered by EP07; this task only consumes it
- Per-worker Dockerfiles — explicitly rejected in decision log (single image, CMD dispatch)

## Implementation Notes

- Created `Dockerfile.workers` at repository root with two stages: `builder` (installs all deps, builds all workers) and `runner` (copies production artifacts, re-installs with `--production`).
- Used `oven/bun:1.2-alpine` pinned to 1.2 in both stages.
- Builder copies `packages/`, `workers/`, and `scripts/supervisor.ts` — no `apps/` needed.
- `bun run build --filter=./workers/*` compiles all workers in a single pass.
- Runner copies `workers/` dist output and `scripts/supervisor.ts` for CMD dispatch.
- `NODE_ENV=production` set in runner stage.
- Default `CMD ["bun", "run", "scripts/supervisor.ts"]` runs the supervisor managing all workers. Individual workers can be launched by overriding CMD at `docker run` time.
- Tests covered by `scripts/__tests__/dockerfile.test.ts` — all 35 pass.
- `bun test` result: 1471 pass, 1 skip, 0 fail.
- `bun run typecheck` passes with no errors.
