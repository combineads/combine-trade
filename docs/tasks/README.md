# Task Board

## Lanes
- `backlog/`: queued tasks (maintain 5–15)
- `doing/`: in progress (max 2 WIP)
- `done/`: completed
- `archive/`: closed epics' tasks (moved during cleanup)

## Task file format
`T-EP-NNN-kebab-slug.md` (e.g., `T-01-005-setup-auth.md` — EP = epic number, NNN = sequence)

## Required sections
Goal, Why, Inputs, Dependencies, Expected Outputs, Deliverables, Constraints,
Steps, Acceptance Criteria, Validation, Out of Scope

### Sections added during execution
- `## Implementation Plan` (written by implementer before coding)
- `## Implementation Notes` (written by implementer after coding)
- `## Outputs` (written by implementer — actual handoff artifacts produced)
- `## Review Notes` (written by reviewer)

## Rules
- Task size: 30 min – 3 hours
- A task in `doing/` for >7 days is stale — split or re-scope
- Move to `done/` only after Validation section passes
- After closing, update any harness doc affected by the change
- Log failed approaches in `docs/anti-patterns.md`
- Independent tasks (no shared file dependencies) may run in parallel within WIP limit
