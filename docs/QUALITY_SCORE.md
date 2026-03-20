# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

### Score level definitions
| Score | Meaning |
|-------|---------|
| 0 | Not addressed at all |
| 1 | Documented but not implemented |
| 2 | Partially implemented, no enforcement |
| 3 | Implemented with manual verification |
| 4 | Implemented with automated verification |
| 5 | Fully implemented, automated, and battle-tested |

## Last updated
2026-03-21

## Initial score
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 3 | Bootstrap docs complete, aligned with discovery spec. No code yet. (verified: all 11 docs in docs/ exist and cross-reference correctly) |
| Architecture clarity | 3 | Module boundaries, data flow, storage structure defined. Not yet enforced. (verified: ARCHITECTURE.md 600+ lines, 15 table schemas, event bus definition) |
| Validation coverage | 1 | Commands defined but repo not yet scaffolded. Placeholders. (verified: no package.json, no test files, no biome.json as of 2026-03-21) |
| Reliability readiness | 2 | Failure modes and latency budget documented. No implementation. |
| Security hygiene | 2 | Sandbox isolation and secrets handling rules defined. No enforcement. |
| Developer experience | 1 | No runnable code yet. Commands are aspirational. |

## Top 3 quality risks
1. Strategy sandbox isolation — security boundary must be airtight before any code execution
2. Vector isolation invariant — cross-strategy/cross-symbol contamination is a correctness bug with financial impact
3. Pipeline latency budget — 1s target requires careful design of each stage

## Next cleanup targets
- Scaffold actual Bun monorepo with working `bun install` / `bun test`
- Implement first mechanical architecture check (import boundary validation)
- Create first passing test for indicator library
- Re-score after first vertical slice (candle ingestion → DB storage)
