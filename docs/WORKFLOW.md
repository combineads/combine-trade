# WORKFLOW.md

Detailed workflow, coordination, and context hygiene rules for the Combine Trade agent team.
For agent roster and invocation guide, see `CLAUDE.md`.

> Note: This document covers the build loop (Stages 3-4) in detail. Stage 1 (bootstrap) and Stage 2 (epic planning) are one-time activities guided by their respective skills. Stage 5 (cleanup) is triggered periodically — see `harness-cleanup` skill for rules.

## The build loop (Stages 3–4)

1. **task-generator** seeds `docs/tasks/backlog/` from epic plans. Epic plans are located in `docs/exec-plans/` following the naming convention defined in `docs/PLANS.md`.
2. **implementer** picks the next unblocked task → moves to `doing/`:
   - **Write failing tests first** (RED): Create test(s) that specify acceptance criteria from task description
   - **Implement minimal code** (GREEN): Write simplest code to make tests pass
   - **Refactor** (REFACTOR): Clean up without changing behavior (extract helpers, improve readability)
   - Run validation → records Implementation Notes
3. **reviewer** independently re-runs validation → evaluates 8-item checklist → produces verdict (`approve` / `request-changes` / `block`)
4. If `approve` → **task-closer** moves to `done/`, updates docs, promotes rules
5. If `request-changes` → **implementer** addresses issues → **reviewer** re-reviews
6. If `block` → escalate architecture/security violation before continuing

**Key TDD principles:**
- Tests are documentation — acceptance criteria live in test code
- Green before refactor — never refactor untested code
- Failing tests first — verifies test is actually testing something

## Role boundaries

See CLAUDE.md section "Role boundaries" for the canonical definitions. Summary:
- Implementer writes code but does not judge quality
- Reviewer judges quality but does not write fixes
- Task-closer closes tasks but does not implement or review
- Orchestrator coordinates parallel execution but does not implement, review, or close
- Each agent stays in its lane — no role blending

### Escalation procedure (block verdict)
1. Reviewer sets verdict to `block` and records the violation in `## Review Notes`
2. Escalation target: the user (project owner). Agents cannot resolve architectural/security violations autonomously.
3. Reviewer creates a blocking note in the task file: `## Blocked: [reason]`
4. Task remains in `doing/` but is marked blocked — does not count toward WIP limit
5. User resolves the issue (architecture change, security fix, scope adjustment)
6. After resolution, task returns to implementer for rework, then re-review

**WIP counting**: An agent checking WIP counts files in `doing/` and subtracts any file containing a `## Blocked` section. Only non-blocked files count toward the WIP limit.

## Triple validation

See CLAUDE.md section "Triple validation" for the canonical rule. All three independent validation runs must pass for a task to reach `done/`. Validation means running all commands defined in `docs/QUALITY.md` section "Validation commands".

If task-closer validation fails after reviewer approval, the task returns to the reviewer for re-assessment. This counts as a new review cycle against the 3-cycle limit.

### Review retry limits
- Maximum 3 review cycles (implement → review → request-changes → re-implement → re-review → ...)
- After 3 failed reviews: task is split into smaller subtasks or escalated to user
- Each review cycle must address ALL items from the previous review (no partial fixes)
- Reviewer records cycle number in `## Review Notes` (e.g., "Review cycle 2 of 3")

## Anti-pattern propagation

- When reviewer blocks or requests changes, the pattern should be checked against `docs/anti-patterns.md`
- If the same issue appears in 2+ reviews, promote it to `docs/anti-patterns.md`
- Cleanup skill scans for recurring review patterns and promotes to rules

## Dependency resolution

- Implementer auto-selects tasks whose dependencies are all in `docs/tasks/done/`
- If all backlog tasks are blocked, report the dependency chain
- Task-closer reports newly unblocked tasks after each closure

## Parallel execution

- Two implementer agents may work simultaneously if their tasks have **no shared file dependencies**
- Tasks touching the same module must run sequentially (lower T-EP-NNN first). A module is defined as a single `packages/` subdirectory (e.g., `packages/core/vector/`) or `apps/` subdirectory.
- WIP limit (see CLAUDE.md section "WIP limits"; currently max 2) applies globally regardless of parallelism
- After completing a parallel task, re-run project-wide validation to detect merge conflicts

### Conflict resolution (parallel execution)
- Prevention: tasks touching the same module run sequentially (existing rule)
- Detection: after parallel task completion, run project-wide validation (`bun test && bun run typecheck`)
- Resolution order: higher T-EP-NNN task rolls back (lower T-EP-NNN has priority)
- Rolled-back task returns to `backlog/` with a `## Conflict Note` recording what happened
- Re-implementation must account for the winning task's changes

## Handoff protocol

- Task-generator declares `## Expected Outputs` for each task (schemas, interfaces, configs)
- Implementer records actual `## Outputs` after completing work
- Downstream tasks read predecessor `## Outputs` before starting
- This chain of Expected Outputs → Outputs → Inputs creates traceable data flow between tasks

## Context lifecycle

- Active context: tasks in `doing/` and their referenced docs
- Completed context: tasks in `done/` retain full notes until epic closes
- Archived context: after an epic completes, `harness-cleanup` moves done tasks to `docs/tasks/archive/<epic>/` and generates a summary
- The archive summary preserves key decisions and patterns without bloating active context

## Context hygiene

Context rot degrades agent performance as irrelevant information accumulates.

### Rules

- **Task = isolated context (mandatory)**: Every task lifecycle runs in its own subagent via the Agent tool. The subagent executes all stages (implement → QA → review → close) internally and returns only a structured summary. This is not optional — never run task lifecycles directly in the main context.
- **Subagent isolation mode**: Sequential execution uses fork context. Parallel execution (`--parallel`) uses `isolation: "worktree"` for filesystem isolation.
- **No nested subagents**: Subagents must not spawn their own subagents. Internal agent references (e.g., `code-simplifier`, `diagnostician`) are invoked as direct tool calls within the subagent.
- **Context stays bounded**: Because each task runs in a subagent, the main context only accumulates task summaries (~20 lines each). `/clear` is not required between tasks but is recommended after every 5 completed tasks or between waves as a hygiene checkpoint.
- **Clear after plan approval**: Plan Mode context can be discarded once the plan is accepted. Implementation starts with a fresh context window.
- **Minimize MCP servers**: Disable MCP servers not needed for the current session. Each loaded server consumes context on every request.

### When to use subagents vs direct execution

```
Is the task self-contained?
├── YES → Subagent (runs isolated, returns summary only)
└── NO (do teammates need to coordinate?)
    ├── YES → Agent Teams (shared task list + messaging)
    └── NO  → Single session (no overhead needed)
```

## Model routing

Match model capability to task complexity to control costs.

### Recommended routing

```yaml
Lead / Orchestrator:  Opus    # coordinates team, synthesizes results
Planner:              Opus    # architecture decisions, complex reasoning
Implementer:          Sonnet  # coding tasks (nearly identical benchmark scores)
QA (harness-qa):      Sonnet  # tool use and validation loops
Reviewer:             Opus    # final judgment, full-context assessment
```

### When to override

- **All-Opus**: Large refactors with long reasoning chains, unfamiliar codebase (reduce variables first), or flat-rate token pricing
- **All-Sonnet**: Unknown cost envelope (validate quality before optimizing), simple projects
