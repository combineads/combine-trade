# T-15-010 Release workflow + conventional commit PR lint

## Goal
Create `.github/workflows/release.yml` — a manually triggered workflow that validates semver format, re-runs CI, creates an annotated git tag, generates a changelog from conventional commits, creates a GitHub Release, and pushes Docker images with the release tag. Also create `.github/workflows/pr-lint.yml` to enforce conventional commit format on all PR titles.

## Why
Without release automation, version tagging, changelog generation, and image publishing are error-prone manual steps that are often skipped under pressure. Without PR title linting, commit messages become inconsistent, making automated changelog generation unreliable. Together, these two workflows close the release loop: every PR contributes a parseable commit message, and every release produces a clean changelog with properly tagged, registry-pushed images.

## Inputs
- `.github/workflows/ci.yml` (T-15-001 output) — the CI workflow that release.yml re-runs
- `.github/workflows/build.yml` (T-15-007 output) — image build/push workflow that release.yml extends
- `docs/exec-plans/15-cicd-deployment.md` § M5 — release workflow and PR lint spec
- `CHANGELOG.md` — file to be generated and maintained by the release workflow
- `.harness/benchmarks/baseline.json` (T-15-002 output) — updated on each production deploy

## Dependencies
- T-15-001 (`.github/workflows/ci.yml` must exist — release workflow calls it or re-runs equivalent jobs)

## Expected Outputs
- `.github/workflows/release.yml` — manual release workflow
- `.github/workflows/pr-lint.yml` — conventional commit PR title enforcement
- `CHANGELOG.md` — auto-generated changelog (created empty if absent; populated on first release)

## Deliverables

### `.github/workflows/pr-lint.yml`
```yaml
name: PR Lint

on:
  pull_request:
    types: [opened, synchronize, edited, reopened]

jobs:
  pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            chore
            docs
            refactor
            test
            perf
            security
            ci
          requireScope: false
          subjectPattern: ^.{1,100}$
          subjectPatternError: |
            PR title subject must be 1-100 characters.
            Format: <type>: <description>
            Example: feat: add kill switch API endpoint
```

### `.github/workflows/release.yml`
```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Release version (e.g. v1.0.0)'
        required: true

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Validate semver format
        run: |
          if ! echo "${{ github.event.inputs.version }}" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "Invalid version format: ${{ github.event.inputs.version }}"
            echo "Expected: v<major>.<minor>.<patch>"
            exit 1
          fi

  ci:
    needs: validate
    uses: ./.github/workflows/ci.yml

  release:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Get previous tag
        id: prev-tag
        run: |
          PREV=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
          echo "value=$PREV" >> $GITHUB_OUTPUT

      - name: Generate changelog
        id: changelog
        run: |
          VERSION="${{ github.event.inputs.version }}"
          PREV="${{ steps.prev-tag.outputs.value }}"
          if [ -z "$PREV" ]; then
            LOG=$(git log --oneline --no-decorate)
          else
            LOG=$(git log --oneline --no-decorate "${PREV}..HEAD")
          fi
          echo "## ${VERSION} ($(date +%Y-%m-%d))" > /tmp/release-notes.md
          echo "" >> /tmp/release-notes.md
          echo "$LOG" | while IFS= read -r line; do
            echo "- ${line}" >> /tmp/release-notes.md
          done
          echo "log<<EOF" >> $GITHUB_OUTPUT
          cat /tmp/release-notes.md >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Update CHANGELOG.md
        run: |
          VERSION="${{ github.event.inputs.version }}"
          if [ ! -f CHANGELOG.md ]; then
            echo "# Changelog" > CHANGELOG.md
            echo "" >> CHANGELOG.md
          fi
          # Prepend new release notes after the first line
          head -1 CHANGELOG.md > /tmp/new-changelog.md
          echo "" >> /tmp/new-changelog.md
          cat /tmp/release-notes.md >> /tmp/new-changelog.md
          echo "" >> /tmp/new-changelog.md
          tail -n +2 CHANGELOG.md >> /tmp/new-changelog.md
          mv /tmp/new-changelog.md CHANGELOG.md
          git add CHANGELOG.md
          git commit -m "chore: update CHANGELOG.md for $VERSION [skip ci]"
          git push

      - name: Create annotated tag
        run: |
          VERSION="${{ github.event.inputs.version }}"
          git tag -a "$VERSION" -m "Release $VERSION"
          git push origin "$VERSION"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.event.inputs.version }}
          body_path: /tmp/release-notes.md
          draft: false
          prerelease: false

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
            ghcr.io/${{ github.repository }}/combine-trade-api:${{ github.event.inputs.version }}

      - uses: docker/build-push-action@v5
        with:
          file: Dockerfile.workers
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/combine-trade-workers:${{ github.event.inputs.version }}

      - uses: docker/build-push-action@v5
        with:
          file: Dockerfile.web
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/combine-trade-web:${{ github.event.inputs.version }}
```

### `CHANGELOG.md` — initial empty structure
```markdown
# Changelog

All notable changes to Combine Trade are documented here.
Entries are generated automatically from conventional commits on each release.
```

