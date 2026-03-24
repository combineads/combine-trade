# CLAUDE.md

This file configures Claude Code as a team of specialized agents for Combine Trade.
Detailed workflow, coordination, and context hygiene rules live in `docs/WORKFLOW.md`.

## Mission

Combine Trade: a trading system that vectorizes events as defined by strategies, and makes LONG/SHORT/PASS decisions based on historical pattern statistics within the same strategy, version, and symbol scope.

## System scope & stack

- Platforms: API (Elysia), Workers (Bun), Web (Next.js), Desktop/Mobile (Tauri)
- Stack: Bun + Elysia + AOP + IoC/DI + DrizzleORM + PostgreSQL/pgvector + CCXT
- Pipeline: candle close → strategy evaluation → vectorization → L2 search → statistics → decision → alert/execution

## Default commands

```bash
bun install                 # install dependencies
bun run dev                 # start dev server
bun test                    # run all tests
bun run lint                # biome lint
bun run typecheck           # tsc --noEmit
bun run build               # production build
bun run db:generate         # drizzle-kit generate migrations
bun run db:migrate          # drizzle-kit apply migrations
```

## Architecture guardrails

- **Dependency direction**:
  - apps (api/web/desktop) → packages → packages/shared
  - workers → packages → packages/shared
- **Domain isolation**: packages/core must not import Elysia, CCXT, Drizzle, or Slack
- **Vector isolation**: same strategy + same version + same symbol only. No cross-strategy or cross-symbol queries.
- **Strategy sandbox**: no direct DB/network/filesystem access. Only provided API.
- **AOP**: transaction and logging via decorators. No manual transaction management.
- **IoC**: all services registered in container. No manual instantiation.
- **Latency budget**: candle close → decision < 1 second total.
- **Secrets**: Exchange API keys AES-256-GCM encrypted at rest. Never logged, never in source code.
- **Auth**: All API endpoints require JWT. Exceptions: health, login, token refresh only.
- **Order safety**: Kill switch + daily loss limit mandatory before enabling live trading.

### Critical invariants

1. Vector search must only operate within the same strategy + version + symbol scope
2. Strategy sandbox cannot access anything outside its provided API
3. All candles must pass continuity validation
4. Order execution must always go through the decision engine
5. New strategy version = new vector table (physical separation)
6. Kill switch must be able to halt all trading within 1 second
7. Daily loss limit breach must immediately suspend auto-trade
8. All monetary calculations must use Decimal.js (never native float)

## Agent team roster

| Agent | Skill | Stage | Role |
|-------|-------|-------|------|
| Bootstrapper | `harness-project-bootstrap` | 1 | Turn a project idea into a repo-ready harness |
| Architect | `harness-architect` | 2 | Design architecture through structured interview |
| Epic Planner | `harness-epic-planner` | 5 | Break work into epic-level execution plans |
| Task Generator | `harness-task-generator` | 6 | Seed the backlog with execution-ready tasks |
| Implementer | `harness-implementer` | 7 | Pick tasks, write code, run validation |
| QA | `harness-qa` | 8 | Auto-fix loop for test/build/lint/type errors |
| Reviewer | `harness-reviewer` | 9 | Review implementations against 8-item checklist |
| Task Closer | `harness-task-closer` | 10 | Close tasks, update docs, promote rules |
| Cleanup | `harness-cleanup` | 11 | Scan for drift, prune stale work, update scores |
| Retro | `harness-retro` | 12 | Analyze completed work, quality trends |
| Orchestrator | `harness-orchestrator` | — | (optional) Wraps Stages 7–9 for parallel task execution |

## 14-stage lifecycle

```
harness-discovery → [harness-project-bootstrap] → harness-architect → [harness-design-system] → harness-tech-stack
       [0]                    [1]                       [2]                  [3]                      [4]

  → harness-epic-planner → harness-task-generator → harness-implementer → harness-qa → harness-reviewer
           [5]                     [6]                     [7]              [8]            [9]

  → harness-task-closer → harness-cleanup → harness-retro → [harness-security-audit]
          [10]                 [11]             [12]                  [13]
```

Stages in brackets `[]` are one-time setup (already completed for this project).

## Development workflow (TDD: Red-Green-Refactor)

The build loop runs Stages 6–10:
- **task-generator** [6] seeds the backlog
- **implementer** [7] follows TDD: RED (failing tests) → GREEN (minimal implementation) → REFACTOR (clean code)
- **qa** [8] auto-fix loop for test failures, build errors, lint warnings, type errors (max 5 cycles)
- **reviewer** [9] evaluates quality and TDD compliance
- **task-closer** [10] closes approved tasks and reports newly unblocked work

