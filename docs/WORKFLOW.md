# Workflow

Detailed agent coordination rules for the harness lifecycle. For the team roster and core rules, see `AGENTS.md`.

## The build loop (Stages 8–11)
1. **task-generator** seeds `docs/tasks/backlog/` from epic plans
2. **implementer** picks the next unblocked task → moves to `doing/` → writes code → runs validation → records Implementation Notes
3. **reviewer** independently re-runs validation → evaluates 8-item checklist → produces verdict (`approve` / `request-changes` / `block`)
4. If `approve` → **task-closer** moves to `done/`, updates docs, promotes rules
5. If `request-changes` → **implementer** addresses issues → **reviewer** re-reviews
6. If `block` → escalate architecture/security violation before continuing

## Skill invocation guide

```bash
# [0] Discovery — clarify vague requirements
/harness-discovery

# [1] Bootstrap — create harness docs
/harness-project-bootstrap

# [2] Architecture — interactive interview → ARCHITECTURE.md
/harness-architect
/harness-architect --no-consensus

# [3] Design System — design tokens (trading dashboard)
/harness-design-system

# [4] Tech Stack — latest library versions → TECH_STACK.md
/harness-tech-stack

# [5] Data Model — MRT classification → DATA_MODEL.md
/harness-data-model

# [6] Epic Planner — break architecture into execution plans
/harness-epic-planner

# [7] Task Generator — seed backlog from epic plans
/harness-task-generator 02

# [8] Implementer — pick task, write code, run validation
/harness-implementer
/harness-implementer T-01-005

# [9] QA — automated test/build/lint fix loop
/harness-qa

# [10] Reviewer — 8-item quality checklist
/harness-reviewer T-01-005

# [11] Task Closer — verify, close, sync docs
/harness-task-closer T-01-005

# [12] Cleanup — prune drift, detect slop, promote patterns
/harness-cleanup

# [13] Retro — structured retrospective
/harness-retro

# [14] Security Audit — OWASP Top 10 + STRIDE
/harness-security-audit

# Utility skills
/harness-implement-all
/harness-build-all
/harness-orchestrator T-01-005 T-01-006
/harness-trace
```

## Triple validation
- **Implementer** runs validation after writing code
- **Reviewer** independently re-runs validation (never trusts implementer's results)
- **Task-closer** runs validation before closing (never trusts reviewer's results)
- All three must pass for a task to reach `done/`

## Anti-pattern propagation
- When reviewer blocks or requests changes, check against `docs/anti-patterns.md`
- If the same issue appears in 2+ reviews, promote to `docs/anti-patterns.md`
- Cleanup skill scans for recurring review patterns and promotes to rules

## Dependency resolution
- Implementer auto-selects tasks whose dependencies are all in `docs/tasks/done/`
- If all backlog tasks are blocked, report the dependency chain
- Task-closer reports newly unblocked tasks after each closure

## Parallel execution
- Two implementer agents may work simultaneously if their tasks have **no shared file dependencies**
- Tasks touching the same module must run sequentially (lower T-EP-NNN first)
- WIP limit of 2 applies globally regardless of parallelism
- After completing a parallel task, re-run project-wide validation to detect merge conflicts

## Handoff protocol
- Task-generator declares `## Expected Outputs` for each task
- Implementer records actual `## Outputs` after completing work
- Downstream tasks read predecessor `## Outputs` before starting

## Context lifecycle
- Active context: tasks in `doing/` and their referenced docs
- Completed context: tasks in `done/` retain full notes until epic closes
- Archived context: after epic completes, cleanup moves done tasks to `docs/tasks/archive/<epic>/`

## Context hygiene

### Rules
- **Task = isolated context (mandatory)**: Every task lifecycle runs in its own subagent via the Agent tool.
- **Subagent isolation mode**: Sequential → fork context. Parallel → `isolation: "worktree"`.
- **No nested subagents**: Internal agent references are invoked as direct tool calls within the subagent.
- **Context stays bounded**: Main context only accumulates task summaries (~20 lines each).
- **Clear after plan approval**: Plan Mode context can be discarded once accepted.
- **Minimize MCP servers**: Disable MCP servers not needed for the current session.

## Model routing

### Recommended routing
```yaml
# Opus — complex reasoning, judgment, coordination
discovery:        Opus
architect:        Opus
epic-planner:     Opus
reviewer:         Opus
orchestrator:     Opus
trace:            Opus
security-audit:   Opus

# Sonnet — coding, validation, template generation
project-bootstrap: Sonnet
task-generator:    Sonnet
implementer:       Sonnet
qa:                Sonnet
task-closer:       Sonnet
design-system:     Sonnet
tech-stack:        Sonnet
retro:             Sonnet
cleanup:           Sonnet
```