## Constraints
- Release workflow must be manually triggered only (`workflow_dispatch`) — no auto-trigger on merge
- Semver format must match `^v[0-9]+\.[0-9]+\.[0-9]+$` (no pre-release suffixes at MVP)
- CI jobs in release workflow must re-run (not trust cached results from a prior CI run)
- `CHANGELOG.md` bot commit must include `[skip ci]` to prevent CI loop
- PR lint must block on `opened`, `synchronize`, `edited`, `reopened` events (catches title changes after open)
- Conventional commit types enforced: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `security`, `ci`
- `.harness/benchmarks/baseline.json` update after production deploy is an operational step (operator runs `bun run scripts/deploy.ts`); the release workflow only tags and pushes images

## Steps
1. Create `.github/workflows/pr-lint.yml` with `amannn/action-semantic-pull-request@v5` (GREEN)
2. Create `CHANGELOG.md` with initial empty structure (GREEN)
3. Write `.github/workflows/release.yml` with validate → ci → release job chain (GREEN)
4. Validate both workflow YAML files locally (REFACTOR)
5. Test PR lint: open a draft PR with non-conventional title, verify job fails (REFACTOR)
6. Test release workflow: `gh workflow run release.yml -f version=v0.0.1-test` on a feature branch (REFACTOR)
7. Run validation commands

## Acceptance Criteria
- `.github/workflows/pr-lint.yml` exists and is valid YAML
- A PR with title `"update some stuff"` (no type prefix) is blocked by PR lint
- A PR with title `"feat: add kill switch endpoint"` passes PR lint
- `.github/workflows/release.yml` exists and is valid YAML
- Release workflow validates semver: `v1.0.0` passes, `1.0.0` and `v1.0` fail
- Release workflow creates an annotated git tag with the given version
- Release workflow pushes all three images with the release semver tag to `ghcr.io`
- `CHANGELOG.md` is updated with each release (prepend new section)
- `CHANGELOG.md` is committed with `[skip ci]` in commit message to prevent CI loop
- `bun x js-yaml .github/workflows/release.yml` exits 0
- `bun x js-yaml .github/workflows/pr-lint.yml` exits 0

## Validation
```bash
# Validate YAML syntax
bun x js-yaml .github/workflows/release.yml
bun x js-yaml .github/workflows/pr-lint.yml

# Trigger release workflow (test tag — use a non-production version)
gh workflow run release.yml -f version=v0.0.1-test
gh run list --workflow=release.yml --limit=3

# Verify tag created after workflow completes
git fetch --tags
git tag -l | grep v0.0.1-test

# Verify changelog entry exists
head -30 CHANGELOG.md
```

## Out of Scope
- Staging soak-test procedure and promotion gate documentation (runbook) — operational document, not a code deliverable
- `CHANGELOG.md` format validation tooling — changelog is auto-generated; manual formatting is out of scope
- Automated baseline.json update in release workflow — baseline is updated by `scripts/deploy.ts` after production deploy, not by the release workflow itself
- Pre-release version formats (e.g., `v1.0.0-rc.1`) — deferred post-MVP
- GitHub Release asset uploads (binaries, archives) — no binary releases at MVP

## Implementation Notes

**TDD cycle completed: RED → GREEN → REFACTOR**

### Files created
- `.github/__tests__/release-workflow.test.ts` — 30 tests validating release.yml structure (triggers, job chain, semver validation, changelog, tagging, GitHub Release, Docker image push)
- `.github/__tests__/pr-lint-workflow.test.ts` — 23 tests validating pr-lint.yml structure (triggers, types, action version, requireScope)
- `.github/workflows/release.yml` — manual release workflow with validate → ci → release job chain
- `.github/workflows/pr-lint.yml` — PR title linting with `amannn/action-semantic-pull-request@v5`
- `CHANGELOG.md` — initial empty changelog structure

### Key decisions
- `release.yml` uses `workflow_call` reuse for the `ci` job (`./.github/workflows/ci.yml`) — satisfies the constraint that CI re-runs rather than trusting cached results
- CHANGELOG.md commit includes `[skip ci]` to prevent CI loop as required
- PR lint trigger includes all four types: `opened`, `synchronize`, `edited`, `reopened` — catches title changes after PR is opened
- Docker images pushed to `ghcr.io/${{ github.repository }}/combine-trade-{api,workers,web}:{version}`
- `style` type omitted from conventional commit types per task spec (spec lists: feat, fix, chore, docs, refactor, test, perf, security, ci — 9 types)

### Validation results
- `bun x js-yaml .github/workflows/release.yml` — exits 0 (valid YAML)
- `bun x js-yaml .github/workflows/pr-lint.yml` — exits 0 (valid YAML)
- `bun test ./.github/__tests__/release-workflow.test.ts ./.github/__tests__/pr-lint-workflow.test.ts` — 53 pass, 0 fail
- `bun run typecheck` — exits 0
- `bunx @biomejs/biome check ./.github/__tests__/release-workflow.test.ts ./.github/__tests__/pr-lint-workflow.test.ts` — no errors

## Outputs
- `.github/workflows/release.yml`
- `.github/workflows/pr-lint.yml`
- `CHANGELOG.md`
- `.github/__tests__/release-workflow.test.ts`
- `.github/__tests__/pr-lint-workflow.test.ts`
