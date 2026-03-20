# Task Board

## Lanes
- `backlog/`: queued tasks (maintain 5–15)
- `doing/`: in progress (WIP limit: see CLAUDE.md § WIP limits (currently max 2))
- `done/`: completed
- `archive/`: closed epics' tasks (moved during cleanup)

### Transition conditions
- **backlog → doing**: All tasks listed in `## Dependencies` are in `done/`. WIP limit not exceeded (see CLAUDE.md § WIP limits).
- **doing → done**: All items in `## Validation` section pass. Review verdict is `approve`.
- **doing (blocked)**: Task remains in `doing/` with a `## Blocked` section. Does not count toward WIP limit. See WORKFLOW.md for escalation procedure.
- **done → archive**: Moved during periodic cleanup (harness-cleanup skill).

## Task file format
`T-NNN-kebab-slug.md`

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
