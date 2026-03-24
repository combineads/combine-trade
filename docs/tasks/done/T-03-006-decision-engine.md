# T-03-006 Implement decision engine

## Goal
Build the pure-function decision engine that takes pattern statistics and returns LONG/SHORT/PASS with Wilson score confidence interval and tier classification.

## Why
The decision engine is the final judgment step in the pipeline. It determines whether statistical evidence is sufficient to enter a trade. Designed as a pure function for testability and inline execution in vector-worker.

## Inputs
- EP04 M3 spec (decision engine)
- T-03-005 PatternStatistics type
- `db/schema/decisions.ts` (decision schema reference)
- PRODUCT.md §4 (decision criteria, confidence tiers)

## Dependencies
- T-03-005 (PatternStatistics type definition)

## Expected Outputs
- `packages/core/decision/engine.ts` — judge() function
- `packages/core/decision/types.ts` — Decision types
- `packages/core/decision/confidence.ts` — Wilson CI calculation
- `packages/core/decision/index.ts` — barrel exports

## Deliverables
- `packages/core/decision/types.ts`
- `packages/core/decision/engine.ts`
- `packages/core/decision/confidence.ts`
- `packages/core/decision/index.ts`
- `packages/core/decision/__tests__/decision.test.ts`

## Constraints
- Pure function: no DB access, no side effects
- Default criteria: sample_count ≥ 30 AND winrate ≥ 0.55 AND expectancy > 0
- Custom thresholds via strategy's decision_config override
- Wilson score 95% CI: lower = (p + z²/2n - z√(p(1-p)/n + z²/4n²)) / (1 + z²/n) where z=1.96
- Confidence tiers: Low (30-59), Medium (60-149), High (150-299), Very High (≥300)
- Decision reasons: criteria_met, insufficient_samples, low_winrate, negative_expectancy
- packages/core/decision may import from packages/core/vector (allowed per ARCHITECTURE.md)

## Steps
1. Create `packages/core/decision/types.ts`:
   - DecisionResult: { decision, reason, statistics, ciLower, ciUpper, confidenceTier }
   - DecisionConfig: { minSamples, minWinrate, minExpectancy }
   - ConfidenceTier: "low" | "medium" | "high" | "very_high"
2. Write failing tests (RED):
   - Criteria met → LONG (for long strategy)
   - Insufficient samples → PASS
   - Low winrate → PASS
   - Negative expectancy → PASS
   - Custom thresholds override
   - Wilson CI mathematical accuracy
   - Confidence tier boundaries
3. Implement `packages/core/decision/confidence.ts`:
   - wilsonScoreCI(winrate, n, z=1.96) → { lower, upper }
   - confidenceTier(sampleCount) → ConfidenceTier
4. Implement `packages/core/decision/engine.ts`:
   - judge(statistics, direction, config?) → DecisionResult
5. Make tests pass (GREEN)
6. Update barrel exports
7. Refactor

## Acceptance Criteria
- All criteria met (≥30 samples, ≥55% winrate, >0 expectancy) → returns strategy direction
- Any criterion not met → PASS with specific reason
- Custom config overrides default thresholds
- Wilson CI matches known values (manual verification)
- Confidence tier boundaries exact: 30-59=low, 60-149=medium, 150-299=high, ≥300=very_high
- Pure function: no side effects, deterministic output

## Validation
```bash
bun test -- --filter "decision"
bun run typecheck
bun run lint
```

## Out of Scope
- Decision persistence (vector worker's responsibility)
- Integration with vector search pipeline
- Daily loss limit check (EP08 risk module)
