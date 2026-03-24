# T-09-022 Liquidation price tracker

## Goal
Implement a `LiquidationPriceCalculator` that computes the liquidation price for a given open position from entry price, leverage, and maintenance margin rate. Supports both LONG and SHORT positions. When the exchange API provides a liquidation price directly, it is used; otherwise the formula-based estimation is the fallback.

## Why
EP09 M4 — traders need to know how close their open positions are to liquidation. Without this, a leveraged position can approach the liquidation threshold unnoticed, resulting in total loss of margin. Surfacing liquidation prices in the dashboard and feeding them to the proximity warning (T-09-023) enables proactive risk management.

## Inputs
- EP09 M4 spec — liquidation price per position, exchange API fetch with fallback formula
- T-09-010 (position sync service) — provides `OpenPosition` shape with entry price and leverage
- T-11-001 (decimal wrapper) — Decimal.js utility patterns
- Architecture guardrail: `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack

## Dependencies
- T-09-010 (position sync service — defines `OpenPosition` interface with entry price, leverage, side)
- T-11-001 (decimal wrapper — Decimal.js patterns)

## Expected Outputs
- `packages/core/risk/liquidation-price-calculator.ts`
  - `PositionSide` type: `'LONG' | 'SHORT'`
  - `LiquidationInput` interface: `{ entryPrice: string; leverage: number; maintenanceMarginRate: string; side: PositionSide; }`
  - `LiquidationPriceCalculator` class with:
    - `calculate(input: LiquidationInput): string` — formula-based estimation:
      - LONG: `liquidationPrice = entryPrice × (1 - 1/leverage + maintenanceMarginRate)`
      - SHORT: `liquidationPrice = entryPrice × (1 + 1/leverage - maintenanceMarginRate)`
    - `fromExchangeOrEstimate(exchangePrice: string | null, input: LiquidationInput): string` — returns `exchangePrice` if non-null and positive, otherwise falls back to `calculate(input)`
  - `LiquidationPriceProvider` interface: `{ getLiquidationPrice(symbol: string, positionId: string): Promise<string | null>; }` — to be implemented in `packages/exchange/`
- `packages/core/risk/__tests__/liquidation-price-calculator.test.ts`

## Deliverables
- `packages/core/risk/liquidation-price-calculator.ts`
- `packages/core/risk/__tests__/liquidation-price-calculator.test.ts`

## Constraints
- All arithmetic must use Decimal.js — no native float on monetary values
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- LONG formula: `entryPrice × (1 - 1/leverage + maintenanceMarginRate)`
- SHORT formula: `entryPrice × (1 + 1/leverage - maintenanceMarginRate)`
- `fromExchangeOrEstimate` must treat `null`, empty string, and `"0"` as "no exchange price" and fall back to `calculate`
- All tests use `bun:test`

## Steps
1. Write failing tests in `packages/core/risk/__tests__/liquidation-price-calculator.test.ts` (RED):
   - LONG: `entryPrice="50000"`, `leverage=10`, `maintenanceMarginRate="0.005"` → `50000 × (1 - 0.1 + 0.005) = 50000 × 0.905 = "45250"`
   - SHORT: `entryPrice="50000"`, `leverage=10`, `maintenanceMarginRate="0.005"` → `50000 × (1 + 0.1 - 0.005) = 50000 × 1.095 = "54750"`
   - Higher leverage → liquidation price closer to entry price (LONG)
   - Higher leverage → liquidation price closer to entry price (SHORT)
   - `fromExchangeOrEstimate(null, input)` → falls back to `calculate(input)`
   - `fromExchangeOrEstimate("0", input)` → falls back to `calculate(input)`
   - `fromExchangeOrEstimate("45100", input)` → returns `"45100"` (exchange value used)
   - Liquidation price for LONG is always less than entry price
   - Liquidation price for SHORT is always greater than entry price
2. Implement `packages/core/risk/liquidation-price-calculator.ts` (GREEN)
3. Refactor: add JSDoc to `calculate`, `fromExchangeOrEstimate`, and the two formulas

## Acceptance Criteria
- LONG formula produces value strictly less than `entryPrice`
- SHORT formula produces value strictly greater than `entryPrice`
- Higher leverage produces liquidation price closer to entry (both sides)
- `fromExchangeOrEstimate` uses exchange value when valid, falls back otherwise
- All arithmetic uses Decimal.js
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "liquidation-price" && bun run typecheck
```

## Out of Scope
- Cross-margin vs isolated-margin mode differences (caller provides the effective leverage)
- Funding rate impact on liquidation (not modeled in this approximation)
- Persistence of computed liquidation prices to DB (position sync service concern)
- Fetching liquidation price from exchange (interface defined here, implemented in packages/exchange/)
