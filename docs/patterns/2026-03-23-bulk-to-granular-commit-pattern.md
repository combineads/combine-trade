---
name: Bulk-to-Granular Commit Progression
type: efficiency
observed_in: EP00-EP17 (bulk), T-128 onwards (granular)
---

# Pattern: Bulk-to-Granular Commit Progression

- **Observed in**: EP00 through EP17 committed as large single commits; T-128 (UI scaffold) onwards committed per-task or per 2-3 tasks
- **Category**: efficiency
- **Description**: Early epics (foundation, core pipeline, risk, journal, paper trading) were each implemented and committed as a single batch commit per epic. Later phases (UI, CI/CD, auth) switched to per-task or per 2-3 task granular commits.
- **Root cause**: Infrastructure epics have high inter-task coupling (each module depends on the prior). UI and auth tasks are more independent and parallelizable, making per-task commits natural.
- **Impact**: Large batch commits make `git blame` and rollback coarser for core packages. Granular commits for UI/auth provide better audit trail per feature.
- **Recommendation**: Continue granular commits (per task or per 2-3 tightly coupled tasks). For infrastructure epics, consider milestone commits within the epic (e.g., per milestone rather than per epic).
