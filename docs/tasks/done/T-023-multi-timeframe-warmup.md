# T-023 Implement multi-timeframe access and warm-up period handling

## Goal
Add multi-timeframe data access to the Strategy API and implement automatic warm-up period detection and event suppression.

## Why
EP02-M4/M5 require strategies to access data from multiple timeframes and automatically handle the warm-up period where indicators don't have enough data.

## Inputs
- `packages/core/strategy/api.ts` — Strategy API from T-022
- `packages/core/indicator/` — Indicator functions (for lookback period detection)
- EP02 exec plan M4 (multi-timeframe) and M5 (warm-up) specifications

## Dependencies
- T-022 (Strategy API)

## Expected Outputs
- Updated `packages/core/strategy/api.ts` — multi-timeframe support
- `packages/core/strategy/warmup.ts` — Warm-up period detection and management

## Deliverables
- `timeframe(tf)` API: access candle data from different timeframes
- Multi-timeframe data pre-loading: load requested timeframes before execution
- Warm-up auto-detection: calculate max indicator lookback period from strategy code
- Event suppression during warm-up: skip event_condition evaluation
- Warm-up status reporting: log "warm-up in progress (N/M bars)"

## Constraints
- Multi-timeframe data must be pre-loaded (no async fetches during execution)
- Warm-up period = max(all indicator periods used) across all timeframes
- Higher timeframes multiply the warm-up (e.g., EMA(20) on 1h when base is 1m = 20 × 60 bars)

## Steps
1. Write failing tests for multi-timeframe data access
2. Implement timeframe data provider and API
3. Write failing tests for warm-up detection
4. Implement warm-up period calculator (analyze indicator calls)
5. Implement event suppression during warm-up
6. Test: EMA(200) → first 200 bars produce no events

## Acceptance Criteria
- `timeframe("1h")` provides 1h candle data inside sandbox
- Warm-up auto-detects max indicator period
- EMA(200) strategy → first 200 bars suppressed
- Multi-timeframe warm-up correctly multiplied
- Warm-up status logged at strategy start

## Validation
```bash
bun test --filter "strategy-api|warm-up|warmup"
bun run typecheck
bun run lint
```

## Out of Scope
- Strategy worker integration (T-025)
- Backtest warm-up exclusion (EP05)
