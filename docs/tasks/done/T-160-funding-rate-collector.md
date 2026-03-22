# T-160 Funding rate collector service

## Goal
Create a `FundingRateCollector` service in `packages/core/fee/` that fetches 8-hourly funding rates from an exchange adapter interface, calculates cumulative funding costs for open positions, and warns when the funding rate reaches or exceeds 0.1%.

## Why
Perpetual futures positions accumulate funding payments every 8 hours. Ignoring funding rates causes inaccurate PnL reporting and can lead to unexpected costs on high-rate periods. The collector provides the data foundation for accurate net PnL calculation (T-161) and informs traders when holding a position is becoming costly.

## Inputs
- `packages/core/src/fee/` — existing fee module location (or create if absent)
- `docs/ARCHITECTURE.md` — `packages/core` isolation rules
- `docs/RELIABILITY.md` — data collection reliability requirements

## Dependencies
- None (pure logic in `packages/core/fee/`)

## Expected Outputs
- `packages/core/src/fee/funding-rate-collector.ts`
- `packages/core/src/fee/funding-rate-collector.test.ts`
- Updated `packages/core/src/index.ts` — types and class exported

## Deliverables

### 1. Exchange funding rate adapter interface
```typescript
// packages/core/src/fee/funding-rate-collector.ts

export interface FundingRateRecord {
  symbol: string;
  timestamp: number;      // Unix ms
  rate: string;           // Decimal string (e.g. "0.0001" = 0.01%)
  interval: number;       // hours between payments (typically 8)
}

export interface FundingRateAdapter {
  getFundingHistory(symbol: string, since: number, limit: number): Promise<FundingRateRecord[]>;
  getCurrentFundingRate(symbol: string): Promise<FundingRateRecord>;
}
```

### 2. FundingRateCollector class
```typescript
export interface AccumulatedFunding {
  symbol: string;
  positionSize: string;     // Decimal string (notional value)
  totalFundingPaid: string; // Decimal string (negative = paid, positive = received)
  fundingRecords: FundingRateRecord[];
}

export interface FundingWarning {
  symbol: string;
  currentRate: string;
  threshold: string;        // "0.001" (0.1%)
  isHigh: boolean;
}

export class FundingRateCollector {
  constructor(adapter: FundingRateAdapter) {}

  async collectRecent(symbol: string, since: number): Promise<FundingRateRecord[]>

  calculateAccumulatedFunding(
    symbol: string,
    positionSize: string,
    openTimestamp: number,
    records: FundingRateRecord[],
  ): AccumulatedFunding

  async checkFundingWarning(symbol: string): Promise<FundingWarning>
}
```

### 3. Accumulation calculation
- Filter records: timestamp >= openTimestamp
- For each record: `payment = positionSize * rate`
- Sum all payments: positive rate = trader pays (subtract from PnL), negative = trader receives
- Use Decimal.js for all arithmetic
- `totalFundingPaid`: negative means cost (paid out), positive means received

### 4. Warning threshold
- `checkFundingWarning()` calls `getCurrentFundingRate()` on adapter
- `isHigh: true` when `abs(rate) >= 0.001` (0.1%)
- Threshold constant: `FUNDING_WARNING_THRESHOLD = '0.001'`

### 5. Tests
- `collectRecent()` returns records filtered by adapter
- `calculateAccumulatedFunding()` sums payments correctly for multiple records
- `calculateAccumulatedFunding()` with no records returns `totalFundingPaid: "0"`
- `checkFundingWarning()` returns `isHigh: true` when rate >= 0.001
- `checkFundingWarning()` returns `isHigh: false` when rate < 0.001
- All calculations use Decimal.js (verify no floating point error on 0.0001 * 1000)

## Constraints
- All monetary calculations via Decimal.js — no native float arithmetic
- `packages/core` must not import Elysia, CCXT, Drizzle
- `FundingRateAdapter` is an interface — no exchange SDK imports
- `FUNDING_WARNING_THRESHOLD` is a named constant, not a magic number
- Funding records outside position open time are excluded from accumulation

## Steps
1. Write failing tests (RED):
   - `calculateAccumulatedFunding` sums correctly
   - Empty records → totalFundingPaid = "0"
   - `checkFundingWarning` high rate → isHigh true
   - `checkFundingWarning` low rate → isHigh false
2. Define interfaces and constants (GREEN)
3. Implement `FundingRateCollector.collectRecent()` (GREEN)
4. Implement `calculateAccumulatedFunding()` with Decimal.js (GREEN)
5. Implement `checkFundingWarning()` (GREEN)
6. Export from core index (GREEN)
7. Run validation (REFACTOR)

## Acceptance Criteria
- `calculateAccumulatedFunding()` sums all rate * size payments for records after openTimestamp
- Empty record list returns `totalFundingPaid: "0"`
- Rate of "0.001" triggers `isHigh: true`, rate of "0.0009" does not
- No native float arithmetic (Decimal.js used throughout)
- `bun run typecheck` passes

## Validation
```bash
bun test packages/core
bun run typecheck
```

## Out of Scope
- Historical funding rate storage in DB
- Funding rate prediction
- PnL integration (T-161)
- Exchange adapter CCXT implementation
