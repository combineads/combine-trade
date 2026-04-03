# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Initial score
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 3 | PRD is exceptionally detailed; harness docs created from comprehensive spec |
| Architecture clarity | 2 | Module boundaries defined; not yet enforced mechanically |
| Validation coverage | 1 | Commands defined but repo has no code yet |
| Reliability readiness | 2 | Reconciliation and crash recovery designed in PRD; not implemented |
| Security hygiene | 1 | API key handling and auth designed; implementation pending |
| Developer experience | 1 | Commands defined; no runnable code yet |

## Top 3 quality risks
1. Exchange API differences discovered only during live sandbox testing
2. Decimal.js enforcement has no mechanical lint rule yet
3. Backtest/live code path identity claim unverifiable until both exist

## Next cleanup targets
- Initialize Bun project with package.json and tsconfig
- Add ESLint rule for Decimal.js enforcement
- Create first vertical slice (indicator calculations + tests)
- Score again after first epic completion