Stage 11 (cleanup) and Stage 12 (retro) run periodically outside the build loop.

See `docs/WORKFLOW.md` for detailed rules. See `docs/QUALITY.md` section "TDD Workflow" for RED-GREEN-REFACTOR cycle.

## Skill invocation guide

```bash
# Stage 1: Bootstrap
/harness-project-bootstrap "SaaS for team budgeting"

# Stage 2: Architecture
/harness-architect

# Stage 5: Plan epics
/harness-epic-planner collection
/harness-epic-planner review all

# Stage 6: Generate tasks
/harness-task-generator 02
/harness-task-generator --refine T-01-005

# Stage 7: Implement
/harness-implementer                    # auto-select next unblocked task
/harness-implementer T-00-005           # work on specific task
/harness-implementer --continue         # resume current task
/harness-implementer --dry-run          # show approach without coding

# Stage 8: QA
/harness-qa                             # fix all test/build/lint/type errors
/harness-qa --lint-only                 # fix lint only

# Stage 9: Review
/harness-reviewer T-00-005              # review specific task
/harness-reviewer                       # review current task in doing
/harness-reviewer --focus security      # narrow to security checklist

# Stage 10: Close tasks
/harness-task-closer T-00-005
/harness-task-closer status

# Stage 11: Cleanup
/harness-cleanup
/harness-cleanup --drift-only
/harness-cleanup --report-only

# Stage 12: Retro
/harness-retro

# Optional: Orchestrate parallel work
/harness-orchestrator T-00-005 T-00-006         # parallel feature development
/harness-orchestrator --review T-00-005         # parallel multi-role review
```

## Coordination rules

### WIP limits (single source of truth)

- **Maximum 2 tasks in `docs/tasks/doing/` at any time.**
- Tasks with a `## Blocked` section do not count toward this limit.
- This limit is the authoritative value. All skills (implementer, orchestrator) reference this section rather than defining their own.
- Implementer must check WIP limit before starting a new task.
- If WIP limit is reached, finish or split existing work first.
- To change the limit, update this value only — all skills read from `CLAUDE.md`.

### Role boundaries

- **Implementer** writes code but does not judge quality
- **Reviewer** judges quality but does not write fixes
- **Task-closer** closes tasks but does not implement or review
- Each agent stays in its lane — no role blending

For escalation on block verdicts, see `docs/WORKFLOW.md`.

### Triple validation

- **Implementer** runs validation after writing code
- **Reviewer** independently re-runs validation (never trusts implementer's results)
- **Task-closer** runs validation before closing (never trusts reviewer's results)
- All three must pass for a task to reach `done/`

### Model routing

See `docs/WORKFLOW.md` section "Model routing" for guidance on which model to use per agent role.

## Source of truth

Read documents in priority order. `#` = reading priority for agents starting a task.

| # | Document | Owns |
| --- | --- | --- |
| 1 | `CLAUDE.md` | Agent team configuration, operating rules, and guardrails |
| 2 | `docs/WORKFLOW.md` | Detailed workflow, coordination, and context hygiene rules |
| 3 | `docs/PRODUCT.md` | Product intent, capabilities, and success metrics |
| 4 | `docs/ARCHITECTURE.md` | Technical structure, boundaries, and dependency rules |
| 5 | `docs/TECH_STACK.md` | Technology choices, usage rules, and key configuration |
| 6 | `docs/DESIGN_SYSTEM.md` | UI design tokens, typography, and component rules |
| 7 | `docs/QUALITY.md` | Definition of done, validation commands, test strategy |
| 8 | `docs/RELIABILITY.md` | Failure modes, logging, retry rules |
| 9 | `docs/SECURITY.md` | Secrets, auth, input validation, data sensitivity |
| 10 | `docs/PLANS.md` | Execution planning rules and templates |
| 11 | `docs/exec-plans/` | Active epic-level execution plans |
| — | `docs/QUALITY_SCORE.md` | Current quality scores with evidence |
| — | `docs/tasks/README.md` | Task board rules, lane definitions, sizing |
| — | `docs/anti-patterns.md` | Failed approaches to avoid |
| — | `docs/specs/` | Discovery session transcripts and specifications |
| — | `docs/generated/` | Auto-generated project artifacts (project_spec.json) |
