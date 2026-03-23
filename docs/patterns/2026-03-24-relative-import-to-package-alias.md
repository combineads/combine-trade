---
name: Relative Import to Package Alias
type: code-quality
observed_in: apps/api, workers/macro-collector, workers/llm-decision-worker, workers/retrospective-worker, scripts/
---

# Pattern: Relative Import to Package Alias

- **Observed in**: apps/api/src/, workers/ (macro-collector, llm-decision-worker, retrospective-worker), scripts/supervisor.ts, tests/integration/
- **Category**: code-quality
- **Description**: Cross-package imports used deep relative paths (`../../../packages/core/...`) instead of workspace package aliases (`@combine/core/...`). This caused tsconfig project reference mismatches and type-check errors in workers missing from root `tsconfig.json` references.
- **Root cause**: Early epics wrote imports as relative paths to `packages/` directories. No lint rule enforced alias usage. Workers added in later epics (EP16 macro, EP17 LLM/retrospective) copied the relative path pattern and were also omitted from root `tsconfig.json` references.
- **Impact**: TypeScript type-check failures in 3 workers. Fragile imports that break on directory restructuring. Inconsistent import style across codebase.
- **Resolution (2026-03-24)**: Converted ~50 imports across 20+ files to `@combine/*` aliases. Added 3 missing workers to root `tsconfig.json` references. Fixed worker `tsconfig.json` files (added `composite: true`, correct `rootDir`, `references`).

## Rule

Always use `@combine/*` workspace aliases when importing across packages:

| Directory | Alias |
|-----------|-------|
| `packages/candle/` | `@combine/candle/` |
| `packages/core/` | `@combine/core/` |
| `packages/shared/` | `@combine/shared/` |
| `packages/execution/` | `@combine/execution/` |
| `packages/backtest/` | `@combine/backtest/` |
| `packages/alert/` | `@combine/alert/` |
| `packages/exchange/` | `@combine/exchange/` |

### Exceptions

- `db/` directory — not a workspace package, relative paths allowed (consider packaging in future)
- Intra-package imports — relative paths within the same package are fine (e.g., `../../executor.js` inside `packages/core/strategy/`)

### Recommendation

- Enforce with a lint rule (e.g., eslint-plugin-import `no-relative-packages`) to prevent regression
- When adding new workers or apps, always add to root `tsconfig.json` references
