# T-02-003 Implement OBV and VWAP indicators

## Goal
Add OBV (On-Balance Volume) and VWAP (Volume Weighted Average Price) indicators to `packages/core/indicator/`.

## Why
EP02-M1 requires volume-based indicators. OBV and VWAP complete the indicator library specified in the exec plan.

## Inputs
- `packages/core/indicator/types.ts` — OHLCVInput, IndicatorResult
- EP02 exec plan M1 specification

## Dependencies
- T-00-004 (indicator foundation — done)

## Expected Outputs
- `packages/core/indicator/obv.ts` — OBV pure function
- `packages/core/indicator/vwap.ts` — VWAP pure function
- Updated barrel exports

## Deliverables
- OBV: cumulative volume with sign based on close-to-close direction
- VWAP: cumulative (typical price × volume) / cumulative volume, with optional session reset
- Unit tests for each

## Constraints
- Pure functions, no external dependencies
- OBV requires close[] and volume[] arrays
- VWAP requires high[], low[], close[], volume[]

## Steps
1. Write failing tests for OBV
2. Implement OBV
3. Write failing tests for VWAP
4. Implement VWAP
5. Update barrel exports

## Acceptance Criteria
- OBV correctly accumulates volume based on price direction
- OBV handles flat closes (no change = no volume added)
- VWAP computes correctly for known data
- Both handle empty/insufficient input

## Validation
```bash
bun test --filter "indicator"
bun run typecheck
bun run lint
```

## Out of Scope
- Session-based VWAP reset (uses full input range)
- WMA (Weighted Moving Average) — can add if needed later
