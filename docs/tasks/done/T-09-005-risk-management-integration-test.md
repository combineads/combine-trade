# T-09-005 Risk management integration test

## Goal
Write integration tests that simulate the full risk flow for an incoming order: the order passes through the risk gate, which internally invokes the kill switch check, loss limit check, and position sizer. Covers the four core scenarios — normal order passes, kill switch blocks, loss limit blocks, overleveraged order blocks — and verifies that each module composes correctly end-to-end.

## Why
Unit tests for T-09-001 through T-09-004 verify each module in isolation. This integration test catches wiring bugs and interface mismatches that only surface when all four risk modules are composed through the gate. It also serves as a living specification for how the risk gate is expected to be wired up in the order executor, making the dependency flow explicit and machine-verifiable before the executor integration is built.

## Inputs
- T-09-001 `activate`, `isBlocked`, `KillSwitchState`, `KillSwitchDeps` from `packages/core/risk`
- T-09-002 `checkLimits`, `LossTrackerDeps`, `DailyLossConfig` from `packages/core/risk`
- T-09-003 `sizePosition`, `PositionSizeConfig` from `packages/core/risk`
- T-09-004 `validateOrder`, `RiskGateDeps`, `OrderValidationInput`, `GateResult` from `packages/core/risk`
- T-06-005 `tests/integration/alert-execution.test.ts` as structural reference for integration test layout

## Dependencies
- T-09-001 (kill switch state machine)
- T-09-002 (loss limit tracker)
- T-09-003 (position sizer)
- T-09-004 (risk gate)

## Expected Outputs
- `tests/integration/risk-management.test.ts`

## Deliverables
- `tests/integration/risk-management.test.ts`

## Constraints
- No real DB, no real exchange, no real network — all external deps mocked via inline `RiskGateDeps` factories in the test file
- All mock state (kill switch states, PnL records, balance, open exposure) held in plain in-memory variables scoped to each test
- Fixtures (balance, entry price, slPct, configs) defined as top-level constants in the test file
- Each test uses a fresh `makeGateDeps()` factory call — no shared mutable state between tests
- The test file must import from the package path `packages/core/risk` — not relative `../../` chains
- All monetary fixture values are Decimal.js-compatible strings (e.g. `"10000"`, `"50000"`, `"0.01"`)
- All tests use `bun:test`

## Steps
1. Define top-level fixtures and constants:
   - `FIXTURE_BALANCE = "10000"` — account balance in USD
   - `FIXTURE_ENTRY_PRICE = "50000"` — BTC/USDT entry price
   - `FIXTURE_SL_PCT = 0.01` — 1% stop-loss
   - `FIXTURE_LOSS_CONFIG: DailyLossConfig` — `{ dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 }`
   - `FIXTURE_SIZE_CONFIG: PositionSizeConfig` — `{ riskPct: 0.01, stepSize: "0.001", minQty: "0.001", maxQty: "10", maxExposureUsd: "100000", maxLeverage: 20 }`
   - `FIXTURE_INPUT: OrderValidationInput` — `{ strategyId: "strat-1", exchangeId: "binance", entryPrice: FIXTURE_ENTRY_PRICE, slPct: FIXTURE_SL_PCT, lossConfig: FIXTURE_LOSS_CONFIG, sizeConfig: FIXTURE_SIZE_CONFIG }`

2. Write tests (RED):

   **Test A — Normal order passes all checks**
   - Build `RiskGateDeps` with: no active kill switches, zero today/week losses, zero open exposure, balance `FIXTURE_BALANCE`
   - Call `validateOrder(FIXTURE_INPUT, deps)`
   - Assert: `result.allowed === true`
   - Assert: `result.rejections` is an empty array

   **Test B — Global kill switch blocks the order**
   - Build deps with one active global `KillSwitchState` (active: true, scope: "global"), zero losses, zero exposure
   - Call `validateOrder(FIXTURE_INPUT, deps)`
   - Assert: `result.allowed === false`
   - Assert: `result.rejections` has length >= 1
   - Assert: at least one rejection string contains `"kill switch"` (case-insensitive)

   **Test C — Daily loss limit blocks the order**
   - Build deps with no active kill switches; `loadTodayRecords` returns records totalling a 4% loss on balance `"10000"` (e.g. `[{ pnl: "-400", ... }]`); daily limit is 3%
   - Call `validateOrder(FIXTURE_INPUT, deps)`
   - Assert: `result.allowed === false`
   - Assert: at least one rejection string contains `"daily"` (case-insensitive)

   **Test D — Overleveraged position blocks the order**
   - Build deps with no kill switch, no loss breach; but `sizeConfig.maxLeverage = 2` and `maxExposureUsd = "100000"` — the computed notional at FIXTURE_ENTRY_PRICE will exceed 2x of FIXTURE_BALANCE
   - Call `validateOrder(FIXTURE_INPUT, deps)`
   - Assert: `result.allowed === false`
   - Assert: at least one rejection string contains `"leverage"` (case-insensitive)

   **Test E — Kill switch + loss limit both active**
   - Build deps with an active global kill switch AND a breached daily loss limit
   - Call `validateOrder(FIXTURE_INPUT, deps)`
   - Assert: `result.allowed === false`
   - Assert: `result.rejections.length >= 2`
   - Assert: rejections contain both a kill switch message and a daily loss message

   **Test F — Per-exchange kill switch blocks matching exchange, not others**
   - Build deps with one active kill switch: scope `"exchange"`, scopeTarget `"binance"`
   - Call `validateOrder` with `exchangeId: "binance"` → assert blocked
   - Build fresh deps with same kill switch state
   - Call `validateOrder` with `exchangeId: "okx"` → assert `allowed === true`

   **Test G — Consecutive SL limit blocks the order**
   - Build deps with no kill switch, no daily/weekly breach; `loadTodayRecords` returns 3 consecutive loss records (all pnl < 0); `maxConsecutiveSl = 3`
   - Call `validateOrder(FIXTURE_INPUT, deps)`
   - Assert: `result.allowed === false`
   - Assert: at least one rejection string contains `"consecutive"` (case-insensitive)

3. Implement `makeGateDeps` helper (private function at the top of the test file):
   - Parameters: `{ killSwitchStates?, todayRecords?, weekRecords?, balance?, openExposure? }`
   - Returns a `RiskGateDeps` object with in-memory closures for each dep

4. Run full project validation

## Acceptance Criteria
- All 7 tests pass
- Test A confirms the happy path: `allowed === true`, empty rejections
- Test B confirms global kill switch produces at least one rejection containing `"kill switch"`
- Test C confirms daily loss limit produces at least one rejection containing `"daily"`
- Test D confirms leverage cap produces at least one rejection containing `"leverage"`
- Test E confirms both kill switch and loss limit rejections appear together (length >= 2)
- Test F confirms per-exchange kill switch scoping: blocks `"binance"`, allows `"okx"`
- Test G confirms consecutive SL limit produces at least one rejection containing `"consecutive"`
- `bun test && bun run typecheck` both pass project-wide

## Validation
```bash
bun test tests/integration/risk-management.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Real exchange connectivity (CCXT adapter)
- Drizzle persistence adapters for kill switch or loss tracker
- Order execution after gate approval (executor concern)
- Operator acknowledgment workflow for kill switch
- Latency benchmark of the risk gate (< 1 second budget verified by the pipeline integration test, not here)
