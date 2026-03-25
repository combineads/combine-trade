# T-13-007 Pattern Drift Detection

## Goal
Detect pattern drift with statistical significance testing by comparing recent trade pattern match outcomes against a historical baseline, producing a drift score and triggering alerts when drift exceeds a configurable threshold.

## Why
Strategy patterns may degrade over time as market regimes shift. Without automated drift detection, traders may continue using a strategy whose statistical edge has eroded. Automated drift detection provides timely alerts so traders can pause, retrain, or retire a strategy before significant losses accumulate.

## Inputs
- `packages/core/pattern-matcher/` — pattern match result types (T-13-003)
- `packages/shared/db/schema/` — trade_journals, pattern_matches tables
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher for drift alert events
- `docs/exec-plans/13-journal-analytics.md` — EP13 drift detection spec

## Dependencies
- T-13-003 (pattern matcher — provides match outcome records)

## Expected Outputs
- `packages/core/drift/pattern-drift-detector.ts` — DriftDetector class
- `packages/core/drift/__tests__/pattern-drift-detector.test.ts` — test suite
- `packages/core/drift/index.ts` — exports
- Updated `packages/core/index.ts` — re-exports drift module

## Deliverables
- `DriftDetector` class:
  - `detect(strategyId: string, version: number, symbol: string, windowSize: number): Promise<DriftResult>` — computes drift for recent N trades vs historical baseline
  - `DriftResult`: `{ driftScore: number; chiSquared: Decimal; pValue: Decimal; isSignificant: boolean; alertLevel: 'none' | 'warning' | 'critical' }`
  - Chi-squared test comparing win/loss distribution of recent window vs baseline
  - Drift score in range 0–100 (0 = no drift, 100 = maximum divergence)
  - Alert threshold config: `{ warningThreshold: number; criticalThreshold: number }` (defaults: 60, 80)
- Config interface `DriftConfig` with alert thresholds
- All statistical intermediates computed with Decimal.js

## Constraints
- Use Decimal.js for all statistical calculations — never native float for drift score, chi-squared, or p-value
- Must respect vector isolation: query only within same strategy + version + symbol scope
- Minimum sample size guard: return `{ driftScore: 0, isSignificant: false, alertLevel: 'none' }` if fewer than 30 trades in either window
- Do not import Elysia, CCXT, or Drizzle inside `packages/core`

## Steps
1. Write failing tests first (RED):
   - Test: chi-squared computed correctly for known win/loss distributions
   - Test: drift score maps chi-squared to 0–100 range
   - Test: `isSignificant: true` when p-value < 0.05
   - Test: `alertLevel: 'warning'` when drift score >= warningThreshold
   - Test: `alertLevel: 'critical'` when drift score >= criticalThreshold
   - Test: returns no-drift result when sample size < 30
   - Test: respects strategy + version + symbol scope (does not aggregate cross-scope)
2. Implement `DriftDetector` (GREEN):
   - Query baseline and recent windows from trade journal records
   - Compute 2x2 contingency table (win/loss × baseline/recent)
   - Compute chi-squared statistic and p-value with Decimal.js
   - Map to drift score and alert level
3. Export from `packages/core/drift/index.ts`
4. Refactor (REFACTOR): extract chi-squared and p-value helpers as pure functions for testability

## Acceptance Criteria
- `DriftDetector.detect()` returns correct drift score and alert level for known distributions
- Chi-squared computation matches reference values within 0.001 tolerance
- Sample size guard prevents false positives on sparse data
- Strategy + version + symbol isolation enforced in all queries
- `bun test -- --filter "pattern-drift"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "pattern-drift"
bun run typecheck
bun run lint
```

## Out of Scope
- UI visualization of drift scores (EP22)
- Automated strategy retirement on drift (future epic)
- Cross-symbol or cross-strategy drift comparison
- ML-based drift detection (chi-squared only for now)
