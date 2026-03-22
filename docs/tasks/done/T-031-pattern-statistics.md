# T-031 Implement pattern statistics calculator

## Goal
Build the statistics calculator that computes winrate, average win/loss, expectancy, and sample count from labeled events matching similar vector patterns.

## Why
The decision engine needs pattern statistics to determine whether to enter a trade. Statistics are computed from historical labels of events whose vectors are similar to the current event.

## Inputs
- EP03 M4 spec (pattern statistics computation)
- `db/schema/event-labels.ts` (label schema reference)
- PRODUCT.md §3 statistics computation

## Dependencies
- None within EP03 (pure computation, uses fixture label data for tests)

## Expected Outputs
- `packages/core/vector/statistics.ts` — PatternStatistics type + computeStatistics() function
- Tests with fixture label data

## Deliverables
- `packages/core/vector/statistics.ts`
- `packages/core/vector/__tests__/statistics.test.ts`

## Constraints
- Pure function: receives labeled event data, returns statistics
- winrate = WIN count / total labeled count (TIME_EXIT counts as neither WIN nor LOSS for winrate, but included in sample_count)
- Actually per PRODUCT.md: winrate = WIN / total (TIME_EXIT included in total)
- expectancy = (winrate × avg_win) - ((1 - winrate) × avg_loss)
- avg_win = mean of pnl_pct where result_type = WIN
- avg_loss = mean of |pnl_pct| where result_type = LOSS or TIME_EXIT with negative pnl
- Events without labels are excluded from statistics
- min_samples check: if total labeled < 30 → INSUFFICIENT

## Steps
1. Define PatternStatistics type: { winrate, avgWin, avgLoss, expectancy, sampleCount, status }
2. Define EventLabel input type (result_type, pnl_pct)
3. Write failing tests with fixture data (RED):
   - Known winrate calculation
   - Known expectancy calculation
   - Edge cases: zero samples, exactly 30, all wins, all losses
4. Implement computeStatistics(labels: EventLabel[]):
   - Filter to labeled events only
   - Count WIN, LOSS, TIME_EXIT
   - Compute winrate, avg_win, avg_loss, expectancy
   - Return INSUFFICIENT if total < 30
5. Make tests pass (GREEN)
6. Refactor

## Acceptance Criteria
- winrate mathematically correct (verified against manual calculation)
- expectancy = (winrate × avg_win) - ((1 - winrate) × avg_loss)
- 0 labeled events → INSUFFICIENT
- < 30 labeled events → INSUFFICIENT
- ≥ 30 labeled events → SUFFICIENT with computed statistics
- All wins → winrate=1.0, avg_loss=0, expectancy=avg_win
- All losses → winrate=0.0, avg_win=0, expectancy=-avg_loss
- TIME_EXIT with negative pnl contributes to loss statistics

## Validation
```bash
bun test -- --filter "statistics"
bun run typecheck
bun run lint
```

## Out of Scope
- Integration with vector search (vector worker handles the join)
- Real database queries
- Label creation (EP04 scope)
