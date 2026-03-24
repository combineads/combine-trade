# T-13-002 Market context calculator

## Goal
Implement pure market context calculation functions in `packages/core/journal/market-context.ts`: `classifyTrend(sma, price)`, `calculateVolatilityRatio(currentAtr, avgAtr)`, `calculateVolumeRatio(currentVol, avgVol)`, and `buildMarketContext(inputs)`. All arithmetic uses Decimal.js via the T-11-001 wrapper. These functions classify the market state at a point in time for journal enrichment.

## Why
EP13 M2 requires capturing the market context at entry and exit time — trend direction, volatility level, and volume level. Without market context, the auto-tagger (T-13-004) cannot classify trades by market regime, and traders cannot filter journals by market conditions. By implementing these as pure Decimal.js functions, the calculations are deterministic, testable, and reusable by both the live pipeline and backtest replay. The functions accept pre-fetched numeric inputs (not raw candles), keeping the journal core module free of data-fetching concerns.

## Inputs
- EP13 M2 spec — market context enrichment (multi-TF trend, volatility ratio, volume ratio)
- T-11-001 `packages/shared/decimal/arithmetic.ts` — `sub`, `div`, `mul` for ratio calculations
- Architecture guardrail: `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack

## Dependencies
None.

## Expected Outputs
- `packages/core/journal/market-context.ts`
  - `TrendDirection` type: `"up" | "down" | "neutral"`
  - `classifyTrend(sma: string, price: string): TrendDirection`
    - price > sma → `"up"`
    - price < sma → `"down"`
    - price === sma → `"neutral"`
  - `calculateVolatilityRatio(currentAtr: string, avgAtr: string): string`
    - Returns `currentAtr / avgAtr` as Decimal string
    - If `avgAtr` is `"0"`, returns `"0"` (avoid division by zero)
  - `calculateVolumeRatio(currentVol: string, avgVol: string): string`
    - Returns `currentVol / avgVol` as Decimal string
    - If `avgVol` is `"0"`, returns `"0"` (avoid division by zero)
  - `TrendContext` interface:
    ```ts
    interface TrendContext {
      timeframe: string;        // e.g., "1h", "4h", "1d"
      direction: TrendDirection;
    }
    ```
  - `MarketContext` interface:
    ```ts
    interface MarketContext {
      trends: TrendContext[];          // one per higher timeframe
      volatilityRatio: string;         // currentAtr / avgAtr
      volumeRatio: string;             // currentVol / avgVol
      fundingRate: string | null;      // null if unavailable
      capturedAt: Date;
    }
    ```
  - `BuildMarketContextInput` interface:
    ```ts
    interface BuildMarketContextInput {
      trends: TrendContext[];
      volatilityRatio: string;
      volumeRatio: string;
      fundingRate: string | null;
      capturedAt: Date;
    }
    ```
  - `buildMarketContext(input: BuildMarketContextInput): MarketContext` — assembles the context object
- `packages/core/journal/__tests__/market-context.test.ts`

## Deliverables
- `packages/core/journal/market-context.ts`
- `packages/core/journal/__tests__/market-context.test.ts`

## Constraints
- All arithmetic must use the T-11-001 Decimal.js wrapper — no `new Decimal()` or native float
- `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack
- All numeric inputs and outputs are `string` (Decimal.js compatible)
- Division by zero in ratio calculations returns `"0"`, not an error (graceful degradation per EP13 risk mitigation)
- `fundingRate` is nullable — EP11 M3 dependency may not be available
- `trends` array may be empty (no higher TF data available) — valid context
- All functions are synchronous and pure — no IO, no side effects
- All tests use `bun:test`

## Steps
1. Create type definitions in `packages/core/journal/market-context.ts`: `TrendDirection`, `TrendContext`, `MarketContext`, `BuildMarketContextInput`
2. Write failing tests in `packages/core/journal/__tests__/market-context.test.ts` (RED):

   **classifyTrend tests:**
   - `classifyTrend("50000", "51000")` → `"up"` (price above SMA)
   - `classifyTrend("50000", "49000")` → `"down"` (price below SMA)
   - `classifyTrend("50000", "50000")` → `"neutral"` (price equals SMA)
   - `classifyTrend("50000.50", "50000.51")` → `"up"` (precision matters)

   **calculateVolatilityRatio tests:**
   - `calculateVolatilityRatio("150", "100")` → `"1.5"` (above-average volatility)
   - `calculateVolatilityRatio("80", "100")` → `"0.8"` (below-average volatility)
   - `calculateVolatilityRatio("100", "100")` → `"1"` (average volatility)
   - `calculateVolatilityRatio("50", "0")` → `"0"` (zero avgAtr → graceful degradation)

   **calculateVolumeRatio tests:**
   - `calculateVolumeRatio("2000000", "1000000")` → `"2"` (double average volume)
   - `calculateVolumeRatio("500000", "1000000")` → `"0.5"` (half average volume)
   - `calculateVolumeRatio("1000", "0")` → `"0"` (zero avgVol → graceful degradation)

   **buildMarketContext tests:**
   - **Test A — Full context**: provide 3 trends + volatility + volume + funding → all fields present
   - **Test B — No funding rate**: provide `fundingRate: null` → `MarketContext.fundingRate` is null
   - **Test C — Empty trends**: provide empty trends array → `MarketContext.trends` is empty array
   - **Test D — capturedAt preserved**: verify Date is exactly the one passed in

3. Implement all functions (GREEN):
   - `classifyTrend`: compare using Decimal.js `sub` — if `sub(price, sma)` starts with `-` → down, `"0"` → neutral, else → up
   - `calculateVolatilityRatio`: guard zero divisor, then `div(currentAtr, avgAtr)`
   - `calculateVolumeRatio`: guard zero divisor, then `div(currentVol, avgVol)`
   - `buildMarketContext`: pass through all fields from input
4. Refactor: add JSDoc to all exported types and functions

## Acceptance Criteria
- `classifyTrend` correctly classifies price vs SMA relationship using Decimal.js comparison
- `calculateVolatilityRatio` returns exact Decimal.js ratio; handles zero divisor gracefully
- `calculateVolumeRatio` returns exact Decimal.js ratio; handles zero divisor gracefully
- `buildMarketContext` assembles a valid `MarketContext` from inputs
- Null funding rate and empty trends are handled without errors
- All 14 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/journal/__tests__/market-context.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Fetching candle data for SMA calculation (caller responsibility)
- Computing ATR from candles (indicator library concern)
- Fetching funding rates from exchange API
- Higher timeframe candle aggregation
- Database persistence of market context
- Historical market context replay
