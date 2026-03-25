# T-15-011 Staging Soak Test Runbook

## Goal
Document the staging soak-test procedure and promotion gate criteria in a runbook that defines soak duration, health checks, promotion gate criteria, and rollback triggers.

## Why
Without a documented process for validating releases before production, teams may promote untested builds or apply inconsistent criteria when deciding whether a release is ready. A formal runbook ensures every release goes through the same 24-hour validation process, with objective pass/fail criteria, reducing the risk of regressions reaching production.

## Inputs
- `docs/RELIABILITY.md` — failure mode definitions, latency budgets, error rate thresholds
- `docs/QUALITY.md` — definition of done and validation commands
- `docs/exec-plans/15-deployment.md` — EP15 deployment and promotion spec
- Existing runbooks in `docs/runbooks/` (if any) — format reference

## Dependencies
- T-15-008 (staging environment setup — provides the staging environment that the runbook documents)

## Expected Outputs
- `docs/runbooks/staging-soak-test.md` — soak test runbook document

## Deliverables
- `docs/runbooks/staging-soak-test.md` covering all required sections:
  1. **Overview** — purpose and scope of the soak test
  2. **Prerequisites** — what must be true before starting a soak test (deployment complete, smoke test passed, monitoring active)
  3. **Soak Test Procedure** — step-by-step instructions for starting the soak test
  4. **Duration** — 24-hour minimum soak period; rationale
  5. **Health Checks** — checks performed during soak:
     - Error rate: < 0.1% of requests over any 5-minute window
     - p99 latency: < 1 second for candle-close-to-decision pipeline
     - Memory: no process exceeds 90% of memory limit or grows > 20% over 24h
     - DB connections: pool utilization < 80% sustained
     - Worker restarts: zero unplanned restarts during soak period
  6. **Promotion Gate Criteria** — all of the following must be true to promote to production:
     - Zero application errors during soak (excluding known benign errors, which must be listed)
     - p99 latency < 1 second for full pipeline
     - No memory leaks (RSS growth < 20% over 24h)
     - All workers healthy (no restarts)
     - All automated tests pass on staging build
  7. **Rollback Trigger** — any of the following triggers immediate rollback:
     - Error rate > 1% in any 5-minute window
     - p99 latency > 2 seconds sustained for > 5 minutes
     - Memory growth > 50% over 4 hours
     - Any worker crash loop (3+ restarts in 10 minutes)
     - Kill switch fails to halt trading within 1 second
  8. **Rollback Procedure** — steps to execute rollback and restore previous version
  9. **Monitoring Links** — placeholder links for staging dashboard, logs, and alerts
  10. **Sign-off** — who must approve promotion (tech lead + QA)

## Constraints
- Document must be written in English (AI-internal doc)
- All threshold values must match values defined in `docs/RELIABILITY.md` — do not invent new thresholds
- Runbook must be actionable by an on-call engineer without additional context — no assumed knowledge
- Use plain Markdown only — no HTML, no special rendering syntax

## Steps
1. Read `docs/RELIABILITY.md` to extract canonical threshold values (error rate, latency, memory)
2. Read `docs/QUALITY.md` for validation commands to include in prerequisites
3. Read existing `docs/runbooks/` directory (if any files exist) for format reference
4. Write `docs/runbooks/staging-soak-test.md` covering all 10 required sections
5. Verify all threshold values match `docs/RELIABILITY.md`

## Acceptance Criteria
- File exists at `docs/runbooks/staging-soak-test.md`
- All 10 required sections present (Overview through Sign-off)
- Soak duration explicitly stated as 24 hours minimum
- All 5 health checks documented with numeric thresholds
- All 5 promotion gate criteria documented
- All 5 rollback triggers documented with numeric thresholds
- Rollback procedure is a numbered step-by-step list
- All threshold values match `docs/RELIABILITY.md`
- `bun run lint` passes (Markdown lint if configured)

## Validation
```bash
# Verify file exists and covers all required sections
ls docs/runbooks/staging-soak-test.md
```

## Out of Scope
- Automated soak test execution scripts (manual procedure only)
- Production deployment runbook (separate document)
- Staging environment provisioning (T-15-008)
- Monitoring dashboard setup (infrastructure concern)
