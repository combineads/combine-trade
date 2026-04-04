# Pattern: Constructor Injection for Testability

**Discovered**: 2026-04-04, EP-04 (T-04-004, T-04-009, T-04-010)
**Category**: architecture
**Status**: active

## Problem

Modules that import their dependencies directly (e.g., `import { bulkUpsertCandles } from './repository'`) create hard coupling that makes testing difficult:

- Unit tests cannot substitute mock implementations
- Integration tests cannot inject a test-specific DB connection
- The module cannot be reused with different dependency implementations

## Context

EP-04 modules need two testing modes:

1. **Unit tests**: Mock the DB and network dependencies, test only the orchestration logic
2. **Integration tests**: Use real PostgreSQL via test-db helper, verify actual DB behavior

Direct imports force a single mode. Constructor injection enables both.

## Solution

Accept dependencies via an options/config object in the constructor or main function.

### Example 1: Function-level injection (syncCandles)

```typescript
// src/candles/sync.ts
export interface SyncOptions {
  symbols: string[];
  timeframes: Timeframe[];
  exchangeName: Exchange;
  downloadFn: typeof downloadCandles;     // injected
  fetchRestFn: typeof fetchCandlesViaREST; // injected
  upsertFn: typeof bulkUpsertCandles;      // injected
  getLatestFn: typeof getLatestCandleTime; // injected
}

export async function syncCandles(options: SyncOptions): Promise<SyncResult> {
  // Uses options.downloadFn instead of direct import
  const candles = await options.downloadFn(symbol, exchange, tf, from, to);
  await options.upsertFn(candles);
}
```

Unit test injects mocks:
```typescript
const result = await syncCandles({
  symbols: ["BTCUSDT"],
  timeframes: ["5M"],
  exchangeName: "binance",
  downloadFn: mockDownload,
  fetchRestFn: mockFetchRest,
  upsertFn: mockUpsert,
  getLatestFn: mockGetLatest,
});
```

Integration test injects real functions:
```typescript
const result = await syncCandles({
  symbols: ["BTCUSDT"],
  timeframes: ["5M"],
  exchangeName: "binance",
  downloadFn: downloadCandles,        // real
  fetchRestFn: fetchCandlesViaREST,   // real
  upsertFn: bulkUpsertCandles,        // real, uses test DB
  getLatestFn: getLatestCandleTime,   // real, uses test DB
});
```

### Example 2: Class-level injection (GapRecovery)

```typescript
// src/candles/gap-recovery.ts
export class GapRecovery {
  constructor(
    private detectGapsFn: typeof detectGaps,
    private fetchCandlesFn: typeof fetchCandlesViaREST,
    private upsertFn: typeof bulkUpsertCandles,
  ) {}

  async recover(symbol: string, exchange: Exchange, timeframe: Timeframe, adapter: ExchangeAdapter): Promise<RecoveryResult> {
    const gaps = await this.detectGapsFn(symbol, exchange, timeframe, from, to);
    // ...
  }
}
```

### Example 3: Config object injection (CandleManager)

```typescript
// src/candles/index.ts
export interface CandleManagerConfig {
  symbols: string[];
  timeframes: Timeframe[];
  adapter: ExchangeAdapter;  // injected, not imported
  exchangeName: Exchange;
}

export class CandleManager {
  constructor(private config: CandleManagerConfig) {}
}
```

## Guidelines

1. **L3+ modules** (candles, signals, pipeline) should accept L1/L2 dependencies via injection
2. **L0 modules** (core types, constants) can be imported directly — they have no side effects
3. **L1 modules** (db pool, schema) are singletons by nature but should be injectable for test isolation
4. **Default values**: Production code can provide defaults for convenience:

```typescript
export async function syncCandles(options: SyncOptions): Promise<SyncResult>;
export async function syncCandles(options: Partial<SyncOptions> & Required<Pick<SyncOptions, 'symbols' | 'timeframes' | 'exchangeName'>>): Promise<SyncResult> {
  const opts = {
    downloadFn: downloadCandles,
    fetchRestFn: fetchCandlesViaREST,
    upsertFn: bulkUpsertCandles,
    getLatestFn: getLatestCandleTime,
    ...options,
  };
}
```

## Anti-pattern

```typescript
// DO NOT import dependencies directly in L3+ modules
import { bulkUpsertCandles } from './repository';
import { detectGaps } from './gap-detection';

export class GapRecovery {
  async recover() {
    // Hard-coupled, untestable without module mocking hacks
    const gaps = await detectGaps(...);
    await bulkUpsertCandles(...);
  }
}
```

## Related

- `src/candles/sync.ts` — SyncOptions pattern
- `src/candles/gap-recovery.ts` — GapRecovery class injection
- `src/candles/index.ts` — CandleManagerConfig pattern
- `docs/ARCHITECTURE.md` — Layer definitions (L0-L5)
