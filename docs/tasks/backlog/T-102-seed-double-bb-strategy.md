# T-102 Double-BB strategy seed registration script

## Goal
Create a seed script that registers Double-BB-LONG and Double-BB-SHORT strategies in the database with proper configuration.

## Why
EP17 M3 — the strategies must be registered in the DB before backtest or real-time execution can begin.

## Inputs
- `packages/core/strategy/double-bb/script.ts` (T-100: strategy script)
- `db/schema/` (strategy table schema)
- EP17 M3 spec for configuration

## Dependencies
T-100, T-101

## Expected Outputs
- Seed script that registers 2 strategies (LONG + SHORT)
- Strategy configuration with indicator_config, features_definition, search_config

## Deliverables
- `scripts/seed-double-bb.ts`
- `scripts/__tests__/seed-double-bb.test.ts`

## Constraints
- Two separate strategies: Double-BB-LONG (direction=long), Double-BB-SHORT (direction=short)
- Both: symbols=['BTCUSDT'], timeframes=['1m','3m','5m','15m']
- indicator_config: BB20(close,20,2), BB4(open,4,4), MA(20,50,100,200), ATR(14)
- features_definition: 10 features with normalization types
- search_config: top_k=50, threshold≈0.95, min_samples=30
- result_config: tp_multiplier=2.0, sl_multiplier=1.0, max_hold_bars=60
- execution_mode: 'analysis' (initial)
- Idempotent: running twice does not create duplicates (upsert by name)

## Steps
1. Define strategy configuration objects
2. Implement seed script with DB connection
3. Implement upsert logic
4. Write unit tests for config validation

## Acceptance Criteria
- Script registers 2 strategies
- Idempotent execution (no duplicates)
- All configuration fields populated correctly
- Script exits cleanly

## Validation
```bash
bun test scripts/__tests__/seed-double-bb.test.ts
bun run typecheck
```

## Out of Scope
- Historical data loading
- Backtest execution
- Real-time pipeline
