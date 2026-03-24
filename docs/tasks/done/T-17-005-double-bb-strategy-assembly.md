# T-17-005 Double-BB strategy assembly + integration test

## Goal
Wire detector + evidence + gate + features into a single `evaluateDoubleBB()` orchestrator function, and write an integration test that validates the full pipeline.

## Why
EP17 M2 final piece — the individual modules (T-17-002, T-17-003, T-17-004) need to be composed into a single entry point that the strategy script calls. This is the glue layer.

## Inputs
- `packages/core/strategy/double-bb/detector.ts` (T-17-002)
- `packages/core/strategy/double-bb/evidence.ts` (T-17-003)
- `packages/core/strategy/double-bb/gate.ts` (T-17-004)
- `packages/core/strategy/double-bb/features.ts` (T-17-004)

## Dependencies
T-17-002, T-17-003, T-17-004

## Expected Outputs
- `evaluateDoubleBB(input)` orchestrator function
- `DoubleBBEvaluation` result type with event/features/targets/rejection info
- Barrel export `packages/core/strategy/double-bb/index.ts`

## Deliverables
- `packages/core/strategy/double-bb/evaluate.ts`
- `packages/core/strategy/double-bb/index.ts`
- `packages/core/strategy/double-bb/__tests__/evaluate.test.ts`

## Constraints
- Pure functions, deterministic
- Returns null when gate rejects (no event emitted)
- When gate passes, returns features vector + TP/SL targets + pattern info
- Must re-export all public types from index.ts

## Steps
1. Define DoubleBBEvaluationInput and DoubleBBEvaluation types
2. Implement evaluateDoubleBB orchestrator
3. Create barrel export index.ts
4. Write integration tests (full pass, gate reject, no pattern scenarios)

## Acceptance Criteria
- Full pipeline: candle data → pattern → evidence → gate → features + targets
- Gate reject returns null
- Gate pass returns complete evaluation with 10 features + TP/SL
- All types re-exported from index.ts

## Validation
```bash
bun test packages/core/strategy/double-bb/__tests__/evaluate.test.ts
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files changed: `evaluate.ts`, `index.ts`, `__tests__/evaluate.test.ts`
- Approach: evaluateDoubleBB orchestrates detect → evidence → gate → features → targets pipeline
- Returns null on gate reject (no pattern, weak evidence, counter trend, direction filter)
- index.ts barrel re-exports all public types and functions
- Tests: 7 integration tests covering full pass, null scenarios, direction filtering, target calculation
- Validation: 7/7 pass, typecheck clean

## Outputs
- `evaluateDoubleBB(input: DoubleBBEvaluationInput)` → `DoubleBBEvaluation | null`
- `DoubleBBEvaluation { pattern, features, targets }`
- Barrel `index.ts` re-exporting all Double-BB module types

## Out of Scope
- Strategy DB registration
- Sandbox script generation
- Backtest execution
