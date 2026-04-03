# T-02-006 indicators/squeeze.ts — BB20 bandwidth squeeze detection

## Goal
Implement squeeze detection based on BB20 bandwidth contraction/expansion. Squeeze state is a key trigger for WATCHING state detection — the system looks for BB20 squeeze breakouts as potential entry setups.

## Why
The Double-BB strategy uses BB20 bandwidth contraction (squeeze) as a precondition for WATCHING state. When BB20 bandwidth contracts below a threshold and then expands, it signals a potential breakout — one of the three WATCHING detection types (SQUEEZE_BREAKOUT).

## Inputs
- `src/indicators/types.ts` (T-02-001) — SqueezeState type, BollingerResult type
- `src/indicators/bollinger.ts` (T-02-002) — calcBB20 for bandwidth values
- `src/core/decimal.ts` — Decimal comparison functions

## Dependencies
T-02-001 (indicators/types.ts)
T-02-002 (indicators/bollinger.ts — needs BollingerResult for bandwidth series)

## Expected Outputs
- `src/indicators/squeeze.ts` — detectSqueeze() function
- Used by WATCHING detector (EP-05)

## Deliverables
- `src/indicators/squeeze.ts`

## Constraints
- L2 module: imports from `core/` and `indicators/`
- Squeeze detection uses bandwidth percentile or lookback comparison
- Returns SqueezeState: "squeeze" | "expansion" | "normal"
- Must work with a series of bandwidth values (not just a single point)

## Steps
1. Import SqueezeState from `./types`
2. Import Decimal comparison helpers from `@/core/decimal`
3. Define squeeze detection logic:
   - `detectSqueeze(bandwidths: Decimal[], lookback: number = 20): SqueezeState`
   - Calculate the average bandwidth over the lookback period
   - If current bandwidth < 50% of average → "squeeze"
   - If current bandwidth > 150% of average → "expansion"
   - Otherwise → "normal"
4. Alternative/additional: `detectSqueezeByPercentile(bandwidths: Decimal[], threshold: number = 20): SqueezeState`
   - If current bandwidth is in the bottom `threshold`% of the lookback → "squeeze"
5. Export detectSqueeze
6. Write tests with synthetic data
7. Verify typecheck passes

## Acceptance Criteria
- Returns "squeeze" when bandwidth is significantly below average
- Returns "expansion" when bandwidth is significantly above average
- Returns "normal" for moderate bandwidth
- Handles edge cases: empty array, single value, all-same values
- `bun run typecheck` passes

## Test Scenarios
- detectSqueeze with contracting bandwidths (decreasing series) → returns "squeeze"
- detectSqueeze with expanding bandwidths (last value >> average) → returns "expansion"
- detectSqueeze with stable bandwidths → returns "normal"
- detectSqueeze with empty array → returns "normal" (safe default)
- detectSqueeze with single value → returns "normal"
- detectSqueeze with all-same values → returns "normal"
- detectSqueeze transition: squeeze → expansion (bandwidth doubles) → detected correctly

## Validation
```bash
bun run typecheck
bun test --grep "squeeze"
```

## Out of Scope
- Full WATCHING detection logic (EP-05: squeeze breakout + S/R confluence + BB4 touch)
- Historical squeeze pattern analysis
