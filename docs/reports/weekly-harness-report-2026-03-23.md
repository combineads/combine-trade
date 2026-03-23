# Weekly Harness Report — 2026-03-23

## Summary
- Drift items found: 6
- Drift items fixed: 6
- Stale tasks: 0
- Code debt markers: 0 (FIXME: 0, TODO: 0, HACK: 0)
- Doc duplications flagged: 0
- Rules promoted: 0
- AI slop issues: 2 (medium severity, userId extraction pattern + indicator config duplication)

---

## Pass 1: Documentation Drift

| File | Issue | Action |
|------|-------|--------|
| `docs/ARCHITECTURE.md` | Header said "Proposed repository layout" — code fully exists | Changed to "Repository layout" |
| `docs/ARCHITECTURE.md` | `apps/desktop/` listed as implemented — directory does not exist | Added note: "planned, not yet scaffolded" |
| `docs/ARCHITECTURE.md` | `packages/core/fee/`, `packages/core/macro/`, `packages/core/supervisor/` undocumented | Added to layout and dependency rules |
| `docs/ARCHITECTURE.md` | `packages/ui/src/` structure stale (platform/ listed, actual: auth/stores/theme/lib/) | Updated to reflect actual structure |
| `docs/ARCHITECTURE.md` | `packages/shared/` missing: event-bus/, errors/, pipeline/ | Added to layout |
| `README.md` | `apps/desktop/` listed in repository structure — doesn't exist | Removed; added retrospective-worker and llm-decision-worker |
| `README.md` | `label-worker` listed twice, `retrospective-worker`/`llm-decision-worker` missing | Fixed |
| `docs/QUALITY_SCORE.md` | Scores dated 2026-03-21 reflecting "no code" state — 183 tasks now complete | Fully updated to current state |

---

## Pass 2: Task Board

- **Backlog**: 0 tasks (all work completed)
- **Doing**: 0 tasks (within WIP limit)
- **Done**: 183 tasks (T-001 through T-183)
- **Stale tasks**: None
- **Epics completed**: 19 total (EP00–EP18)

### Epic completion summary
All 19 epics complete:
EP00 Bootstrap → EP01 Candle → EP02 Strategy Sandbox → EP03 Vector → EP04 Label/Decision → EP05 Backtest → EP06 Alert/Execution → EP07 Pipeline → EP08 API+UI → EP09 Risk → EP10 Auth → EP11 Financial Arithmetic → EP12 Charts → EP13 Journal → EP14 Paper Trading → EP15 CI/CD → EP16 Macro+Retrospective → EP17 Double-BB Strategy → EP18 Better-Auth Multi-user

**Action**: Eligible for archival to `docs/tasks/archive/` (183 done tasks). Deferred — no blocking issue; can be done in next cleanup cycle.

---

## Pass 3: Code Debt

| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| TEMP | 0 | — |

**Result: Clean.** No tracked debt markers found.

---

## Pass 4: Documentation Quality

- **Cross-doc duplications**: None found. Each concept has a single source.
- **Stale examples**: None detected.

---

## Pass 5: Pattern Promotion

No new patterns identified for promotion this cycle. Existing guardrails in `CLAUDE.md` and `docs/anti-patterns.md` cover current patterns.

---

## Pass 6: Quality Scores

| Category | Previous | Current | Evidence |
|----------|----------|---------|----------|
| Documentation truthfulness | 3 | 4 | 18 epics complete; drift corrections applied in this cleanup |
| Architecture clarity | 3 | 4 | Import rules enforced, vector isolation implemented, domain boundaries tested |
| Validation coverage | 1 | 4 | TDD across 183 tasks, CI quality gates, integration tests |
| Reliability readiness | 2 | 4 | Kill switch, daily loss limits, supervisor, gap repair all implemented |
| Security hygiene | 2 | 4 | better-auth, Argon2id, AES-256-GCM, V8 sandbox, JWT, rate limiting |
| Developer experience | 1 | 4 | Full monorepo, all commands runnable, seed scripts, GitHub Actions CI |

---

## Pass 7: AI Slop Detection

| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Duplication — userId extraction | 12+ | `apps/api/src/routes/*.ts` | Medium |
| Duplication — indicator config blocks | 4 blocks | `packages/core/strategy/executor.ts:191-244` | Medium |
| Dead code | 0 | — | — |
| Unused abstractions | 0 | — | — |
| Generic names | ~30 | Various (context-clear, acceptable) | Low |

### Details

**userId extraction pattern** (Medium): 12+ repetitions of:
```typescript
const userId = extractUserId(ctx as unknown as Record<string, unknown>);
if (!userId) throw new UnauthorizedError();
```
across `routes/strategies.ts`, `routes/kill-switch.ts`, `routes/credentials.ts`, `routes/orders.ts`.
**Recommendation**: Extract to Elysia middleware/derive plugin that adds `userId` to context automatically. Not fixed in this cleanup pass — confirm with user before refactoring route handlers.

**Indicator config application** (Medium): `packages/core/strategy/executor.ts` lines 191–244 contain 4 near-identical blocks for BB, SMA, EMA, ATR custom config application.
**Recommendation**: Extract to a generic `applyCustomIndicatorConfig(type, configs, ...)` helper. Not fixed — confirm before touching executor.

---

## Recommendations

1. **Archive done/ tasks** — 183 tasks in `docs/tasks/done/` are candidates for archival. Run `/harness-cleanup --tasks-only` when ready.
2. **Extract userId middleware** — Eliminate 12+ route duplications by using Elysia's `derive()` to inject `userId` into context. Low risk, high payoff.
3. **Add p99 latency CI test** — The 1s pipeline budget has no regression guard in CI. Add a benchmark test to prevent silent latency regressions.
