# T-01-012 config/seed.ts — Initial seed data for all CommonCode groups

## Goal
Create the seed data script at `src/config/seed.ts` that populates the CommonCode table with initial configuration values for all groups (EXCHANGE, TIMEFRAME, SYMBOL_CONFIG, KNN, POSITION, LOSS_LIMIT, SLIPPAGE, FEATURE_WEIGHT, TIME_DECAY, WFO, ANCHOR, NOTIFICATION).

## Why
The system cannot start without base configuration. Seed data provides the default values for all tunable parameters, exchange metadata, and structural anchors. This script makes it possible to set up a new environment with a single command (`bun run seed`).

## Inputs
- `docs/DATA_MODEL.md` — CommonCode group definitions, ANCHOR values, example data
- `docs/PRODUCT.md` — strategy parameters (BB20, BB4, MA, max leverage, loss limits)
- `src/config/schema.ts` (T-01-010) — Zod schemas for validation before insert
- `src/config/loader.ts` (T-01-011) — config API for verification after seed
- `src/db/pool.ts` (T-01-007) — database connection

## Dependencies
T-01-011 (config/loader.ts — seed verification via loadConfig after insert)

## Expected Outputs
- `src/config/seed.ts` — seed script with all CommonCode default values
- Working `bun run seed` command
- Database populated with all initial configuration

## Deliverables
- `src/config/seed.ts`

## Constraints
- Seed must be idempotent: use INSERT ... ON CONFLICT DO NOTHING (don't overwrite existing values)
- All values must pass Zod schema validation before insertion
- ANCHOR group values must exactly match constants in core/constants.ts
- Must seed ALL groups defined in DATA_MODEL.md (12 groups including NOTIFICATION)
- Numeric values in seed data must be strings or numbers matching schema expectations

## Steps
1. Define seed data arrays per group:
   - **EXCHANGE**: binance `{ name: "Binance Futures", supports_one_step_order: true, supports_edit_order: true, rate_limit_per_min: 1200, min_order_size: "5", priority: 1 }`, okx, bitget, mexc
   - **TIMEFRAME**: 1D `{ duration_seconds: 86400, display_name: "1일" }`, 1H, 5M, 1M
   - **SYMBOL_CONFIG**: BTCUSDT `{ risk_pct: "0.03", max_leverage: 38 }`, XAUTUSDT
   - **KNN**: top_k=50, min_samples=30, distance_metric="cosine"
   - **POSITION**: max_pyramid_count=2, default_leverage=20
   - **LOSS_LIMIT**: max_daily_loss_pct="0.10", max_session_losses=3, max_1h_5m_losses=2, max_1h_1m_losses=1
   - **SLIPPAGE**: max_spread_pct="0.05", max_slippage_pct="0.10"
   - **FEATURE_WEIGHT**: bb4_position=2.0, wick_ratio=1.5, etc.
   - **TIME_DECAY**: 1_month=1.0, 3_months=0.8, 6_months=0.6, 12_months=0.3
   - **WFO**: in_sample_months=6, out_sample_months=2, roll_months=1
   - **ANCHOR**: bb20 `{ length: 20, stddev: 2, source: "close" }`, bb4 `{ length: 4, stddev: 4, source: "close" }`, ma_periods `{ periods: [20, 60, 120] }`, normalization `{ method: "MEDIAN_IQR" }`, vector_dim `{ dim: 202 }`
   - **NOTIFICATION**: slack_webhook `{ webhook_url: "", channel: "#trading-alerts", enabled: false }`
2. Create `seed()` function:
   - Validate each value against its group's Zod schema
   - INSERT ... ON CONFLICT (group_code, code) DO NOTHING
   - Log count of inserted vs skipped rows
3. Create `resetSeed()` function (dev only):
   - DELETE all CommonCode rows
   - Re-run seed
4. Update `package.json` script: `"seed": "bun src/config/seed.ts"`
5. Run seed and verify with `loadConfig()`
6. Write tests
7. Verify `bun run typecheck` passes

## Acceptance Criteria
- `bun run seed` inserts all CommonCode rows for 12 groups
- Running `bun run seed` twice doesn't duplicate or overwrite existing values
- All seed values pass Zod schema validation
- ANCHOR group values match core/constants.ts exactly
- NOTIFICATION group is seeded with disabled defaults
- After seed, `loadConfig()` succeeds and all groups are accessible
- `bun run typecheck` passes

## Test Scenarios
- seed() on empty DB → all 12 groups populated with correct row counts
- seed() twice → second run inserts 0 rows (idempotent, ON CONFLICT DO NOTHING)
- ANCHOR seed values match constants (bb20.length=20, bb4.length=4, etc.)
- All seed values pass Zod schema validation → no validation errors during seed
- EXCHANGE group has entries for all 4 exchanges (binance, okx, bitget, mexc)
- TIMEFRAME group has entries for all 4 timeframes (1D, 1H, 5M, 1M)
- NOTIFICATION group has slack_webhook entry with enabled=false

## Validation
```bash
bun run typecheck
bun run migrate && bun run seed
bun test --grep "config/seed"
```

## Out of Scope
- TradeBlock seed data (recurring market open / funding patterns — filters module epic)
- Symbol seed data (handled separately, depends on exchange validation)
- Web UI for editing seed values
- Production data migration
