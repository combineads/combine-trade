# Weekly Harness Report — 2026-04-05 (Post EP-14)

## Summary
- Drift items found: 1 (kpi module forward-declared, expected)
- Drift items fixed: 0
- Stale tasks: 0
- Code debt markers: 0 (TODO: 0, FIXME: 0, HACK: 0)
- Doc duplications flagged: 0
- AI slop items: 3 MEDIUM, 6 LOW
- AI slop items fixed: 1 (openMargin duplication)
- Tasks archived: 9 (EP-14 → docs/tasks/archive/14-auto-transfer/)

## Pass 1: Documentation Drift

| File | Issue | Status |
|------|-------|--------|
| ARCHITECTURE.md | `kpi` module declared but not implemented | OK — EP-16 planned |
| ARCHITECTURE.md | transfer module at L7 | OK — correctly documented |
| DATA_MODEL.md | TRANSFER event types in EventLog | OK |
| PRODUCT.md | Auto-transfer capability | OK |
| Layer violations | `bun run check-layers` | 0 violations |
| Commands | All 9 AGENTS.md commands | OK — present in package.json |

## Pass 2: Task Board

- Backlog: 0 tasks (needs task-generator for next epic)
- Doing: 0 tasks (within WIP limit)
- Done: 0 tasks (archived)
- Archived: EP-14 (9 tasks → docs/tasks/archive/14-auto-transfer/ + SUMMARY.md)

## Pass 3: Code Debt

| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| Pre-existing lint | 6 | src/backtest/cli.ts (biome useLiteralKeys) |

## Pass 4: Documentation Quality

- No duplications
- No stale examples

## Pass 5: Promoted Rules

- None this week. EP-14 DI patterns documented in archive SUMMARY.md.

## Pass 7: AI Slop Detection

| Category | Count | Files | Severity | Action |
|----------|-------|-------|----------|--------|
| Duplication | 1 | transfer-now.ts (openMargin) | MEDIUM | **FIXED** — extracted `computeOpenMargin()` |
| Test quality | 1 | transfer-ui.test.ts:284-316 | MEDIUM | Deferred — tautological dialog tests |
| Duplication | 1 | transfer-ui.test.ts:36-67 | MEDIUM | Deferred — pure helpers duplicated from component |
| Dead code | 1 | scheduler.ts:92 (isRunning) | LOW | Deferred — daemon integration will use |
| Dead code | 1 | transfer/index.ts (barrel) | LOW | Deferred — conventional |
| Dead code | 1 | slack.ts (SURPLUS_ALERT) | LOW | Deferred — Phase 2 forward-declared |
| Test patterns | 2 | makeParams/makeMockAdapter duplication | LOW | Deferred — common test pattern |
| Consistency | 1 | transfer-now.ts (no Slack) | LOW | Intentional — CLI operator sees output |

## Pass 6: Quality Scores

| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 5 | 5 | All docs aligned post-EP-14 |
| Architecture clarity | 5 | 5 | Layer check 0 violations, transfer module clean |
| Validation coverage | 5 | 5 | +129 tests (transfer), TDD enforced |
| Reliability readiness | 5 | 5 | Transfer: 3x retry, EventLog, Slack alerts |
| Security hygiene | 3 | 3 | EP-14 security audit pending |
| Developer experience | 5 | 5 | CLI dry-run, web UI, API endpoints |
| **Total** | **28/30** | **28/30** | |

## Recommendations
1. Run `harness-security-audit` on EP-14 transfer code (exchange API keys, transfer amounts)
2. Fix pre-existing lint in `src/backtest/cli.ts` (`biome check --fix`)
3. Plan next epic (EP-15 vector-prd-alignment or EP-16 runtime-kpi)
