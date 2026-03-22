# T-166 GitHub Actions CI workflow

## Goal
Create `.github/workflows/ci.yml` that runs lint, typecheck, test:unit, test:integration, and build jobs on every PR and push to `main`. All jobs must pass before a PR can be merged.

## Why
Every code change must be validated automatically before it can reach production. Without a CI pipeline, there is no automated guard against broken builds, failing tests, or type errors slipping into `main`. This is the foundation all other quality and security gates (T-167, T-168, T-175) extend.

## Inputs
- `CLAUDE.md` — default commands (`bun run lint`, `bun run typecheck`, `bun run build`, `bun test`)
- `docs/exec-plans/15-cicd-deployment.md` § M1 — job definitions and acceptance criteria
- `docs/QUALITY.md` — CI completion target (< 10 minutes for a typical PR)
- Root `package.json` — script names used by CI jobs
- `docker-compose.yml` (EP07) — PostgreSQL + pgvector service container configuration to mirror in CI

## Dependencies
None — this is the first CI task and has no prerequisite task outputs.

## Expected Outputs
- `.github/workflows/ci.yml` — primary CI workflow
- `.github/dependabot.yml` — weekly dependency update configuration

## Deliverables

### `.github/workflows/ci.yml`
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test:unit --coverage

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: combine
          POSTGRES_PASSWORD: combine
          POSTGRES_DB: combine_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://combine:combine@localhost:5432/combine_test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate
      - run: bun run test:integration

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
```

### `.github/dependabot.yml`
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

## Constraints
- Use `actions/checkout@v4` and `oven-sh/setup-bun@v2` (pinned major versions)
- `bun install --frozen-lockfile` — prevents CI from silently accepting a stale lockfile
- Concurrency group must cancel in-progress runs for the same PR ref on new push
- PostgreSQL service container must use `pgvector/pgvector:pg16` to match dev compose stack
- Do not run `bun run db:migrate` in unit test job — integration test job only
- Branch protection rule configuration is manual (GitHub UI) — not part of this task's code deliverables
- All jobs run in parallel (no explicit `needs:` dependency between lint/typecheck/test/build)

## Steps
1. Write failing test: verify `.github/workflows/ci.yml` is valid YAML with all required jobs (RED)
2. Create `.github/workflows/ci.yml` with all five jobs (GREEN)
3. Create `.github/dependabot.yml` with weekly npm updates (GREEN)
4. Verify locally: `gh workflow run ci.yml` or open a draft PR (REFACTOR)
5. Run validation commands

## Acceptance Criteria
- `.github/workflows/ci.yml` exists and is valid YAML
- Workflow triggers on `pull_request` and `push` to `main`
- Concurrency group cancels in-progress runs for the same ref
- `lint`, `typecheck`, `test-unit`, `test-integration`, `build` jobs all present
- `test-integration` job has PostgreSQL service with `pgvector/pgvector:pg16`
- `bun install --frozen-lockfile` used in every job
- `.github/dependabot.yml` exists with weekly npm schedule
- A PR with a failing test job is blocked from merging (verified manually or via branch protection)

## Validation
```bash
# Validate YAML syntax
bun x js-yaml .github/workflows/ci.yml

# Trigger via GitHub CLI
gh workflow run ci.yml
gh run list --workflow=ci.yml --limit=5

# View run details
gh run view $(gh run list --workflow=ci.yml --limit=1 --json databaseId -q '.[0].databaseId')
```

## Implementation Notes

- Added `js-yaml` and `@types/js-yaml` as dev dependencies to support YAML parsing in tests.
- Test file placed at `.github/__tests__/ci-workflow.test.ts` — bun test discovers it via `--recursive` from root.
- TDD cycle followed: RED (52 tests failing) → GREEN (ci.yml + dependabot.yml created) → REFACTOR (fixed 3 Biome `useLiteralKeys` lint errors).
- All five jobs (`lint`, `typecheck`, `test-unit`, `test-integration`, `build`) run in parallel with no `needs:` dependencies, matching the task constraint.
- `test-unit` uses `--coverage` flag; `test-integration` includes PostgreSQL `pgvector/pgvector:pg16` service with health check.
- `bun install --frozen-lockfile` present in every job step — prevents silent lockfile drift in CI.

## Outputs

- `.github/workflows/ci.yml` — primary CI workflow (5 parallel jobs)
- `.github/dependabot.yml` — weekly npm dependency updates, limit 5 open PRs
- `.github/__tests__/ci-workflow.test.ts` — 52 structural validation tests (all pass)

## Out of Scope
- Coverage gate job — T-167
- Performance regression gate — T-167
- Security audit and secret scanning jobs — T-168
- Sandbox escape test job — T-168
- Docker image build workflow — T-169, T-170, T-171
- Release workflow — T-175
- PR lint workflow — T-175
