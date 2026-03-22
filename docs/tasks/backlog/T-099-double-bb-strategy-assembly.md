# T-099 Double-BB strategy assembly + integration test

## Goal
Wire detector + evidence + gate + features into a single `evaluateDoubleBB()` orchestrator function, and write an integration test that validates the full pipeline.

## Why
EP17 M2 final piece — the individual modules (T-096, T-097, T-098) need to be composed into a single entry point that the strategy script calls. This is the glue layer.

## Inputs
- `packages/core/strategy/double-bb/detector.ts` (T-096)
- `packages/core/strategy/double-bb/evidence.ts` (T-097)
- `packages/core/strategy/double-bb/gate.ts` (T-098)
- `packages/core/strategy/double-bb/features.ts` (T-098)

## Dependencies
T-096, T-097, T-098

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

## Out of Scope
- Strategy DB registration
- Sandbox script generation
- Backtest execution
