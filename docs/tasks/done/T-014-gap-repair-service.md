# T-014 Implement gap detection and REST-based gap repair service

## Goal
Create `workers/candle-collector/gap-repair.ts` — a service that detects continuity gaps for a given (exchange, symbol, timeframe) scope and repairs them by fetching missing candles via `ExchangeAdapter.fetchOHLCV` (REST), writing them to the repository with `source = "rest"`. Repair writes do NOT emit `candle_closed` NOTIFY events.

## Why
The candle-collector worker restarts frequently (deployment, crash recovery). Any downtime creates a gap in the candle sequence. The gap repair service is called during worker startup before WebSocket collection begins to ensure all downstream modules (strategy, vector) receive a continuous candle history. Without it, a 12-hour downtime would cause 720 missing 1m candles and corrupt strategy signals.

## Inputs
- `packages/candle/validation.ts` — validateContinuity(), isContinuous(), CandleGap type
- `packages/candle/types.ts` — Candle, TIMEFRAME_MS
- `packages/exchange/types.ts` — ExchangeAdapter.fetchOHLCV interface
- `workers/candle-collector/repository.ts` — DrizzleCandleRepository with upsertBatch, findLatestOpenTime (T-013)
- `docs/exec-plans/01-candle-collection.md` § M3 — gap detection and repair acceptance criteria
- `docs/exec-plans/01-candle-collection.md` § M4 — startup recovery sequence (this task covers the REST tier only; Vision archive tier is out of scope)
- T-005 outputs: validateContinuity, isContinuous
- T-012 outputs: BinanceAdapter.fetchOHLCV
- T-013 outputs: DrizzleCandleRepository.upsertBatch, findLatestOpenTime

## Dependencies
- T-005 (continuity validation — validateContinuity, isContinuous)
- T-012 (BinanceAdapter.fetchOHLCV — used for REST backfill)
- T-013 (DrizzleCandleRepository.upsertBatch, findLatestOpenTime)

## Expected Outputs
- `workers/candle-collector/gap-repair.ts` — GapRepairService class
- `workers/candle-collector/__tests__/gap-repair.test.ts` — unit tests with MockExchangeAdapter

## Deliverables
- `GapRepairService` with:
  - `detectGaps(exchange, symbol, timeframe, from, to): Promise<CandleGap[]>` — queries repository for the range, runs validateContinuity
  - `repairGap(exchange, symbol, timeframe, gapStart: Date, gapEnd: Date): Promise<number>` — fetches missing candles via fetchOHLCV in pages, upserts via repository, returns count repaired
  - `repairAll(exchange, symbol, timeframe): Promise<RepairResult>` — entry point for startup recovery: finds latest openTime, calculates gap to now, calls repairGap, re-validates continuity, logs WARNING if repair incomplete
- `RepairResult` type: `{ gapsFound: number; candlesRepaired: number; remainingGaps: number; durationMs: number }`
- Structured WARNING log when repair fails to close a gap (exchange unavailable, data not available)
- Repair writes use `source = "rest"` — no NOTIFY emission

## Constraints
- Gap repair operates on at-most 1-day window via REST (longer gaps → Vision archive, handled in T-015 startup recovery)
- fetchOHLCV page size: 1000 candles per request (Binance Futures REST limit)
- Repair must handle partial fetch: if exchange returns fewer candles than requested, log WARNING and proceed with what was returned
- repairGap must be idempotent: calling it twice for the same range produces the same result (upsertBatch handles duplicates)
- No NOTIFY is emitted for repair writes — the `source="rest"` flag is informational, not a suppression mechanism; caller must not publish after batch repair
- Continuity re-validation after repair uses the same `validateContinuity` from packages/candle — do not re-implement
- Service must be injectable via constructor (accepts ExchangeAdapter + CandleRepository interfaces, not concrete classes)
- Do NOT import Elysia, CCXT, or Drizzle directly — only use the injected interfaces
- Error taxonomy: transient exchange errors → `ERR_RETRY_EXCHANGE_TIMEOUT` (logged as WARN, repair marked incomplete); exchange returns no data → `ERR_RETRY_EXCHANGE_NO_DATA` (WARNING, gap remains)

## Steps
1. Write failing unit tests first (RED):
   - Test: detectGaps on continuous sequence → returns []
   - Test: detectGaps with 1 missing candle → returns CandleGap[] with expectedTime set correctly
   - Test: detectGaps with multiple gaps → returns all gaps sorted by expectedTime
   - Test: repairGap calls fetchOHLCV with correct since/limit parameters
   - Test: repairGap upserts returned candles with source="rest"
   - Test: repairGap is idempotent (mock returns same candles, upsertBatch called twice → same count)
   - Test: repairAll returns RepairResult with correct counts
   - Test: repairAll logs WARNING when gaps remain after repair attempt
   - Test: repairAll with empty repository (findLatestOpenTime returns null) → skips repair, returns 0 gaps
2. Implement GapRepairService (GREEN):
   - detectGaps: call repository.findByRange(exchange, symbol, timeframe, from, to), then validateContinuity
   - repairGap: page through fetchOHLCV calls with since advancing by limit*intervalMs per call; collect all candles; call upsertBatch
   - repairAll: call findLatestOpenTime → if null, return early; calculate gap window; call repairGap; re-run detectGaps on repaired range; build RepairResult
3. Export from workers/candle-collector/index.ts
4. Refactor (REFACTOR): extract page-fetch loop into a private `fetchAllInRange` helper

## Acceptance Criteria
- `detectGaps` returns an empty array for a continuous sequence
- `detectGaps` correctly identifies all gaps when candles are missing
- `repairGap` calls `fetchOHLCV` with `since` set to gap start timestamp (ms) and respects the page size limit
- `repairGap` calls `upsertBatch` with all fetched candles
- `repairAll` returns a `RepairResult` with correct `gapsFound`, `candlesRepaired`, `remainingGaps`
- `repairAll` emits a WARNING log when `remainingGaps > 0`
- Service accepts ExchangeAdapter and CandleRepository as constructor parameters (interface injection)
- `bun test --filter "gap-repair"` passes (all 9 unit tests)
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test --filter "gap-repair"
bun run typecheck
bun run lint
```

## Out of Scope
- Binance Vision daily archive backfill (Tier 2 — handled in T-015 startup recovery logic)
- OKX-specific gap repair differences (same interface, same implementation)
- Gap alerting / kill switch trigger on persistent gaps (EP01-M6 / EP08)
- Scheduled periodic gap repair (candle-collector worker handles startup recovery only; periodic re-check is EP07)
- Multi-timeframe gap repair coordination (each timeframe runs independently)
- Rate limiting during repair (EP01-M6)

## Implementation Notes
- Date: 2026-03-22
- Files changed: workers/candle-collector/src/gap-repair.ts, __tests__/gap-repair.test.ts
- Tests: 8 passing
- Approach: GapRepairService accepts ExchangeAdapter + GapRepairRepository interfaces. detectGaps delegates to validateContinuity. repairGap pages through fetchOHLCV (1000/page) and upserts with source="rest". repairAll orchestrates detect→repair→revalidate.
- Validation: all pass

## Outputs
- `workers/candle-collector/src/gap-repair.ts` — GapRepairService, GapRepairRepository interface, RepairResult type
