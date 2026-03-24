# T-09-022 Liquidation Price Tracker

## Goal
Implement a `LiquidationPriceCalculator` in `packages/core/risk/` that computes liquidation prices using the standard formula, with an injectable provider interface that can fetch the value from an exchange API, falling back to the formula when the exchange returns null/empty/"0".

## Steps
1. Add `LiquidationPriceInput`, `LiquidationPriceProvider`, and `LiquidationPriceResult` types to `types.ts`
2. Create `liquidation-price.ts` with `LiquidationPriceCalculator` class
3. Write tests in `__tests__/liquidation-price.test.ts`
4. Export from `index.ts`

## Formulas
- LONG:  `entryPrice × (1 - 1/leverage + maintenanceMarginRate)`
- SHORT: `entryPrice × (1 + 1/leverage - maintenanceMarginRate)`

## Constraints
- Decimal.js for all calculations (no native float arithmetic)
- `LiquidationPriceProvider` is an interface (injectable, not hardcoded)
- `fromExchangeOrEstimate`: call provider first, fallback to formula on null/empty/"0"
- Throw `LiquidationPriceError` on invalid input (non-positive leverage, negative mmr)
- Must pass `bun test --filter "liquidation-price"` and `bun run typecheck`

## Implementation Notes
- Formula already exists in `position-monitor.ts::estimateLiquidationPrice` — extracted and generalized into a standalone class
- Cross margin returns null from formula (same behavior kept); provider can still return a value for cross positions
- `isAbsent()` helper treats null/undefined/empty-string/"0" uniformly as fallback triggers
- Provider throw is silently caught; the formula fallback runs in both null and error cases
- `validate()` is private and runs before formula (not before provider call, so bad inputs still throw on fallback path)
- All 16 tests pass; full suite 548/548 pass; `bun run typecheck` clean

## Outputs
- `packages/core/risk/liquidation-price.ts` — `LiquidationPriceCalculator` class + `LiquidationPriceError`
- `packages/core/risk/__tests__/liquidation-price.test.ts` — 16 tests covering formula (LONG/SHORT/cross/invalid inputs), provider fallback variants, and Decimal precision
- `packages/core/risk/types.ts` — added `LiquidationPriceInput`, `LiquidationPriceResult`, `LiquidationPriceProvider`
- `packages/core/risk/index.ts` — exports for class, error, and three new types
