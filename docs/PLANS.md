# PLANS.md

## When an ExecPlan is required
Create an ExecPlan under `docs/exec-plans/` for:
- any feature that changes multiple modules
- any task with more than one milestone
- architectural changes
- risky migrations or refactors
- work that benefits from explicit validation checkpoints

Small, local, low-risk edits do not require an ExecPlan.

## ExecPlan rules
Each ExecPlan must include:
1. Objective
2. Scope and non-goals
3. Prerequisites
4. Milestones
5. Acceptance criteria per milestone
6. Validation commands per milestone
7. Risks and rollback notes
8. Decision log
9. Progress notes

## Milestone sizing
- A milestone should be small enough to complete and verify in one working loop.
- If validation fails, stop and fix before proceeding.
- Prefer 3–5 milestones for v1 work.

## Required behavior while executing a plan
- Do not ask for “next steps” between milestones unless blocked by an external dependency.
- Keep the decision log current.
- Update docs when implementation changes the repository contract.

## Epic parallelization map

Shows which epics can run in parallel versus which have sequential dependencies.

```
Phase 1 (Foundation):     EP00
Phase 2a (Core, parallel): EP01 (candles) | EP02 (sandbox) | EP11-M1 (decimal layer)
Phase 2b (Vectors):       EP03 (after EP02-M2 strategies model)
Phase 3 (Logic):          EP04 (labels, after EP01, EP03) → EP05 (backtest, after EP04)
Phase 4 (Execution):      EP06 (alerts) | EP07 (realtime) — after EP01, EP02, EP03, EP04, EP05
Phase 5 (Interface):      EP08 (API/UI) — after EP06, EP07
Phase 6 (Enhancement):    EP09 (risk) | EP10 (auth) | EP11-M2..M4 (fees, funding, PnL integration) | EP12 (charts) — after EP08
Phase 7 (Advanced):       EP13 (journal, after EP11-M2) | EP14 (paper trading, after EP09) — EP11-M4 optional enhancement for EP13/EP14
Phase 8 (Operations):     EP15 (CI/CD & deployment) — can start after EP00; full pipeline gates after EP07
```

Key: `|` means parallel (no shared file dependencies), `→` means sequential dependency.

## Milestone 0: Core thesis validation

The minimum viable path to validate the core thesis before investing in execution infrastructure:

```
EP00 → EP01 → EP02 → EP03 → EP04 → EP05
```

This covers:
1. **EP00** — project setup (repo, tooling, DB schema baseline)
2. **EP01** — candle collection (historical + live ingestion from Binance/OKX)
3. **EP02** — strategy sandbox (TypeScript runtime, Pine Script-level API)
4. **EP03** — vector engine (normalization, dynamic tables, L2 similarity search)
5. **EP04** — signal labeling (TP/SL/TIME_EXIT result judgment)
6. **EP05** — backtesting (3-year replay with vector generation and statistics)

Everything else (alerts, realtime pipeline, UI, risk management, auth, paper trading, etc.) builds on top of a validated core. The goal of M0 is to confirm that the vector-based strategy approach produces meaningful backtest results before the team commits to execution infrastructure.

## Milestone-level dependency graph

Fine-grained dependencies at the milestone level, enabling earlier parallel starts:

| Milestone | Depends on | Can start after |
|-----------|------------|-----------------|
| EP01-M1 (exchange adapter) | EP00-M2 | EP00-M2 done |
| EP01-M2 (candle model) | EP00-M3, EP00-M4 | EP00-M4 done |
| EP01-M4 (candle-collector worker) | EP01-M1, EP01-M2 | EP01-M2 done |
| EP02-M0 (sandbox PoC) | EP00-M2 | EP00-M2 done |
| EP02-M1 (indicators) | EP00-M4 | EP00-M4 done |
| EP02-M2 (strategy model) | EP00-M3, EP00-M5 | EP00-M5 done |
| EP03-M1 (normalization) | EP00-M2 | EP00-M2 done |
| EP03-M2 (dynamic tables) | EP00-M3, EP02-M2 | EP02-M2 done |
| EP11-M1 (decimal layer) | EP00-M2 | EP00-M2 done |
| EP04-M1 (labeling) | EP01-M2, EP02-M2 | EP02-M2 done |
| EP03-M5 (vector-worker integration) | EP04-M3 | EP04-M3 done |
| EP04-M3 (decision engine) | EP03-M4 | EP03-M4 done |
| EP05-M1 (historical loader) | EP01-M1 | EP01-M1 done |
| EP05-M2 (replay engine) | EP02-M4, EP03-M3, EP04-M1 | All done |

### Parallel start opportunities
- EP01-M1, EP02-M0, EP03-M1, EP11-M1 can all start once EP00-M2 is done
- EP02-M1 (indicators) can start once EP00-M4 is done (extends the basic indicator library from EP00-M4)
- EP01-M2 and EP02-M2 can run in parallel (different packages)
- EP04-M1 (labeling) can start as soon as EP01-M2 and EP02-M2 are done (no EP03 dependency for labeling itself)
- EP05-M1 (historical loader) can start as soon as EP01-M1 (exchange adapter) is done, overlapping with EP02-EP04
- EP03-M4 → EP04-M3 → EP03-M5 is the correct ordering: statistics (EP03-M4) must precede the decision engine (EP04-M3), which must precede vector-worker integration (EP03-M5)

## ExecPlan skeleton
```md
# <task-name>

## Objective
## Scope
## Non-goals
## Prerequisites
## Milestones
### M1
- Deliverables:
- Acceptance criteria:
- Validation:
### M2
- Deliverables:
- Acceptance criteria:
- Validation:

## Task candidates
## Risks and rollback
## Decision log
## Progress notes
```
