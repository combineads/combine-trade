# T-168 CI security gates

## Goal
Extend `.github/workflows/ci.yml` with security jobs: `bun audit` for dependency vulnerability scanning, lockfile integrity verification, and gitleaks secret scanning. Also add a scheduled nightly security run. Secrets inadvertently committed or high-severity vulnerabilities in dependencies must block the PR.

## Why
Combine Trade manages real exchange API keys and executes live orders. A secret leaked in a commit or a high-severity vulnerability in a dependency can lead to fund loss or account compromise. Running these checks on every PR and on a nightly schedule ensures that newly published vulnerabilities are also caught, not just those present at PR time.

## Inputs
- `.github/workflows/ci.yml` (T-166 output) — workflow to extend
- `docs/SECURITY.md` — secrets handling rules, audit requirements
- `docs/exec-plans/15-cicd-deployment.md` § M2 — security job definitions and acceptance criteria
- `bun.lockb` — lockfile whose integrity must be verified
- `package.json` — dependency manifest for lockfile comparison

## Dependencies
- T-166 (`.github/workflows/ci.yml` must exist before adding security jobs)

## Expected Outputs
- `.github/workflows/ci.yml` updated with `audit`, `lockfile-integrity`, and `secret-scan` jobs
- `.github/workflows/security-schedule.yml` — nightly scheduled security run
- `.gitleaks.toml` — gitleaks configuration with allowlist for test fixtures
- `scripts/check-lockfile.ts` — verifies `bun.lockb` matches current `package.json`

## Deliverables

### `audit` job (added to ci.yml)
```yaml
audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
    - run: bun install --frozen-lockfile
    - run: bun audit --level high
```
Fails on any `high` or `critical` severity finding. `moderate` and below are warnings only.

### `lockfile-integrity` job (added to ci.yml)
```yaml
lockfile-integrity:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
    - run: bun run scripts/check-lockfile.ts
```

### `scripts/check-lockfile.ts`
- Verifies `bun.lockb` exists in the repository root
- Runs `bun install --dry-run` (or equivalent) and checks that no packages would be added/removed/updated
- If lockfile is stale (i.e., `bun install` would change it), exits 1 with message: `bun.lockb is out of sync with package.json — run "bun install" and commit the updated lockfile`
- If lockfile is up-to-date, exits 0

### `secret-scan` job (added to ci.yml)
```yaml
secret-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### `.gitleaks.toml`
```toml
title = "Combine Trade gitleaks config"

[allowlist]
  description = "Allowlist for test fixtures and example values"
  regexes = [
    # Test fixture API keys (format: test_ prefix)
    '''test_[a-zA-Z0-9]{32}''',
    # Example values in documentation
    '''example_secret_here''',
    # JWT example in docs/SECURITY.md
    '''eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.eyJ'''
  ]
  paths = [
    '''docs/''',
    '''__tests__/fixtures/''',
    '''\.test\.ts$'''
  ]
```

### `.github/workflows/security-schedule.yml`
```yaml
name: Security Schedule

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun audit --level high

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Constraints
- `bun audit --level high` must fail on `high` and `critical` only — `moderate` must not block PRs at MVP
- `scripts/check-lockfile.ts` must not modify any files — read-only check
- `.gitleaks.toml` allowlist must be as narrow as possible — overriding by path and regex, not globally
- gitleaks action must run with `fetch-depth: 0` to scan full commit history in PRs
- Scheduled run must post results to GitHub Security tab (handled automatically by gitleaks-action)
- `scripts/check-lockfile.ts` must be runnable locally: `bun run scripts/check-lockfile.ts`

## Steps
1. Write failing tests for `check-lockfile.ts`: absent lockfile exits 1, stale lockfile exits 1, current lockfile exits 0 (RED)
2. Implement `scripts/check-lockfile.ts` (GREEN)
3. Create `.gitleaks.toml` with allowlist entries (GREEN)
4. Add `audit` job to `.github/workflows/ci.yml` (GREEN)
5. Add `lockfile-integrity` job to `.github/workflows/ci.yml` (GREEN)
6. Add `secret-scan` job to `.github/workflows/ci.yml` (GREEN)
7. Create `.github/workflows/security-schedule.yml` (GREEN)
8. Run validation (REFACTOR)

## Acceptance Criteria
- `scripts/check-lockfile.ts` exits 1 when `bun.lockb` is absent
- `scripts/check-lockfile.ts` exits 1 when `bun.lockb` is out of sync with `package.json`
- `scripts/check-lockfile.ts` exits 0 when lockfile is current
- `.github/workflows/ci.yml` contains `audit`, `lockfile-integrity`, and `secret-scan` jobs
- `.github/workflows/security-schedule.yml` runs nightly at 03:00 UTC
- `.gitleaks.toml` exists and is valid TOML
- `gitleaks detect --no-git --verbose` runs without false positives on the current repo
- `bun run typecheck` passes for `check-lockfile.ts`

## Validation
```bash
bun test packages/scripts/__tests__/check-lockfile.test.ts
bun run scripts/check-lockfile.ts
bun audit
# Install gitleaks locally to verify config
brew install gitleaks
gitleaks detect --no-git --verbose
bun run typecheck
bun x js-yaml .github/workflows/ci.yml
bun x js-yaml .github/workflows/security-schedule.yml
```

## Out of Scope
- Sandbox escape test job — sandbox escape tests belong to T-021 (sandbox-runtime). The CI job to run them can be added to ci.yml in that epic if needed.
- `depcheck` unused dependency linting — warn-only, deferred to post-MVP
- SAST (static application security testing) beyond gitleaks
- Container image vulnerability scanning (Trivy/Snyk) — deferred until Docker images exist (T-169+)
