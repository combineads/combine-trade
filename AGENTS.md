# AGENTS.md

This file configures AI coding agents for combine-trade.
Compatible with Claude Code (`@AGENTS.md` in CLAUDE.md) and Codex (reads AGENTS.md directly).

## Mission
combine-trade: Automated crypto futures trading system implementing Kim Jikseon's Double-BB strategy with KNN-based statistical validation across multiple exchanges.

## System scope
- Platforms: daemon, web, api
- Stack: Bun + TypeScript / React + Vite + Zustand + TanStack Query / PostgreSQL + pgvector
- Exchanges: CCXT (Binance, OKX, Bitget, MEXC)
- Precision: Decimal.js (float 금지)

## Default commands
```bash
bun install
bun run dev
bun test
bun run lint
bun run typecheck
bun run build
bun run daemon
bun run backtest
```

## Read first
1. `docs/PRODUCT.md` — product intent and success metrics
2. `docs/ARCHITECTURE.md` — technical structure and boundaries
3. `docs/TECH_STACK.md` — canonical library versions and setup guide
4. `docs/DATA_MODEL.md` — MRT entity classification, relationships, physical design guide
5. `docs/DESIGN_SYSTEM.md` — design tokens, colors, typography, visual language
6. `docs/QUALITY.md` — validation commands and definition of done
7. `docs/WORKFLOW.md` — agent coordination, handoff, and model routing
8. `docs/PLANS.md` — execution planning rules
9. `docs/RELIABILITY.md` — failure modes and logging
10. `docs/SECURITY.md` — secrets, auth, input validation
11. Active exec-plan under `docs/exec-plans/`

## Agent team roster

| Agent | Skill | Stage | Role |
|-------|-------|-------|------|
| Discovery | `harness-discovery` | 0 | Clarify vague requirements through Socratic questioning |
| Bootstrapper | `harness-project-bootstrap` | 1 | Turn a project idea (or existing repo) into a repo-ready harness |
| Architect | `harness-architect` | 2 | Interactive interview → platform, DB, patterns, modules → ARCHITECTURE.md |
| Design System | `harness-design-system` | 3 | Design tokens, DESIGN_SYSTEM.md, CSS variables (UI projects) |
| Tech Stack | `harness-tech-stack` | 4 | Latest library versions, TECH_STACK.md, manifest scaffold |
| Data Model | `harness-data-model` | 5 | MRT entity classification, relationships, projection contracts → DATA_MODEL.md |
| Epic Planner | `harness-epic-planner` | 6 | Break architecture into bounded-context execution plans |
| Task Generator | `harness-task-generator` | 7 | Seed the backlog with execution-ready tasks |
| Implementer | `harness-implementer` | 8 | Pick tasks, write code, run validation |
| QA | `harness-qa` | 9 | Automated test/build/lint fix loop |
| Reviewer | `harness-reviewer` | 10 | Review implementations against 8-item checklist |
| Task Closer | `harness-task-closer` | 11 | Close tasks, update docs, promote rules |
| Cleanup | `harness-cleanup` | 12 | Scan for drift, prune stale work, update scores |
| Retro | `harness-retro` | 13 | Structured retrospective after epic completion |
| Security Audit | `harness-security-audit` | 14 | OWASP Top 10 + STRIDE codebase-wide audit |
| Orchestrator | `harness-orchestrator` | — | (utility) Coordinate parallel task execution |
| Implement-all | `harness-implement-all` | — | (utility) Auto-execute all backlog tasks |
| Build-all | `harness-build-all` | — | (utility) Idea → working code in one command |
| Trace | `harness-trace` | — | (utility) Evidence-driven bug investigation |

## Development workflow
```
harness-discovery → harness-project-bootstrap → harness-architect → [harness-design-system] → harness-tech-stack
       [0]                    [1]                     [2]                   [3]                       [4]

  → harness-data-model → harness-epic-planner → harness-task-generator → harness-implementer → harness-qa
           [5]                    [6]                     [7]                     [8]              [9]

  → harness-reviewer → harness-task-closer → harness-cleanup → harness-retro → [harness-security-audit]
          [10]                 [11]                [12]             [13]                  [14]
```

## Core rules

### WIP limit (single source of truth)
- **Maximum 2 tasks in `docs/tasks/doing/` at any time.**
- To change the limit, update this value only — all skills read from here.

### Role boundaries
- **Implementer** writes code but does not judge quality
- **Reviewer** judges quality but does not write fixes
- **Task-closer** closes tasks but does not implement or review
- Each agent stays in its lane — no role blending

### Documentation update rule
- Code changes that alter behavior, API, or architecture must update the corresponding doc in the same commit.
- If a doc contradicts the code, the code wins — fix the doc.

### Architecture guardrails
- Respect module boundaries described in `docs/ARCHITECTURE.md`.
- Do not introduce new dependencies or cross-layer imports without recording the reason.
- Prefer small, testable changes with explicit validation steps.

### Trading-specific rules
- All monetary calculations use Decimal.js — never `number` for prices, sizes, or PnL.
- Structural anchors (BB20, BB4, MA periods, normalization) are code-fixed — never tunable.
- SL must be registered on the exchange before any other post-entry action.
- Reconciliation worker must never be disabled in production modes.

## Source of truth

| Document | Owns |
|----------|------|
| `AGENTS.md` | Agent team configuration, WIP limits, role boundaries |
| `docs/PRODUCT.md` | Product intent, capabilities, and success metrics |
| `docs/ARCHITECTURE.md` | Technical structure, boundaries, and dependency rules |
| `docs/TECH_STACK.md` | Canonical library versions, install commands, setup guide |
| `docs/DATA_MODEL.md` | MRT entity classification, relationships, projection contracts |
| `docs/DESIGN_SYSTEM.md` | Visual language — colors, typography, spacing, components |
| `docs/assets/tokens.css` | CSS custom properties — import in any stylesheet |
| `docs/assets/tokens.json` | Machine-readable design tokens (W3C DTCG format) |
| `docs/WORKFLOW.md` | Agent coordination, handoff protocol, model routing |
| `docs/PLANS.md` | Execution planning rules and templates |
| `docs/QUALITY.md` | Definition of done, validation commands, test strategy |
| `docs/QUALITY_SCORE.md` | Current quality scores with evidence |
| `docs/RELIABILITY.md` | Failure modes, logging, retry rules |
| `docs/SECURITY.md` | Secrets, auth, input validation, data sensitivity |
| `docs/tasks/README.md` | Task board rules, lane definitions, sizing |
| `docs/anti-patterns.md` | Failed approaches to avoid |
