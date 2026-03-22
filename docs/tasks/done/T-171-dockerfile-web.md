# T-171 Dockerfile.web — Next.js production build image

## Goal
Write a multi-stage `Dockerfile.web` that produces a minimal production image for `apps/web` (the Next.js web app). The builder stage runs `next build`. The runner stage uses the Next.js standalone output to keep the image lean, with no dev dependencies or source maps.

## Why
The web app is part of the full production stack managed by `docker-compose.prod.yml` (T-172). Containerising it alongside the API and workers enables consistent deployment and a single `docker compose up -d` to bring the whole system online. The Next.js standalone output is the standard technique for minimal container images.

## Inputs
- `apps/web/` — Next.js app source
- `apps/web/next.config.js` (or `.ts`) — must have `output: 'standalone'` set (or be updated as part of this task)
- `package.json` (root and `apps/web/`) — workspace layout
- `docs/exec-plans/15-cicd-deployment.md` § M3 — Dockerfile.web requirements, image size gate (500 MB)
- `docs/ARCHITECTURE.md` — apps/web is SSR/SSG (not static export — that is apps/desktop)

## Dependencies
None — Dockerfile.web can be written independently of Dockerfile.api and Dockerfile.workers.

## Expected Outputs
- `Dockerfile.web` — multi-stage build file at repository root
- `apps/web/next.config.js` updated to include `output: 'standalone'` if not already set

## Deliverables

### `apps/web/next.config.js` (ensure standalone output)
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ... existing config
};

module.exports = nextConfig;
```

### `Dockerfile.web`
```dockerfile
# syntax=docker/dockerfile:1

# ── Builder ────────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# Install Node.js for Next.js build (Next.js requires Node, not Bun, for next build)
RUN apk add --no-cache nodejs npm

COPY package.json bun.lockb ./
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN bun install --frozen-lockfile
RUN cd apps/web && bun run build

# ── Runner ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Next.js standalone output contains everything needed to run
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
```

Notes:
- Next.js `next build` requires Node.js — `oven/bun:1.2-alpine` + `apk add nodejs npm` covers this in builder
- Runner stage uses `node:22-alpine` since Next.js standalone output runs with Node.js
- Port 3001 to avoid conflict with the API on port 3000
- `apps/web/next.config.js` must have `output: 'standalone'` before `next build`

## Constraints
- `output: 'standalone'` must be set in `apps/web/next.config.js` — required for minimal standalone copy
- Runner stage must use `node:22-alpine`, not Bun (Next.js standalone uses Node runtime)
- Final image must not contain `.env` files or plaintext secrets
- Dev dependencies must not be in runner stage
- Final image size < 500 MB
- `NEXT_PUBLIC_*` environment variables baked at build time must be documented in a comment (they cannot be injected at runtime)
- Runtime env vars (API URL, feature flags) must be passed via `docker run -e` or compose env, not baked in

## Steps
1. Verify or update `apps/web/next.config.js` to include `output: 'standalone'` (GREEN prerequisite)
2. Write a test that the build produces a `standalone` directory (RED)
3. Write `Dockerfile.web` builder and runner stages (GREEN)
4. Build locally: `docker build -f Dockerfile.web -t combine-trade-web:local .`
5. Smoke test: start container, verify the web app responds on port 3001 (GREEN)
6. Check image size < 500 MB (REFACTOR)
7. Run validation commands

## Acceptance Criteria
- `apps/web/next.config.js` has `output: 'standalone'`
- `docker build -f Dockerfile.web -t combine-trade-web:local .` succeeds without errors
- `docker run --rm -p 3001:3001 combine-trade-web:local` starts and `GET http://localhost:3001` returns HTTP 200 (or 302 redirect to login)
- Image size < 500 MB
- No `.env` file present inside the image
- `bun run typecheck` passes (next.config.js change must not break typecheck)

## Validation
```bash
docker build -f Dockerfile.web -t combine-trade-web:local .

# Start web in background
docker run -d --name web-test -p 3001:3001 \
  -e NEXT_PUBLIC_API_URL=http://localhost:3000 \
  combine-trade-web:local

# Verify it responds
sleep 3 && curl -sf -o /dev/null -w '%{http_code}' http://localhost:3001

# Image size gate
docker images combine-trade-web:local --format 'Size: {{.Size}}'

# Verify no .env in image
docker run --rm combine-trade-web:local find /app -name '.env' -o -name '*.env'

# Cleanup
docker rm -f web-test
docker rmi combine-trade-web:local
```

## Out of Scope
- Dockerfile.api — T-169
- Dockerfile.workers — T-170
- docker-compose.prod.yml — T-172
- apps/desktop static export Docker setup — desktop uses Tauri, not a container
- Next.js `apps/desktop` — uses `output: 'export'` per architecture decision; separate from this task
- Nginx reverse proxy in front of Next.js — deferred to cloud infrastructure phase

## Implementation Notes

- Created `Dockerfile.web` at repository root with three stages: `deps` (installs Bun deps + Node.js for the build), `builder` (inherits from deps, runs `next build`), and `runner` (node:22-alpine with standalone output only).
- `deps` stage uses `oven/bun:1.2-alpine` with `apk add --no-cache nodejs npm` to satisfy Next.js `next build` Node requirement.
- `builder` extends `deps` directly to avoid re-copying files — `FROM deps AS builder` reuses the install layer.
- `runner` stage uses `node:22-alpine` (not Bun) since Next.js standalone output requires Node runtime.
- `PORT=3001` avoids collision with the API on port 3000.
- `apps/web/next.config.ts` updated to add `output: "standalone"` required for the standalone copy approach.
- `NEXT_PUBLIC_*` vars baked at build time are documented in a comment inside the Dockerfile.
- `apps/web/.next/static` and `apps/web/public` copied separately as required by Next.js standalone mode.
- Tests covered by `scripts/__tests__/dockerfile.test.ts` — all 35 pass.
- `bun test` result: 1471 pass, 1 skip, 0 fail.
- `bun run typecheck` passes with no errors.
