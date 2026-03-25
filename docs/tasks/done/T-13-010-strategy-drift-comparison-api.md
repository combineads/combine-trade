# T-13-010 Strategy Drift Comparison API

## Goal
Build a strategy drift comparison API that detects divergence between backtest expectations and live trading results using statistical significance testing, producing a drift score and alert level per strategy.

## Why
A strategy that performed well in backtesting may underperform in live trading due to market regime changes, overfitting, or execution slippage. Without automated comparison of backtest vs live statistics, traders may not notice degradation until significant losses have occurred. This API enables proactive monitoring and alerting.

## Inputs
- `packages/shared/db/schema/trade_journals.ts` — live trade journal records (T-13-006)
- `packages/shared/db/schema/backtest_results.ts` — backtest result records (T-14-003)
- `apps/api/src/routes/journals/index.ts` — journal router (T-13-008)
- `packages/core/drift/` — DriftDetector for chi-squared math (T-13-007)
- `docs/exec-plans/13-journal-analytics.md` — EP13 drift comparison spec

## Dependencies
- T-13-009 (journal analytics API — establishes analytics route patterns and auth)
- T-14-003 (backtest results schema — provides backtest winrate/expectancy/sharpe source data)

## Expected Outputs
- `apps/api/src/routes/journals/drift.ts` — drift comparison endpoint handler
- `apps/api/__tests__/routes/journals-drift.test.ts` — test suite
- Updated `apps/api/src/routes/journals/index.ts` — registers drift route

## Deliverables
- `GET /api/v1/journals/drift/:strategyId` — drift comparison endpoint:
  - Path param: `strategyId` (UUID)
  - Query params: `from` (ISO date, default 30 days ago), `to` (ISO date, default now)
  - Response: `DriftComparison`
  - User isolation: strategy must belong to authenticated user
- `DriftComparison` shape:
  ```
  {
    strategyId: string;
    backtestStats: { winrate: string; expectancy: string; sharpe: string };
    liveStats: { winrate: string; expectancy: string; sharpe: string; tradeCount: number };
    zScore: string;
    pValue: string;
    driftScore: number;          // 0–100
    alertLevel: 'none' | 'warning' | 'critical';
    isSignificant: boolean;
  }
  ```
- Z-test for winrate divergence: `z = (p_live − p_backtest) / sqrt(p_backtest * (1 − p_backtest) / n)`
- Drift score mapped from |z-score| to 0–100 range
- Alert thresholds: warning at drift score >= 60, critical at drift score >= 80
- Minimum sample size guard: if live `tradeCount < 30`, return `driftScore: 0, alertLevel: 'none'`

## Constraints
- Use Decimal.js for all statistical computations (z-score, p-value, winrate, expectancy, sharpe)
- User isolation: reject with 403 if strategy does not belong to authenticated user
- Must not query across strategy + version + symbol scope boundaries per vector isolation rules
- Reuse chi-squared/p-value helpers from `packages/core/drift/` where applicable

## Steps
1. Write failing tests first (RED):
   - Test: z-score computed correctly for known backtest vs live winrate pair
   - Test: drift score maps |z-score| to 0–100 correctly
   - Test: `alertLevel: 'critical'` when drift score >= 80
   - Test: `alertLevel: 'warning'` when drift score >= 60
   - Test: minimum sample guard returns no-drift for < 30 live trades
   - Test: 403 returned if strategy belongs to different user
   - Test: 404 returned if strategyId not found
   - Test: Decimal.js used for all statistical outputs
2. Implement drift comparison handler (GREEN):
   - Load backtest stats from backtest_results for strategyId
   - Load live stats from trade_journals within date range
   - Compute z-test with Decimal.js
   - Map to drift score and alert level
3. Register route in journal router
4. Refactor (REFACTOR): extract z-test computation into a pure testable function

## Acceptance Criteria
- Z-score and p-value match reference values within 0.001 tolerance for known inputs
- Drift score correctly mapped to 0–100 range from |z-score|
- Alert level thresholds applied correctly
- Minimum sample size guard prevents false positives
- 403 on cross-user access, 404 on missing strategy
- `bun test -- --filter "drift-comparison"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "drift-comparison"
bun run typecheck
bun run lint
```

## Out of Scope
- Automated strategy suspension on drift (future epic)
- Expectancy and Sharpe drift testing (winrate z-test only in this task)
- Cross-strategy or cross-symbol drift comparison
- UI visualization of drift trends (EP22)
