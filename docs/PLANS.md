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
3. Milestones
4. Acceptance criteria per milestone
5. Validation commands per milestone
6. Risks and rollback notes
7. Decision log
8. Progress notes

## Milestone sizing
- A milestone should be small enough to complete and verify in one working loop.
- If validation fails, stop and fix before proceeding.
- Prefer 3–5 milestones for v1 work.

## Required behavior while executing a plan
- Do not ask for "next steps" between milestones unless blocked by an external dependency.
- Keep the decision log current.
- Update docs when implementation changes the repository contract.

## ExecPlan skeleton
```md
# <task-name>

## Objective
## Scope
## Non-goals
## Milestones
### M1
- Deliverables:
- Acceptance criteria:
- Validation:
### M2
- Deliverables:
- Acceptance criteria:
- Validation:

## Risks
## Decision log
## Progress notes
```
