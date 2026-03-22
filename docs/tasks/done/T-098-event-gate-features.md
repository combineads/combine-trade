# T-098 Event gate + feature definitions + ATR TP/SL

## Goal
Implement the event gate (signal filtering), 10-feature definitions with normalization, and ATR-based TP/SL calculation.

## Why
EP17 M2 — the event gate decides whether a detected pattern becomes a strategy event. Features define the vector dimensions for similarity search. TP/SL sets trade targets.

## Inputs
- `packages/core/strategy/double-bb/detector.ts` (T-096: DoubleBBResult)
- `packages/core/strategy/double-bb/evidence.ts` (T-097: EvidenceResult)

## Dependencies
T-096, T-097

## Expected Outputs
- `evaluateGate(pattern, evidence, context)` function
- `computeFeatures(pattern, evidence, candles)` function returning 10 normalized values
- `computeTargets(direction, entryPrice, atr)` function

## Deliverables
- `packages/core/strategy/double-bb/gate.ts`
- `packages/core/strategy/double-bb/features.ts`
- `packages/core/strategy/double-bb/__tests__/gate.test.ts`
- `packages/core/strategy/double-bb/__tests__/features.test.ts`

## Constraints
- Gate rules: Double-BB required, evidence >= 3 families, no counter_trend
- Direction filter: LONG ignores bearish, SHORT ignores bullish
- All 10 features in [0, 1] range
- TP = entry ± ATR14 × 2.0, SL = entry ∓ ATR14 × 1.0
- max_hold_bars = 60

## Steps
1. Implement event gate with pass/reject + reject reason
2. Implement 10 feature computations with normalization
3. Implement ATR TP/SL calculation
4. Write gate tests (pass, no-pattern, weak-evidence, counter-trend, direction-filter)
5. Write feature tests (range validation, known-value tests)

## Acceptance Criteria
- Gate rejects when no Double-BB pattern
- Gate rejects when < 3 evidence families
- Gate rejects counter_trend bias
- Direction filtering works correctly
- All features in [0, 1]
- TP/SL correct for LONG and SHORT

## Validation
```bash
bun test packages/core/strategy/double-bb/__tests__/gate.test.ts
bun test packages/core/strategy/double-bb/__tests__/features.test.ts
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files changed: `gate.ts`, `features.ts`, `__tests__/gate.test.ts`, `__tests__/features.test.ts`
- Gate: evaluateGate checks no_pattern → direction_filter → weak_evidence (< 3 families) → counter_trend
- Features: 10-dim vector all in [0,1]. Variant minmax, booleans, sigmoid normalization, BB20 percent position
- Targets: TP = entry ± ATR×2, SL = entry ∓ ATR×1, default maxHoldBars=60
- Tests: 8 gate tests + 11 feature/target tests = 19 total
- Validation: 19/19 pass, typecheck clean

## Outputs
- `evaluateGate(pattern, evidence, context)` → `GateResult { pass, rejectReason? }`
- `computeFeatures(input: FeatureInput)` → `FeatureVector` (10 normalized values)
- `computeTargets(side, entryPrice, atr, maxHoldBars?)` → `TargetResult`
- `GateContext`, `FeatureInput`, `FeatureVector`, `TargetResult` interfaces

## Out of Scope
- Strategy script assembly
- Strategy registration
- Backtest execution
