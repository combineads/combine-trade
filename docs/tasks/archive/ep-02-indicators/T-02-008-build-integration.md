# T-02-008 EP-02 build integration verification

## Goal
Verify that all EP-02 indicator deliverables work together: typecheck, lint, tests, layer enforcement, and benchmark all pass in a single clean run. Fix any integration issues.

## Why
Individual tasks verify their own deliverables, but integration issues (import cycles, missing exports, type mismatches) only surface when everything runs together. This is the final gate before EP-02 can be marked complete.

## Inputs
- All EP-02 task outputs (T-02-001 through T-02-007)
- `docs/QUALITY.md` — validation commands
- `package.json` — scripts

## Dependencies
T-02-007 (unified API — last content task)

## Expected Outputs
- All validation commands pass
- Any integration fixes applied
- EP-02 indicators module ready for dependent epics (EP-04, EP-05)

## Deliverables
- Passing validation (no new files — this task fixes integration issues)

## Constraints
- Do not add new features — only fix integration issues
- Do not modify individual indicator behavior
- All fixes must maintain L2 layer rules

## Steps
1. Run full validation:
   ```bash
   bun run typecheck
   bun run lint
   bun test
   bun scripts/check-layers.ts
   bun scripts/bench-indicators.ts
   ```
2. For each failure: diagnose root cause, apply minimal fix, re-run
3. Verify all indicator exports accessible:
   - `import { calcBB20, calcBB4 } from "@/indicators"`
   - `import { calcSMA, calcEMA } from "@/indicators"`
   - `import { calcRSI } from "@/indicators"`
   - `import { calcATR } from "@/indicators"`
   - `import { detectSqueeze } from "@/indicators"`
   - `import { calcAllIndicators } from "@/indicators"`
   - `import type { BollingerResult, AllIndicators, SqueezeState } from "@/indicators"`
4. Run layer check and verify zero violations
5. Run all tests and verify all pass

## Acceptance Criteria
- `bun run typecheck` passes with zero errors
- `bun run lint` passes with zero errors
- `bun test` passes all tests (EP-01 + EP-02)
- `bun scripts/check-layers.ts` reports zero violations
- `bun scripts/bench-indicators.ts` average < 10ms
- All indicator exports accessible via `@/indicators`

## Test Scenarios
N/A — integration verification task. Validation is via CLI commands.

## Validation
```bash
bun install && bun run typecheck && bun run lint && bun test && bun scripts/check-layers.ts && bun scripts/bench-indicators.ts
```

## Out of Scope
- New feature development
- Performance optimization beyond the 10ms target
- Indicator accuracy beyond 0.01% tolerance
