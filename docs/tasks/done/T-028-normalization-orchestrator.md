# T-028 Build normalization orchestrator

## Goal
Build the orchestrator that takes a strategy's features array (raw values + normalization configs) and produces a normalized [0,1] vector ready for embedding storage.

## Why
The vector worker needs a single function to transform strategy execution output (features with raw values) into a normalized vector. This orchestrates per-feature normalization and validates the final output.

## Inputs
- T-027 normalizers
- `packages/core/strategy/event-types.ts` (FeatureValue type)
- EP03 M1 spec (normalization orchestrator)

## Dependencies
- T-027 (normalizers)

## Expected Outputs
- `packages/core/vector/orchestrator.ts` — normalizeFeatures() function
- Updated `packages/core/vector/index.ts` barrel exports

## Deliverables
- `packages/core/vector/orchestrator.ts`
- `packages/core/vector/__tests__/orchestrator.test.ts`
- Updated `packages/core/vector/index.ts`

## Constraints
- Output vector dimension must equal features count
- All values in output must be in [0,1]
- Feature order must be preserved (features[0] → vector[0])
- Must handle mixed normalization methods (feature A = minmax, feature B = sigmoid)

## Steps
1. Write failing tests: features array → normalized number[] (RED)
2. Implement `normalizeFeatures(features: FeatureValue[], config?: NormalizationConfig)` that:
   - Iterates features in order
   - Applies each feature's normalization method via normalize()
   - Validates each output is [0,1]
   - Returns number[] (the embedding vector)
3. Handle edge cases: empty features → empty vector, single feature, all same method
4. Make tests pass (GREEN)
5. Update barrel exports
6. Refactor

## Acceptance Criteria
- Mixed normalization methods applied correctly per feature
- Output vector length === input features length
- Feature order preserved exactly
- Empty features → empty vector (no error)
- Any normalization failure → throws with feature name in error message

## Validation
```bash
bun test -- --filter "orchestrator"
bun run typecheck
bun run lint
```

## Out of Scope
- Dynamic table management
- Vector storage
- Historical percentile window loading (percentile normalizer receives pre-loaded history)
