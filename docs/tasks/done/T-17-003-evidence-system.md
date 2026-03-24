# T-17-003 Evidence system (candle patterns, MA, separation, 1h bias)

## Goal
Implement the 4-family evidence system: candle patterns, MA evidence, separation evidence, and 1h bias alignment.

## Why
EP17 M2 — the evidence system provides confidence signals that validate or reject Double-BB patterns. At least 3 of 4 families must confirm.

## Inputs
- EP17 exec plan M2 spec

## Dependencies
None (pure domain logic)

## Expected Outputs
- Evidence evaluator functions for each family
- `EvidenceResult` with per-family hit/miss

## Deliverables
- `packages/core/strategy/double-bb/evidence.ts`
- `packages/core/strategy/double-bb/__tests__/evidence.test.ts`

## Constraints
- Pure functions, deterministic
- Candle patterns: hammer (body<=35%, dominant wick>=55%), doji (body<=10%), engulfing, strong body (body>=70%)
- MA evidence: slope (MA20/50), ordering (MA20<50<100<200 bullish), price reaction
- Separation: signed distance ratio from MA20
- 1h bias: aligned/counter_trend/neutral_bias

## Steps
1. Implement candle pattern detection (hammer, inverted hammer, doji, engulfing, strong body)
2. Implement MA evidence (slope, ordering, reaction)
3. Implement separation distance calculation
4. Implement 1h bias evaluation
5. Write tests for each family hit/miss

## Acceptance Criteria
- Each evidence family independently testable
- Candle patterns correctly classified
- MA ordering: bullish when MA20<50<100<200
- 1h bias: aligned/counter/neutral correctly determined
- All functions deterministic

## Validation
```bash
bun test packages/core/strategy/double-bb/__tests__/evidence.test.ts
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files changed: `packages/core/strategy/double-bb/evidence.ts`, `packages/core/strategy/double-bb/__tests__/evidence.test.ts`
- Approach: Pure function `evaluateEvidence(input)` that evaluates all 4 families and counts hits
- Candle patterns: doji (≤10%), hammer/inverted_hammer (body≤35% + dominant wick≥55%), strong_body (≥70%)
- MA evidence: ordering (bullish: MA20>50>100>200), slope (both MA20/50 rising/falling), hit requires both aligned
- Separation: signed (close - ma20)/ma20 ratio, hit if direction matches side
- H1 bias: direct pass-through, hit only on "aligned"
- Tests: 16 tests covering all families + family count aggregation
- Validation: 16/16 pass, typecheck clean

## Outputs
- `EvidenceResult` interface with `candlePattern`, `maEvidence`, `separation`, `h1Bias`, `familyHitCount`
- `EvidenceInput` interface for all evidence evaluation inputs
- `MaBias` type: `"aligned" | "counter_trend" | "neutral_bias"`
- `evaluateEvidence(input: EvidenceInput)` → `EvidenceResult`

## Out of Scope
- Event gate logic (T-17-004)
- Feature normalization
