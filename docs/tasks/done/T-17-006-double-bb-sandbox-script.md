# T-17-006 Double-BB sandbox strategy script

## Goal
Write the Double-BB strategy script that runs inside the sandbox executor, using the sandbox indicator API and defineFeature() calls to produce the 10-feature vector.

## Why
EP17 M2/M3 bridge — the strategy script is what gets registered in the DB and executed by the strategy-worker. It translates sandbox API calls into Double-BB evaluation logic.

## Inputs
- `packages/core/strategy/double-bb/evaluate.ts` (T-17-005)
- `packages/core/strategy/executor.ts` (sandbox API)
- `packages/core/strategy/api.ts` (defineFeature, defineEvent)

## Dependencies
T-17-005, T-17-001

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

## Implementation Notes
- Date: 2026-03-22
- Files changed: `script.ts`, `__tests__/script.test.ts`
- Approach: Inlined all Double-BB logic (pattern detection, evidence, gate, features) into a single IIFE string
- Script uses: indicator.bb(), indicator.sma(), indicator.atr(), defineFeature(), setEntry(), context.direction
- Early exit for bar_index < 20, zero-range candles, no pattern, gate rejection
- H1 bias simplified to use current-TF MA slope as proxy (full implementation would use candle() for 1h data)
- Volume ratio computed inline with 20-bar lookback
- Tests: 7 sandbox integration tests with synthetic candle data (bullish trend, flat, bearish, direction filter, insufficient data)
- Validation: 7/7 pass, typecheck clean

## Outputs
- `DOUBLE_BB_SCRIPT` string constant for sandbox execution
- Script produces 10 named features with `{ method: "none" }` normalization
- Script calls setEntry(true) when gate passes

## Out of Scope
- DB registration
- Backtest execution
- Real-time pipeline
