# T-09-012 Position monitoring service

## Goal
Create a `PositionMonitor` class in `packages/core/risk/` that tracks open positions, detects positions not tracked by the system (untracked positions), calculates aggregate exposure, and estimates liquidation prices using a fallback formula.

## Why
Live trading requires continuous awareness of open positions and total exposure. Without position monitoring, the system cannot detect when a position was opened externally (e.g., manual trade on exchange), accurately compute portfolio-level risk, or warn traders approaching liquidation. This is a pure logic layer with no network or DB dependencies.

## Inputs
- `packages/core/src/risk/` — existing risk module location
- `docs/ARCHITECTURE.md` — `packages/core` isolation rules (no Elysia, no CCXT, no Drizzle)
- `docs/RELIABILITY.md` — position sync requirements

## Dependencies
- None (pure logic in `packages/core/risk/`)

## Expected Outputs
- `packages/core/src/risk/position-monitor.ts`
- `packages/core/src/risk/position-monitor.test.ts`
- Updated `packages/core/src/index.ts` — types and class exported

## Deliverables

### 1. Exchange position provider interface
```typescript
// packages/core/src/risk/position-monitor.ts

export interface ExchangePosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;           // Decimal string
  entryPrice: string;     // Decimal string
  markPrice: string;      // Decimal string
  leverage: number;
  marginType: 'isolated' | 'cross';
}

export interface ExchangePositionProvider {
  getOpenPositions(): Promise<ExchangePosition[]>;
}
```

### 2. PositionMonitor class
```typescript
export interface TrackedPosition {
  symbol: string;
  systemOrderId: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
}

export interface PositionSyncResult {
  tracked: ExchangePosition[];
  untracked: ExchangePosition[];   // on exchange but not in system
  missing: TrackedPosition[];      // in system but not on exchange
}

export class PositionMonitor {
  constructor(provider: ExchangePositionProvider) {}

  async sync(systemPositions: TrackedPosition[]): Promise<PositionSyncResult>

  calculateAggregateExposure(positions: ExchangePosition[]): {
    totalLongNotional: string;
    totalShortNotional: string;
    netExposure: string;
  }

  estimateLiquidationPrice(position: ExchangePosition): string | null
}
```

### 3. Liquidation price estimation (fallback formula)
- Isolated margin LONG: `entryPrice * (1 - 1/leverage + maintenanceMarginRate)`
- Isolated margin SHORT: `entryPrice * (1 + 1/leverage - maintenanceMarginRate)`
- `maintenanceMarginRate` default: 0.005 (0.5%)
- Cross margin: return `null` (cannot estimate without full portfolio margin)
- All calculations via Decimal.js

### 4. Tests
- `sync()` with matching positions returns empty untracked and missing arrays
- `sync()` detects exchange position not in system → untracked
- `sync()` detects system position not on exchange → missing
- `calculateAggregateExposure()` sums LONG and SHORT notionals correctly
- `estimateLiquidationPrice()` returns correct value for isolated LONG
- `estimateLiquidationPrice()` returns correct value for isolated SHORT
- `estimateLiquidationPrice()` returns null for cross margin

## Constraints
- All monetary calculations via Decimal.js — no native float arithmetic
- `packages/core` must not import Elysia, CCXT, Drizzle, or any framework
- `ExchangePositionProvider` is an interface — no CCXT import in this file
- `PositionSyncResult` matching is by `symbol + side` pair
- Position size comparison uses string equality after Decimal normalization

## Steps
1. Write failing tests (RED):
   - sync detects untracked positions
   - sync detects missing positions
   - aggregate exposure calculation
   - liquidation price isolated LONG
   - liquidation price isolated SHORT
   - liquidation price cross margin → null
2. Define `ExchangePosition`, `ExchangePositionProvider`, `TrackedPosition` interfaces (GREEN)
3. Implement `PositionMonitor.sync()` (GREEN)
4. Implement `calculateAggregateExposure()` with Decimal.js (GREEN)
5. Implement `estimateLiquidationPrice()` with Decimal.js (GREEN)
6. Export from core index (GREEN)
7. Run validation (REFACTOR)

## Acceptance Criteria
- `sync()` returns `{ tracked, untracked, missing }` with correctly classified positions
- `calculateAggregateExposure()` returns string decimal values for all three fields
- `estimateLiquidationPrice()` returns correct string decimal for isolated margin
- `estimateLiquidationPrice()` returns `null` for cross margin positions
- No native float arithmetic anywhere in implementation
- `bun run typecheck` passes

## Validation
```bash
bun test packages/core
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-23
- Files changed: `packages/core/risk/position-monitor.ts`, `packages/core/risk/__tests__/position-monitor.test.ts`, `packages/core/risk/index.ts`
- Tests: 7 new tests (sync tracking/untracked/missing, aggregate exposure, liquidation price LONG/SHORT/cross)
- Approach: TDD — wrote 7 failing tests first, implemented PositionMonitor with Decimal.js for all monetary math
- Validation: 1353 pass, 0 fail, typecheck clean

## Outputs
- `PositionMonitor` class with `sync()`, `calculateAggregateExposure()`, `estimateLiquidationPrice()`
- `ExchangePosition`, `ExchangePositionProvider`, `TrackedPosition`, `PositionSyncResult` types

## Out of Scope
- Real exchange API calls (provider interface only)
- Margin call alerts (separate concern)
- Funding rate tracking (T-11-007)
- Worker integration
