# T-17-007 Custom indicator pre-compute via strategy indicator_config

## Goal
Extend the StrategyExecutor to support strategy-specific indicator_config for custom pre-computation (BB with custom source/period/stddev, MA with custom periods).

## Why
EP17 M1/M3 — Double-BB needs BB4(open,4,4) and MA100/MA200, which are not in the default pre-compute set. The executor must read indicator_config and pre-compute additional indicators.

## Inputs
- `packages/core/strategy/executor.ts` (current pre-compute logic)
- EP17 M1 spec for indicator_config format

## Dependencies
None (extends existing executor)

## Expected Outputs
- Extended executor that reads indicator_config and pre-computes custom indicators
- BB with custom source (open/close), period, stddev support
- MA with custom periods (100, 200) support

## Deliverables
- Modified `packages/core/strategy/executor.ts`
- `packages/core/strategy/__tests__/custom-precompute.test.ts`

## Constraints
- Backward compatible: strategies without indicator_config use default pre-compute
- indicator_config is a JSON object with keys: bb, ma, atr
- Must not break existing 48 strategy tests
- Pre-computed data injected via __preComputed global

## Steps
1. Define IndicatorConfig interface
2. Extend preComputeIndicators to accept optional config
3. Add BB custom source/period/stddev support
4. Add MA custom period support
5. Write tests verifying custom pre-compute values accessible in sandbox

## Acceptance Criteria
- indicator.bb(open, 4, 4) returns valid BB4 data when configured
- indicator.sma(close, 100) returns valid data when configured
- Default pre-compute unchanged for strategies without config
- All existing strategy tests pass

## Validation
```bash
bun test packages/core/strategy/__tests__/custom-precompute.test.ts
bun test packages/core/strategy/
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files changed: `packages/core/strategy/executor.ts`, `packages/core/strategy/__tests__/custom-precompute.test.ts`
- Added IndicatorConfig interface (bb, sma, ema, atr arrays)
- Added indicatorConfig optional field to ExecutionInput
- Added applyCustomConfig method that computes additional indicators and merges into pre-computed results
- Added padArray/padBBResult utilities to left-pad indicator arrays with NaN to match source length (fixes index alignment)
- All existing 109 strategy tests still pass (backward compatible)
- Tests: 4 new tests (custom BB, custom SMA, default fallback, custom ATR)
- Validation: 907/907 full suite pass, typecheck clean

## Outputs
- `IndicatorConfig` interface: `{ bb?: BbConfig[], sma?: PeriodConfig[], ema?: PeriodConfig[], atr?: PeriodConfig[] }`
- `BbConfig`: `{ source: "open"|"close", period: number, stddev: number }`
- `PeriodConfig`: `{ period: number }`
- `ExecutionInput.indicatorConfig` optional field

## Out of Scope
- DB schema changes for indicator_config storage
- Strategy registration seed script
