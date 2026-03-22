# T-027 Implement feature normalizers

## Goal
Implement all normalization functions that transform raw feature values to [0,1] range: percent, sigmoid, boolean, minmax, percentile, and none.

## Why
The vector engine requires all features normalized to [0,1] before creating embeddings. Each strategy defines per-feature normalization methods that must be applied consistently.

## Inputs
- EP03 exec-plan M1 (normalization engine spec)
- `packages/core/strategy/event-types.ts` (FeatureValue with normalization config)
- ARCHITECTURE.md §packages/core/vector

## Dependencies
- T-019 (strategy types with FeatureDefinition and normalization config)

## Expected Outputs
- `packages/core/vector/types.ts` — NormalizationMethod type, NormalizationConfig interface
- `packages/core/vector/normalize.ts` — all normalizer functions + normalize() dispatcher
- Comprehensive tests for each normalizer

## Deliverables
- `packages/core/vector/types.ts`
- `packages/core/vector/normalize.ts`
- `packages/core/vector/__tests__/normalize.test.ts`

## Constraints
- All outputs must be in [0,1] range — values outside range must throw
- Edge cases: NaN → 0.0, Infinity → clamp to 0.0 or 1.0, zero variance → 0.0
- packages/core/vector must not import Elysia, CCXT, Drizzle, or Slack
- No core dependencies (vector is a leaf module)

## Steps
1. Create `packages/core/vector/types.ts` with NormalizationMethod union type ("percent" | "sigmoid" | "boolean" | "minmax" | "percentile" | "none") and NormalizationConfig interface
2. Write failing tests for each normalizer (RED)
3. Implement normalizers in `packages/core/vector/normalize.ts`:
   - `percent(value)`: value / 100, clamp [0,1]
   - `sigmoid(value)`: 1 / (1 + Math.exp(-value))
   - `boolean(value)`: value > 0 ? 1 : 0
   - `minmax(value, config)`: (value - min) / (max - min), requires domain range in config
   - `percentile(value, history, config)`: rolling percentile within window
   - `none(value)`: passthrough (must already be in [0,1])
4. Implement `normalize(value, method, config?, history?)` dispatcher
5. Add edge case handling (NaN, Infinity, zero division)
6. Make tests pass (GREEN)
7. Refactor for clarity

## Acceptance Criteria
- Each normalizer produces mathematically correct output
- All outputs guaranteed in [0,1] range
- NaN input → 0.0
- Infinity → clamped (positive=1.0, negative=0.0)
- minmax with zero range (min===max) → 0.0
- percentile with empty history → 0.5
- none with value outside [0,1] → throws

## Validation
```bash
bun test -- --filter "normalize"
bun run typecheck
bun run lint
```

## Out of Scope
- Normalization orchestrator (T-028)
- Integration with strategy execution pipeline
- zscore normalization (not in EP03 spec, can add later)
