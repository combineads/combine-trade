# T-02-001 indicators/types.ts — Indicator result type definitions

## Goal
Define all indicator result types in `src/indicators/types.ts` — the shared type contract for BB, MA, RSI, ATR, squeeze, and the unified calcAllIndicators output.

## Why
Every indicator function returns a structured result. Defining types first establishes the contract that all subsequent indicator tasks (T-02-002~007) implement against. Downstream modules (signals, vectors, filters) depend on these types for type-safe indicator consumption.

## Inputs
- `docs/exec-plans/02-indicators.md` — result type requirements
- `src/core/types.ts` — Candle type (Decimal fields)
- `src/core/decimal.ts` — Decimal type

## Dependencies
None within EP-02 — this is the first task. Requires EP-01 complete (done).

## Expected Outputs
- `src/indicators/types.ts` — all indicator result types exported
- Downstream tasks T-02-002~007 import these types

## Deliverables
- `src/indicators/types.ts`

## Constraints
- L2 module: may import from `core/` only (specifically `Decimal` type from `core/decimal`)
- All price-level fields (upper, middle, lower, sma, ema, atr) use `Decimal` type
- RSI is `Decimal` (0-100 range)
- Use `type` not `interface` (consistent with core/types.ts)
- Squeeze state uses string literal union

## Steps
1. Import `Decimal` type from `@/core/decimal`
2. Define `BollingerResult`:
   ```typescript
   type BollingerResult = {
     upper: Decimal;
     middle: Decimal;
     lower: Decimal;
     bandwidth: Decimal;  // (upper - lower) / middle
     percentB: Decimal;   // (close - lower) / (upper - lower)
   }
   ```
3. Define `BollingerSeries` — array of `(BollingerResult | null)` for full-candle-series output
4. Define `MAResult` — `Decimal[]` (simple array of MA values)
5. Define `RSIResult` — `Decimal | null` (single latest value, null if insufficient data)
6. Define `ATRResult` — `Decimal | null` (single latest value, null if insufficient data)
7. Define `SqueezeState` — `"squeeze" | "expansion" | "normal"`
8. Define `AllIndicators`:
   ```typescript
   type AllIndicators = {
     bb20: BollingerResult | null;
     bb4: BollingerResult | null;
     sma20: Decimal | null;
     sma60: Decimal | null;
     sma120: Decimal | null;
     ema20: Decimal | null;
     ema60: Decimal | null;
     ema120: Decimal | null;
     rsi14: Decimal | null;
     atr14: Decimal | null;
     squeeze: SqueezeState;
   }
   ```
9. Export all types
10. Verify `bun run typecheck` passes

## Acceptance Criteria
- All result types exported and use `Decimal` for price/value fields
- `BollingerResult` has upper, middle, lower, bandwidth, percentB
- `AllIndicators` covers all 11 indicator outputs
- `SqueezeState` is a 3-member string union
- No `number` type for any price or indicator value
- `bun run typecheck` passes

## Test Scenarios
- BollingerResult can be constructed with valid Decimal fields → compiles
- Assigning number to BollingerResult.upper → compile error (@ts-expect-error)
- AllIndicators has all 11 required fields → structural check
- SqueezeState accepts only "squeeze", "expansion", "normal" → invalid value rejected (@ts-expect-error)
- RSIResult accepts null → compiles
- BollingerResult | null union works correctly → compiles

## Validation
```bash
bun run typecheck
bun test --grep "indicators/types"
```

## Out of Scope
- Indicator calculation logic (T-02-002~005)
- Candle-to-number conversion helpers (each indicator task handles internally)
