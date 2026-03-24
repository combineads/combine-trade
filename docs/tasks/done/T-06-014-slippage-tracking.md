# T-06-014 Slippage tracking

## Goal
Implement a `SlippageTracker` that compares the expected decision price with the actual exchange fill price for each order, records the slippage percentage, and emits a WARNING log plus Slack notification when slippage exceeds a configurable threshold.

## Why
EP06 M3 — slippage monitoring is essential for execution quality assessment and strategy calibration. Without tracking the gap between `decision_price` and actual `fill_price`, degraded execution quality goes undetected and PnL attribution becomes unreliable.

## Inputs
- `workers/execution-worker/src/handler.ts` — `ExecutionWorkerDeps`, order submission flow; `decision_price` available on `DecisionResult`
- `packages/execution/order-tracker.ts` — `TrackedOrder`, fill status with `filled_price` / `filled_quantity`
- `db/schema/orders.ts` — `orders` table (add `slippage_pct` column)
- EP06 M3 spec: "slippage monitoring", "Partial fill SL/TP mismatch" risks

## Dependencies
- T-06-008 (execution worker handler — defines order submission and DecisionResult shape)
- T-06-009 (order status tracker — provides actual fill_price once order is filled)

## Expected Outputs
- `SlippageTracker` class with `record(orderId, decisionPrice, fillPrice, direction): SlippageRecord` method
- `SlippageRecord` type: `{ orderId: string; decisionPrice: Decimal; fillPrice: Decimal; slippagePct: Decimal; direction: "LONG" | "SHORT"; timestamp: Date }`
- Abnormal slippage check: `slippagePct > threshold` → emit WARNING log + call injected `notifySlippage` callback
- Aggregated stats method: `getStats(): { count: number; avgSlippagePct: Decimal; maxSlippagePct: Decimal; abnormalCount: number }`
- Stats available per strategy via `getStatsByStrategy(strategyId: string)`

## Deliverables
- `packages/execution/slippage-tracker.ts`
- `packages/execution/__tests__/slippage-tracker.test.ts`

## Constraints
- All monetary calculations must use `Decimal.js` — never native float arithmetic
- Slippage formula: `slippagePct = abs(fillPrice - decisionPrice) / decisionPrice * 100`
- Direction-aware: for LONG, positive slippage means fill was above decision price (paid more); for SHORT, positive slippage means fill was below decision price (received less)
- Default abnormal threshold: 0.5% (configurable via constructor option)
- Abnormal slippage notification: injected `notifySlippage(record: SlippageRecord): Promise<void>` callback — no direct Slack import
- Records stored in-memory `Map<orderId, SlippageRecord>` within the instance; DB persistence is out of scope for this task
- Must not import Elysia, Drizzle, or CCXT directly
- `packages/core` must not be imported from within this class (execution package boundary)

## Steps
1. Write failing tests in `packages/execution/__tests__/slippage-tracker.test.ts` (RED):

   **Test A — Zero slippage**
   - `decisionPrice === fillPrice` → `slippagePct === 0`

   **Test B — LONG slippage above threshold**
   - `decisionPrice = 100`, `fillPrice = 100.6`, direction LONG → `slippagePct ≈ 0.6` → `notifySlippage` called once

   **Test C — LONG slippage below threshold**
   - `decisionPrice = 100`, `fillPrice = 100.4`, direction LONG → `slippagePct ≈ 0.4` → `notifySlippage` NOT called

   **Test D — SHORT slippage above threshold**
   - `decisionPrice = 100`, `fillPrice = 99.4`, direction SHORT → `slippagePct ≈ 0.6` → `notifySlippage` called

   **Test E — getStats aggregation**
   - Record three orders with slippages 0.3%, 0.6%, 0.9% → `avgSlippagePct ≈ 0.6`, `maxSlippagePct ≈ 0.9`, `abnormalCount === 2` (threshold 0.5%)

   **Test F — getStatsByStrategy returns only matching records**
   - Record two orders for strategyA and one for strategyB → `getStatsByStrategy("strategyA").count === 2`

   **Test G — Decimal precision (no float drift)**
   - Use known decimal-unsafe values (e.g. 0.1 + 0.2); verify result equals Decimal("0.3") exactly

2. Implement `packages/execution/slippage-tracker.ts` (GREEN)
3. Refactor: export `SlippageTrackerOptions`, `SlippageRecord`, `SlippageStats` types; add JSDoc

## Acceptance Criteria
- All 7 tests pass
- `slippagePct` computed correctly for LONG and SHORT directions using Decimal.js
- `notifySlippage` called if and only if `slippagePct > threshold`
- `getStats()` returns correct aggregates across all recorded orders
- `getStatsByStrategy()` filters correctly by strategyId
- No native float arithmetic used in slippage calculation
- Zero TypeScript errors, zero lint warnings
- Exported from `packages/execution/index.ts`

## Validation
```bash
bun test --filter "slippage" && bun run typecheck
```

## Out of Scope
- Persisting slippage records to the database (DB schema column addition deferred)
- Exposing slippage stats via API endpoint (separate task)
- Slippage-based strategy auto-disable logic
- Historical slippage analysis or reporting UI
