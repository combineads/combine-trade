# 00-project-bootstrap

## Objective
Bootstrap the repository so coding agents can work with a reliable harness from the start.

## Scope
Create the initial documentation, validation surface, task board, learning directories, and first working agreements for combine-trade.

## Non-goals
- Full feature implementation
- Exchange API integration
- Detailed UI design

## Prerequisites
- None (this is the first plan)

## Milestones

### M1 — Normalize the idea
- Deliverables:
  - `docs/generated/project_spec.json`
  - `docs/specs/discovery-combine-trade.md`
- Acceptance criteria:
  - project spec captures all PRD requirements in structured format
  - assumptions are explicit
- Validation:
  - verify JSON parses: `bun -e "JSON.parse(require('fs').readFileSync('docs/generated/project_spec.json','utf8'))"`

### M2 — Create the harness docs
- Deliverables:
  - `AGENTS.md`, `CLAUDE.md`
  - `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/PLANS.md`
  - `docs/QUALITY.md`, `docs/QUALITY_SCORE.md`
  - `docs/RELIABILITY.md`, `docs/SECURITY.md`
  - `docs/TECH_STACK.md`, `docs/DESIGN_SYSTEM.md`, `docs/DATA_MODEL.md`
  - `docs/WORKFLOW.md`
- Acceptance criteria:
  - each file exists with required sections
  - content is tailored to combine-trade (not generic templates)
- Validation:
  - all files exist and have content

### M3 — Scaffold task board and learning directories
- Deliverables:
  - `docs/tasks/README.md`
  - `docs/tasks/backlog/`, `docs/tasks/doing/`, `docs/tasks/done/`
  - `docs/sessions/`, `docs/decisions/`, `docs/patterns/`, `docs/reports/`
  - `docs/anti-patterns.md`
- Acceptance criteria:
  - all directories exist
  - README contains lane definitions
  - anti-patterns.md contains entry template

## Risks
- Repo has no code yet — all commands are aspirational
- Exchange-specific details need verification during implementation
- Architecture will be refined by `/harness-architect`

## Decision log
- PRD v1.2 is comprehensive enough to skip discovery questioning (ambiguity 11%)
- Bootstrap mode (greenfield) — no existing code to preserve
- Architecture doc provides initial module boundaries; will be refined in stage 2
- Trading-specific rules added to AGENTS.md core rules (Decimal.js, SL invariant)

## Progress notes
- M1: Complete — project_spec.json and discovery spec created
- M2: Complete — all harness docs created and tailored
- M3: Complete — task board and learning directories scaffolded
