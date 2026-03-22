# T-167 CI quality gates

## Goal
Extend `.github/workflows/ci.yml` with two additional jobs: a coverage gate that fails PRs dropping `packages/core` below 90% or overall coverage below 80%, and a performance regression gate that fails PRs degrading any benchmark by more than 20% from the baseline stored in `.harness/benchmarks/baseline.json`.

## Why
Without enforced coverage and performance thresholds, regressions accumulate silently. The coverage gate protects the correctness guarantees of `packages/core` (vector search, decision engine, risk management). The performance gate protects the < 1 second latency budget from being quietly eroded by new code. Both gates make quality degradation visible at the PR level, not in production.

## Inputs
- `.github/workflows/ci.yml` (T-166 output) — jobs to extend
- `docs/QUALITY.md` — coverage targets (core >= 90%, overall >= 80%) and regression threshold (> 20%)
- `docs/exec-plans/15-cicd-deployment.md` § M1 — coverage-gate and performance-regression job specs
- `.harness/benchmarks/baseline.json` — benchmark baseline (must be created as part of this task if absent)
- `package.json` — `bun run bench` script must exist

## Dependencies
- T-166 (`.github/workflows/ci.yml` must exist before adding jobs)

## Expected Outputs
- `.github/workflows/ci.yml` updated with `coverage-gate` and `performance-regression` jobs
- `.harness/benchmarks/baseline.json` — initial baseline file
- `scripts/check-coverage.ts` — parses coverage JSON and enforces thresholds
- `scripts/check-perf-regression.ts` — compares bench output against baseline.json

## Deliverables

### `coverage-gate` job (added to ci.yml)
```yaml
coverage-gate:
  runs-on: ubuntu-latest
  needs: [test-unit]
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
    - run: bun install --frozen-lockfile
    - run: bun run test:unit --coverage --coverage-reporter=json
    - run: bun run scripts/check-coverage.ts
```

### `scripts/check-coverage.ts`
- Reads coverage JSON output (location determined by test runner config)
- Checks `packages/core/**` line coverage >= 90%
- Checks overall line coverage >= 80%
- Exits with code 1 and prints failing package names if any threshold is breached
- Exits with code 0 if all thresholds pass

### `performance-regression` job (added to ci.yml)
```yaml
performance-regression:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
    - run: bun install --frozen-lockfile
    - run: bun run bench -- --reporter=json > .harness/benchmarks/current.json
    - run: bun run scripts/check-perf-regression.ts
```

### `scripts/check-perf-regression.ts`
- Reads `.harness/benchmarks/baseline.json` and `.harness/benchmarks/current.json`
- For each benchmark entry: if `current / baseline > 1.20` (>20% slower), fail
- Prints a comparison table with pass/fail per benchmark
- Exits with code 1 if any benchmark exceeds threshold
- Exits with code 0 if all benchmarks within threshold

### `.harness/benchmarks/baseline.json`
Initial baseline file capturing current benchmark results:
```json
{
  "generated_at": "<ISO timestamp>",
  "commit": "<sha>",
  "benchmarks": {}
}
```

## Constraints
- `scripts/check-coverage.ts` must not use external npm packages beyond what is already in the monorepo
- Coverage threshold values (90%, 80%) must be defined as named constants, not magic numbers
- Regression threshold (20%) must be a named constant
- If `.harness/benchmarks/baseline.json` does not exist, `check-perf-regression.ts` logs a warning and exits 0 (no false failures on first run)
- `check-coverage.ts` must handle the case where coverage JSON is absent (exits 1 with clear error message)
- Both scripts must be runnable locally: `bun run scripts/check-coverage.ts`

## Steps
1. Write failing tests for `check-coverage.ts`: below-threshold input exits 1, above-threshold exits 0 (RED)
2. Write failing tests for `check-perf-regression.ts`: >20% degradation exits 1, within threshold exits 0 (RED)
3. Implement `scripts/check-coverage.ts` (GREEN)
4. Implement `scripts/check-perf-regression.ts` (GREEN)
5. Create `.harness/benchmarks/baseline.json` with empty benchmarks object (GREEN)
6. Add `coverage-gate` job to `.github/workflows/ci.yml` with `needs: [test-unit]`
7. Add `performance-regression` job to `.github/workflows/ci.yml`
8. Run validation (REFACTOR)

## Acceptance Criteria
- `scripts/check-coverage.ts` exits 1 when any coverage threshold is breached
- `scripts/check-coverage.ts` exits 0 when all thresholds pass
- `scripts/check-perf-regression.ts` exits 1 when any benchmark degrades > 20%
- `scripts/check-perf-regression.ts` exits 0 when all benchmarks within threshold
- `scripts/check-perf-regression.ts` exits 0 (with warning) when baseline.json is absent
- `.github/workflows/ci.yml` contains `coverage-gate` job with `needs: [test-unit]`
- `.github/workflows/ci.yml` contains `performance-regression` job
- `.harness/benchmarks/baseline.json` exists and is valid JSON
- `bun run typecheck` passes for both scripts

## Validation
```bash
bun test packages/scripts/__tests__/check-coverage.test.ts
bun test packages/scripts/__tests__/check-perf-regression.test.ts
bun run scripts/check-coverage.ts
bun run scripts/check-perf-regression.ts
bun run typecheck
bun x js-yaml .github/workflows/ci.yml
```

## Out of Scope
- Security gate jobs — T-168
- Updating baseline.json on production deploys — T-174 and T-175 (release workflow)
- Configuring test runner coverage output format — assumed to produce standard JSON
- Branch protection rule enforcement — manual GitHub UI step
