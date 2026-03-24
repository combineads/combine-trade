# T-11-006 Implement funding rate collector service

## Goal
Build a service that collects funding rates from the exchange adapter and persists them to the funding_rates table.

## Why
EP11 M3 — funding rates affect PnL for perpetual futures positions. Without collection, cumulative funding cost cannot be tracked.

## Inputs
- `packages/exchange/types.ts` (ExchangeFundingRate from exchange adapter)
- `db/schema/funding-rates.ts` (funding_rates table)
- `packages/core/fee/funding.ts` (calculation functions)

## Dependencies
None (uses exchange adapter interface)

## Expected Outputs
- `FundingRateCollector` with `collectOnce()` method
- Stores current funding rate + next funding time
- Warning when funding rate exceeds threshold (>= 0.1%)

## Deliverables
- `packages/core/fee/funding-collector.ts`
- `packages/core/fee/__tests__/funding-collector.test.ts`

## Constraints
- Collects funding rates for all active symbols
- Deduplicates by (exchange, symbol, fundingTime) — skip if already stored
- Threshold warning: fundingRate >= 0.001 (0.1%) triggers warning callback
- All amounts as strings (Decimal.js compatible)
- Deps injected (exchange adapter, DB save function, warning callback)

## Steps
1. Write tests for collectOnce: normal, duplicate skip, threshold warning
2. Implement FundingRateCollector class
3. Handle deduplication and threshold check

## Acceptance Criteria
- Collects and persists funding rates for all symbols
- Skips already-stored rates (no duplicates)
- Calls warning callback when rate >= 0.1%
- Returns count of newly stored rates

## Validation
```bash
bun test packages/core/fee/__tests__/funding-collector.test.ts
bun run typecheck
```

## Out of Scope
- Historical backfill
- Scheduling (8-hour cron)
- UI display
