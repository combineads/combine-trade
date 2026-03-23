---
name: Late Scope Expansion via New Epics
type: scope-growth
observed_in: EP16, EP17, EP18
---

# Pattern: Late Scope Expansion via New Epics

- **Observed in**: EP16 (macro retrospective), EP17 (double-BB reference strategy), EP18 (better-auth multiuser)
- **Category**: scope-creep
- **Description**: Original epic plan (EP00–EP15) was defined at bootstrap. Three additional epics were identified and added mid-project after implementation began: macro context (EP16), a reference strategy (EP17), and a multiuser auth migration (EP18). Each was added via a `docs:` commit adding the epic plan before tasks were generated.
- **Root cause**: Initial product spec was accurate but bootstrap epics under-specified auxiliary capabilities (reference implementation, extended auth model, LLM integrations). These emerged naturally once core pipeline was working.
- **Impact**: ~50 additional tasks beyond original plan (T-083 through T-183 vs original ~T-001–T-082 scope). No tasks were deferred or cut; all added scope was completed.
- **Recommendation**: During epic planning, budget 20–30% overhead for emerging epics. Explicitly list "deferred for v2" candidates in the bootstrap doc to signal scope boundaries early.
