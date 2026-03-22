# T-100 Double-BB sandbox strategy script

## Goal
Write the Double-BB strategy script that runs inside the sandbox executor, using the sandbox indicator API and defineFeature() calls to produce the 10-feature vector.

## Why
EP17 M2/M3 bridge — the strategy script is what gets registered in the DB and executed by the strategy-worker. It translates sandbox API calls into Double-BB evaluation logic.

## Inputs
- `packages/core/strategy/double-bb/evaluate.ts` (T-099)
- `packages/core/strategy/executor.ts` (sandbox API)
- `packages/core/strategy/api.ts` (defineFeature, defineEvent)

## Dependencies
T-099, T-095

## Expected Outputs
- Double-BB strategy script string (executable in sandbox)
- Test verifying script runs in sandbox and produces features

## Deliverables
- `packages/core/strategy/double-bb/script.ts` (exports the script string)
- `packages/core/strategy/double-bb/__tests__/script.test.ts`

## Constraints
- Script must use only sandbox-available APIs (indicator.*, defineFeature, defineEvent, context.*)
- Must not import any external modules (runs in QuickJS sandbox)
- All Double-BB logic must be inlined in the script string
- Script must handle edge cases (insufficient data, zero-range candles)

## Steps
1. Write the strategy script string with inlined Double-BB logic
2. Write sandbox integration test (execute script with test candles)
3. Verify 10 features produced with correct names and normalization
4. Verify event emitted only when gate passes

## Acceptance Criteria
- Script executes in sandbox without errors
- Produces 10 defineFeature() calls when gate passes
- Produces defineEvent() call with TP/SL when gate passes
- No output when gate rejects
- Uses context.direction for filtering

## Validation
```bash
bun test packages/core/strategy/double-bb/__tests__/script.test.ts
bun run typecheck
```

## Out of Scope
- DB registration
- Backtest execution
- Real-time pipeline
