# T-15-004 Dockerfile.api — multi-stage Bun image for Elysia API

## Goal
Write a multi-stage `Dockerfile.api` that produces a minimal production image for `apps/api` (the Elysia server). The builder stage installs all dependencies and builds the API package. The runner stage copies only the compiled output and production dependencies, keeping the final image under 500 MB.

## Why
Containerising the API server is required for the production deployment model described in EP15. Without a Dockerfile, the deploy script (T-15-008) cannot pull a versioned image and swap it in. Multi-stage builds keep image size small and ensure dev dependencies and source maps never reach production.

## Inputs
- `apps/api/` — Elysia API source code
- `package.json` (root and `apps/api/`) — workspace layout and build scripts
- `docs/exec-plans/15-cicd-deployment.md` § M3 — Dockerfile.api requirements and image size gate (500 MB)
- `docs/ARCHITECTURE.md` — apps/api package structure
- `docs/RELIABILITY.md` — graceful shutdown on `SIGTERM` (must be handled in the image entrypoint)

## Dependencies
None — Dockerfile.api can be written independently of Dockerfile.workers and Dockerfile.web.

## Expected Outputs
- `Dockerfile.api` — multi-stage build file at repository root
- `.dockerignore` (or confirm it covers api-relevant exclusions — shared with T-15-007)

## Deliverables

### `Dockerfile.api`
```dockerfile
# syntax=docker/dockerfile:1

# ── Builder ────────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# Install all dependencies (including dev) for the build step
COPY package.json bun.lockb ./
COPY packages/ packages/
COPY apps/api/ apps/api/
COPY workers/ workers/

RUN bun install --frozen-lockfile

# Build the API package
RUN bun run build --filter=./apps/api

# ── Runner ─────────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production-relevant artifacts from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lockb ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/api/dist/ ./apps/api/dist/
COPY --from=builder /app/apps/api/package.json ./apps/api/

RUN bun install --frozen-lockfile --production

EXPOSE 3000

# Graceful shutdown: Bun forwards SIGTERM to the process
CMD ["bun", "run", "apps/api/dist/index.js"]
```

Notes on structure:
- Pin `oven/bun:1.2-alpine` (alpine for smaller base; pin major.minor, not `latest`)
- `WORKDIR /app` in both stages
- `NODE_ENV=production` in runner to disable dev-only code paths
- Final `EXPOSE 3000` matches Elysia default port
- `CMD` uses the compiled `dist/index.js` — adjust path to match actual build output

## Constraints
- Final image must not contain `.env` files or any plaintext secrets
- Dev dependencies must not be present in the runner stage
- Source maps must not be present in the runner stage
- Final image size must be < 500 MB (enforced by `docker images` check in validation)
- Bun base image version must be pinned (not `latest`)
- The API process must exit cleanly on `SIGTERM` within 30 seconds (per RELIABILITY.md graceful shutdown spec)
- `bun install --frozen-lockfile` must be used in both stages

## Steps
1. Write a test that builds the image and verifies `GET /api/health` returns 200 (RED — build test)
2. Write `Dockerfile.api` builder and runner stages (GREEN)
3. Build locally: `docker build -f Dockerfile.api -t combine-trade-api:local .`
4. Smoke test: start container with test env, hit `/api/health`, verify SIGTERM exit (GREEN)
5. Check image size < 500 MB (REFACTOR)
6. Run validation commands

## Acceptance Criteria
- `docker build -f Dockerfile.api -t combine-trade-api:local .` succeeds without errors
- `docker run --rm --env-file .env.test combine-trade-api:local` starts and `GET http://localhost:3000/api/health` returns HTTP 200
- Container exits with code 0 on `SIGTERM` (no hung process)
- `docker images combine-trade-api:local --format '{{.Size}}'` reports < 500 MB
- No `.env` file present inside the image (`docker run --rm combine-trade-api:local find /app -name '.env'` returns empty)
- No `node_modules` from dev-only packages in runner stage

## Validation
```bash
docker build -f Dockerfile.api -t combine-trade-api:local .

# Start container in background
docker run -d --name api-test --env-file .env.test -p 3000:3000 combine-trade-api:local

# Health check
sleep 3 && curl -sf http://localhost:3000/api/health

# SIGTERM graceful shutdown
docker stop api-test

# Image size gate
docker images combine-trade-api:local --format 'Size: {{.Size}}'

# Verify no .env in image
docker run --rm combine-trade-api:local find /app -name '.env' -o -name '*.env'

# Cleanup
docker rm -f api-test
docker rmi combine-trade-api:local
```

## Out of Scope
- Dockerfile.workers — T-15-005
- Dockerfile.web — T-15-006
- docker-compose.prod.yml — T-15-007
- GitHub Actions build workflow (`.github/workflows/build.yml`) — T-15-007
- Image registry push — T-15-007
- Health check `HEALTHCHECK` instruction in Dockerfile — can be added post-MVP; deploy script polls `/api/health` directly

## Implementation Notes

- Created `Dockerfile.api` at repository root with two stages: `builder` (installs all deps, builds api) and `runner` (copies only production artifacts, re-installs with `--production`).
- Used `oven/bun:1.2-alpine` pinned to 1.2 in both stages — never `latest`.
- Builder copies `workers/` in addition to `apps/api/` and `packages/` because workspace resolution requires sibling packages to be present during install.
- Runner copies `package.json`, `bun.lock`, `packages/`, `apps/api/dist/`, and `apps/api/package.json` only — no source files, no dev deps.
- `NODE_ENV=production` set in runner to disable dev code paths.
- `EXPOSE 3000` matches Elysia default port.
- `CMD ["bun", "run", "apps/api/dist/index.js"]` runs the compiled output; Bun forwards SIGTERM correctly.
- `.dockerignore` created to exclude `.env*`, `node_modules`, `docs/`, `.git`, `.github`, `.harness`, test files, and `.claude`.
- Tests: `scripts/__tests__/dockerfile.test.ts` — 35 tests, all pass (RED → GREEN).
- `bun test` result: 1471 pass, 1 skip (live Binance test), 0 fail.
- `bun run typecheck` passes with no errors.
