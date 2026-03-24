# T-02-012 WMA Indicator

## Goal
Implement WMA (Weighted Moving Average) in `packages/core/indicator/wma.ts`, following the same pattern as `sma.ts` and `ema.ts`.

## Why
WMA is a common technical indicator used by strategies. WMA weights recent data more heavily using a linear weight scheme: `sum(price_i * weight_i) / sum(weights)` where weights = [1, 2, 3, ..., period].

## Inputs
- `packages/core/indicator/sma.ts` and `ema.ts` — pattern reference
- `packages/core/indicator/index.ts` — export target
- `packages/core/indicator/__tests__/indicator.test.ts` — test style

## Dependencies
None

## Expected Outputs
- `packages/core/indicator/wma.ts`
- New `describe("WMA")` block in `packages/core/indicator/__tests__/indicator.test.ts`
- `packages/core/indicator/index.ts` updated to export `wma`

## Deliverables
- `wma(source: number[], period: number): Promise<IndicatorResult>`
- WMA formula: `sum(price_i * i) / sum(1..period)`, weights = 1,2,...,period (most recent = highest)
- Output length: `source.length - period + 1`
- Handles edge case: period > source.length → returns empty array

## Constraints
- Use native float (not Decimal.js) per existing indicator pattern
- No external library for WMA — compute manually (ixjb94/indicators may not have WMA)

## Steps
1. Write failing tests in indicator.test.ts
2. Implement wma.ts
3. Export from index.ts
4. Run `bun test` + `bun run typecheck`

## Acceptance Criteria
- WMA(3) of [1,2,3,4,5] produces correct linearly-weighted values
- WMA of constant series returns that constant
- Period > length returns empty array
- All tests pass

## Validation
```bash
bun test packages/core/indicator/__tests__/
bun run typecheck
```

## Implementation Notes
<!-- filled by implementer -->

## Outputs
<!-- filled by implementer -->
