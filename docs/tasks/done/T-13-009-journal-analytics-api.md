# T-13-009 Journal Analytics API

## Goal
Build a journal analytics aggregation API that groups trade journal entries by tag, symbol, strategy, or timeframe and returns winrate, expectancy, average PnL, and trade count per group.

## Why
Traders need to analyze their performance across different dimensions — by market state tag, by symbol, by strategy, or by time period — to identify which conditions produce profitable outcomes and which do not. Without an aggregation API, this analysis must be done manually from raw data.

## Inputs
- `packages/shared/db/schema/trade_journals.ts` — trade_journals table (T-13-006)
- `apps/api/src/routes/journals/index.ts` — journal router (T-13-008)
- `packages/shared/db/index.ts` — DrizzleORM instance
- `docs/exec-plans/13-journal-analytics.md` — EP13 analytics spec

## Dependencies
- T-13-008 (journal list/detail/search API — establishes the journal router and auth patterns)

## Expected Outputs
- `apps/api/src/routes/journals/analytics.ts` — analytics endpoint handler
- `apps/api/__tests__/routes/journals-analytics.test.ts` — test suite
- Updated `apps/api/src/routes/journals/index.ts` — registers analytics route

## Deliverables
- `GET /api/v1/journals/analytics` — aggregation endpoint:
  - Query params:
    - `groupBy`: `tag` | `symbol` | `strategy` | `timeframe` (required)
    - `from`: ISO date (optional, default 90 days ago)
    - `to`: ISO date (optional, default now)
    - `strategyId`: filter to specific strategy (optional)
    - `symbol`: filter to specific symbol (optional)
  - Response: `{ groups: AnalyticsGroup[] }`
  - `AnalyticsGroup`: `{ key: string; winrate: string; expectancy: string; avgPnl: string; tradeCount: number }`
  - All monetary values returned as decimal strings (Decimal.js serialized)
  - User isolation: always filters by `userId` from JWT
- Aggregation logic:
  - `winrate` = WIN count / (WIN + LOSS count) as percentage string
  - `expectancy` = (winrate × avg_win_pnl) − ((1 − winrate) × avg_loss_pnl)
  - `avgPnl` = sum(pnl) / tradeCount
  - PASS trades excluded from winrate/expectancy but included in tradeCount

## Constraints
- Use Decimal.js for all monetary aggregations — never native float for PnL, winrate, or expectancy
- PASS trades must be excluded from winrate and expectancy numerators/denominators but counted in `tradeCount`
- User isolation: never aggregate across userId boundaries
- `groupBy=tag` must handle multi-tag entries (one trade may appear in multiple tag groups)
- Empty group returns `{ winrate: "0", expectancy: "0", avgPnl: "0", tradeCount: 0 }`

## Steps
1. Write failing tests first (RED):
   - Test: `groupBy=symbol` returns correct winrate/expectancy/avgPnl per symbol
   - Test: `groupBy=tag` expands multi-tag trades correctly (trade appears in each of its tag groups)
   - Test: `groupBy=strategy` aggregates across all symbols in strategy
   - Test: `groupBy=timeframe` groups by candle timeframe (1h, 4h, 1d)
   - Test: PASS trades excluded from winrate/expectancy, included in tradeCount
   - Test: date range filter restricts aggregation window
   - Test: user isolation — returns only own journals in aggregation
   - Test: Decimal.js used for all monetary outputs (no floating point drift)
2. Implement analytics handler (GREEN):
   - For `groupBy=tag`: unnest tags array, group by each tag
   - For other groupBy: standard SQL GROUP BY
   - Compute winrate, expectancy, avgPnl with Decimal.js post-query
3. Register route in journal router
4. Refactor (REFACTOR): extract aggregation math into a pure `computeGroupStats(trades: JournalEntry[]): GroupStats` helper

## Acceptance Criteria
- `groupBy=tag` handles multi-tag trades without double-counting trade counts
- Winrate and expectancy computed correctly for known fixtures (verified against manual calculation)
- PASS trades correctly excluded from winrate/expectancy numerators
- All monetary values returned as decimal strings, not floats
- User isolation enforced
- `bun test -- --filter "journal-analytics"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "journal-analytics"
bun run typecheck
bun run lint
```

## Out of Scope
- Strategy drift comparison (T-13-010)
- UI charts and visualizations (EP22)
- Cross-user analytics (admin reporting)
- Custom date bucketing (weekly/monthly grouping)
