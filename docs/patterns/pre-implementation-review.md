# Pattern: Pre-Implementation Review

**Discovered**: 2026-04-04, EP-04 task review phase
**Category**: efficiency
**Status**: active

## Problem

Task generation (harness-task-generator) produces task definitions that may contain:

- **One-deliverable violations**: A function is assigned to the wrong task (e.g., `fetchCandlesViaREST` placed in repository task instead of history-loader task)
- **Dependency gaps**: Two tasks both claim ownership of the same function, or a dependency is missing from the chain
- **Responsibility overlaps**: A capability is expected but not specified in any task (e.g., reconnection event detection missing from collector task)

These issues are cheap to fix in task definitions (~2 min each) but expensive to fix after implementation (~15 min each, including rework and re-testing).

## Context

EP-04 generated 10 task candidates. Pre-implementation review found:

| Severity | Count | Example |
|----------|-------|---------|
| Critical | 3 | fetchCandlesViaREST in wrong task; getCandleGaps duplicated; onReconnect missing |
| Important | 4 | exchange parameter unclear; is_closed detection logic unspecified; DELETE pattern missing; symbol source ambiguous |

All 7 issues were fixed before any code was written. The review took approximately 15 minutes. No task required a second QA cycle during implementation.

## Solution

Insert a mandatory review step between task generation (stage 7) and implementation (stage 8):

### Review checklist

1. **One-deliverable rule**: Each task produces exactly one primary deliverable. Functions belong to the task whose deliverable file they live in.

2. **Dependency completeness**: For each task, verify that every input it references is produced by a task earlier in the dependency chain.

3. **Responsibility uniqueness**: No function or responsibility appears in more than one task. Use grep across all task files to find duplicates.

4. **Missing capabilities**: Read the epic plan's acceptance criteria and verify every criterion maps to at least one task's acceptance criteria.

5. **Constraint specificity**: Each task's Constraints section must be specific enough that two independent implementers would produce compatible code (e.g., "exchange parameter" must specify which value to use, not just "pass exchange").

6. **Cross-task interface consistency**: If Task A produces a function and Task B consumes it, verify the function signature matches in both task definitions.

### Severity classification

- **Critical**: Would cause implementation failure or require rework of multiple tasks
- **Important**: Would cause ambiguity or inconsistency but could be resolved during implementation
- **Minor**: Style or documentation issues

## Anti-pattern

```
Task generation → Implementation (skip review)
```

This leads to discovering design issues during implementation, when the cost of change is highest.

## Verification

After review, re-read all modified task files and confirm:
- Zero cross-task function ownership conflicts
- Dependency chain is a valid DAG
- Every epic acceptance criterion traces to at least one task

## Evidence

- EP-04: 3 Critical + 4 Important issues caught pre-implementation, 0 rework cycles
- EP-03: No pre-implementation review was done; 0 issues caught but baseline was simpler (adapter pattern with less cross-task coupling)

## Related

- `docs/exec-plans/04-market-data.md` — Progress notes record the review findings
- `docs/WORKFLOW.md` — Agent coordination workflow
