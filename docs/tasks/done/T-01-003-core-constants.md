# T-01-003 core/constants.ts — Structural anchors and immutable constants

## Goal
Define all structural anchor constants in `src/core/constants.ts` using `as const` assertions. These are the immutable parameters of the Double-BB strategy that must never be tuned by WFO or changed at runtime.

## Why
The Double-BB strategy relies on fixed structural anchors (BB20, BB4, MA periods). Making these constants immutable prevents accidental modification and ensures backtest reproducibility. The PRODUCT.md and ARCHITECTURE.md both mandate these as code-fixed values.

## Inputs
- `docs/DATA_MODEL.md` — ANCHOR group definition in CommonCode (bb20, bb4, ma20, ma60, ma120)
- `docs/ARCHITECTURE.md` — `as const` requirement, explicit constraint table
- `docs/PRODUCT.md` — BB20(20,2), BB4(4,4), MA(20/60/120) immutable constraint
- `src/core/types.ts` (T-01-002) — type definitions for config structures

## Dependencies
T-01-002 (core/types.ts — need entity/enum types for typed constants)

## Expected Outputs
- `src/core/constants.ts` — all structural anchor constants, timeframe definitions, system limits
- Downstream modules import these constants for indicator calculations and validation

## Deliverables
- `src/core/constants.ts`

## Constraints
- L0 module: may only import from `core/types.ts` (상수는 정수/문자열 값이므로 Decimal 불필요)
- All constants must use `as const` assertion for deep immutability
- BB20(20,2), BB4(4,4), MA periods (20, 60, 120) are non-negotiable values
- Normalization method (Median/IQR) is structural — not tunable
- Vector dimension (202) is fixed
- No `export let` — only `export const`

## Steps
1. Define Bollinger Band anchor constants:
   - `BB20_CONFIG = { length: 20, stddev: 2, source: 'close' } as const`
   - `BB4_CONFIG = { length: 4, stddev: 4, source: 'close' } as const`
2. Define Moving Average period constants:
   - `MA_PERIODS = [20, 60, 120] as const`
   - `MA20_PERIOD = 20 as const`, `MA60_PERIOD = 60 as const`, `MA120_PERIOD = 120 as const`
3. Define vector dimension constant:
   - `VECTOR_DIM = 202 as const`
4. Define normalization method constant:
   - `NORMALIZATION_METHOD = 'MEDIAN_IQR' as const`
5. Define timeframe constants:
   - `TIMEFRAMES = ['1D', '1H', '5M', '1M'] as const`
   - `ENTRY_TIMEFRAMES = ['5M', '1M'] as const`
6. Define system limit constants:
   - `MAX_LEVERAGE = 38 as const`
   - `MAX_SYMBOLS = 2 as const`
   - `MAX_EXCHANGES = 4 as const`
   - `MAX_PYRAMID_COUNT = 2 as const`
   - `RECONCILIATION_INTERVAL_MS = 60_000 as const`
7. Define supported exchange list:
   - `SUPPORTED_EXCHANGES = ['binance', 'okx', 'bitget', 'mexc'] as const`
8. Define supported symbols:
   - `SUPPORTED_SYMBOLS = ['BTCUSDT', 'XAUTUSDT'] as const`
9. Write tests verifying immutability and correct values
10. Verify `bun run typecheck` passes

## Acceptance Criteria
- BB20 config is `{ length: 20, stddev: 2 }`
- BB4 config is `{ length: 4, stddev: 4 }`
- MA periods are exactly [20, 60, 120]
- Vector dimension is 202
- Max leverage is 38
- All constants are `as const` (TypeScript infers literal types)
- No mutable exports
- `bun run typecheck` passes

## Test Scenarios
- BB20_CONFIG.length equals 20 and BB20_CONFIG.stddev equals 2
- BB4_CONFIG.length equals 4 and BB4_CONFIG.stddev equals 4
- MA_PERIODS contains exactly [20, 60, 120] in order
- VECTOR_DIM equals 202
- MAX_LEVERAGE equals 38
- SUPPORTED_EXCHANGES contains all 4 exchanges
- TypeScript prevents reassignment of any constant (compile-time check)

## Validation
```bash
bun run typecheck
bun test --grep "core/constants"
```

## Out of Scope
- Tunable parameters (those live in CommonCode via config module)
- Indicator calculation logic (indicators module, EP-02+)
- Runtime config validation (config/schema.ts)
