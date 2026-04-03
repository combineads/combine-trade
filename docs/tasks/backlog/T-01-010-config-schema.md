# T-01-010 config/schema.ts — CommonCode Zod validation schemas

## Goal
Define Zod validation schemas for each CommonCode group in `src/config/schema.ts`. These schemas validate the `value` (jsonb) column of CommonCode rows, ensuring type safety when reading configuration from the database.

## Why
CommonCode stores all system configuration as jsonb values. Without schema validation, any malformed config could crash the system at runtime. Zod schemas provide runtime validation with TypeScript type inference, catching configuration errors at load time rather than during trading operations.

## Inputs
- `docs/DATA_MODEL.md` — CommonCode group definitions (EXCHANGE, TIMEFRAME, SYMBOL_CONFIG, KNN, POSITION, LOSS_LIMIT, SLIPPAGE, FEATURE_WEIGHT, TIME_DECAY, WFO, ANCHOR, NOTIFICATION)
- `src/core/types.ts` (T-01-002) — enum types used in schema validation

## Dependencies
T-01-002 (core/types.ts — enum types for validation)

## Expected Outputs
- `src/config/schema.ts` — Zod schemas per CommonCode group, schema registry
- Config loader (T-01-011) imports these to validate loaded data

## Deliverables
- `src/config/schema.ts`

## Constraints
- L1 module: may import from `core/` only
- Each CommonCode group must have a dedicated Zod schema for its `value` field
- ANCHOR group schema must include a "frozen" flag or annotation indicating immutability
- All numeric values in schemas that represent money/prices must be validated as string (Decimal-compatible)
- Must export a schema registry mapping `group_code → ZodSchema`
- Must export inferred TypeScript types from schemas

## Steps
1. Import Zod and core types
2. Define schemas for each CommonCode group's `value` field:
   - `ExchangeConfigSchema`: `{ name, adapter_type, supports_one_step_order, supports_edit_order, rate_limit_per_min, min_order_size, priority }`
   - `TimeframeConfigSchema`: `{ duration_seconds, display_name }`
   - `SymbolConfigSchema`: `{ risk_pct, max_leverage }`
   - `KnnConfigSchema`: numeric value (e.g., top_k: 50)
   - `PositionConfigSchema`: numeric value
   - `LossLimitConfigSchema`: numeric value
   - `SlippageConfigSchema`: numeric value
   - `FeatureWeightConfigSchema`: numeric value
   - `TimeDecayConfigSchema`: numeric value
   - `WfoConfigSchema`: numeric value
   - `AnchorConfigSchema`: `{ length?, stddev?, source?, periods? }` (varies by anchor type)
   - `NotificationConfigSchema`: `{ webhook_url, channel?, enabled }`
3. Create schema registry: `CONFIG_SCHEMAS: Record<CommonCodeGroup, ZodSchema>`
4. Create validation function: `validateConfigValue(group: string, code: string, value: unknown): Result`
5. Create ANCHOR_GROUPS constant listing all immutable group codes
6. Export all schemas, registry, types, and validation function
7. Write tests for valid and invalid config values
8. Verify `bun run typecheck` passes

## Acceptance Criteria
- Every CommonCode group from DATA_MODEL.md has a Zod schema
- Valid config values pass validation
- Invalid config values produce descriptive Zod errors
- ANCHOR group is marked as immutable in the schema registry
- TypeScript types are inferred from schemas (no manual type duplication)
- Schema registry maps every group_code to its schema
- `bun run typecheck` passes

## Test Scenarios
- validateConfigValue('EXCHANGE', 'binance', valid exchange config) → passes validation
- validateConfigValue('EXCHANGE', 'binance', { missing_required_field }) → fails with descriptive error
- validateConfigValue('SYMBOL_CONFIG', 'BTCUSDT', { risk_pct: '0.03', max_leverage: 38 }) → passes
- validateConfigValue('KNN', 'top_k', 50) → passes (simple numeric value)
- validateConfigValue('ANCHOR', 'bb20', { length: 20, stddev: 2, source: 'close' }) → passes
- ANCHOR_GROUPS includes 'ANCHOR' → ANCHOR is recognized as immutable
- CONFIG_SCHEMAS has entries for all 12 groups (including NOTIFICATION)

## Validation
```bash
bun run typecheck
bun test --grep "config/schema"
```

## Out of Scope
- Loading config from database (T-01-011)
- Seed data definition (T-01-012)
- Runtime config change watching
- Web UI config editor
