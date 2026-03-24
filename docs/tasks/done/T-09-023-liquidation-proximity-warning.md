# T-09-023 — Liquidation proximity warning monitor

## Goal
Implement a `LiquidationWarningMonitor` class in `packages/core/risk/` that evaluates open positions for proximity to liquidation and emits warnings via an injected notifier when a position is within a configurable threshold. An in-memory cooldown prevents repeated alerts for the same position.

## Steps
1. Write tests first (RED)
2. Implement `liquidation-warning-monitor.ts` (GREEN)
3. Export from `packages/core/risk/index.ts`
4. Run validation

## Constraints
- All arithmetic with Decimal.js — no native float
- No direct imports of CCXT, Drizzle, Elysia, or Slack — use injected deps
- In-memory cooldown map keyed by positionId
- Pure function `isNearLiquidation` must be exported separately

## Acceptance criteria
- `isNearLiquidation` returns correct boolean for LONG and SHORT
- `check()` calls notifier only when within threshold AND cooldown expired
- cooldown prevents duplicate warnings within the window
- all arithmetic uses Decimal.js
