# T-13-005 Trade journal integration test

## Goal
Write an integration test in `tests/integration/trade-journal.test.ts` that composes the full trade journal pipeline — entry snapshot builder, market context calculator, journal assembler, and auto-tagger — in a realistic trade lifecycle. The test proves that all four modules (T-13-001 through T-13-004) integrate correctly when chained together in the canonical flow: snapshot → context → assembler → tagger.

## Why
Unit tests for T-13-001 through T-13-004 verify each module in isolation. This integration test catches interface mismatches, type incompatibilities, and composition bugs that only surface when all four modules work together in a realistic trade flow. It serves as the canonical end-to-end specification for EP13's pure computation layer and provides a regression safety net before these modules are wired into the journal-worker and database persistence layers.

## Inputs
- T-13-001 `packages/core/journal/entry-snapshot.ts` — `buildEntrySnapshot`, `EntrySnapshot`, `SnapshotPattern`, `SnapshotFeature`, `BuildSnapshotInput`
- T-13-002 `packages/core/journal/market-context.ts` — `classifyTrend`, `calculateVolatilityRatio`, `calculateVolumeRatio`, `buildMarketContext`, `MarketContext`
- T-13-003 `packages/core/journal/assembler.ts` — `assembleJournal`, `TradeJournal`, `AssembleJournalInput`
- T-13-004 `packages/core/journal/tagger.ts` — `generateTags`
- `packages/core/decision/types.ts` — `DecisionResult`
- `packages/core/label/types.ts` — `LabelResult`
- T-06-005 `tests/integration/alert-execution.test.ts`, T-09-005 `tests/integration/risk-management.test.ts`, T-11-005 `tests/integration/financial-arithmetic.test.ts` as structural references for integration test layout

## Dependencies
- T-13-001 (entry snapshot builder)
- T-13-002 (market context calculator)
- T-13-003 (journal assembler)
- T-13-004 (auto-tagger)

## Expected Outputs
- `tests/integration/trade-journal.test.ts`

## Deliverables
- `tests/integration/trade-journal.test.ts`

## Constraints
- No real DB, no real exchange, no real network — all values are hardcoded fixtures
- All monetary fixture values are Decimal.js-compatible strings (e.g., `"65000"`, `"0.001"`)
- The test file must import from package paths (`packages/core/journal`, `packages/core/decision`, `packages/core/label`) — not relative `../../` chains
- Each test uses self-contained fixtures — no shared mutable state between tests
- All tests use `bun:test`
- The test must exercise the full pipeline end-to-end, not just individual function calls

## Steps
1. Define top-level fixtures and constants:
   - `DECISION_RESULT: DecisionResult` — LONG decision with criteria_met, winrate=0.65, expectancy=1.2, sampleCount=50, high confidence
   - `MATCHED_PATTERNS: SnapshotPattern[]` — 5 patterns: 3 WIN, 1 LOSS, 1 with null labels (unlabeled)
   - `FEATURES: SnapshotFeature[]` — 4 features: rsi (rawValue=35, normalized=0.35), macd_histogram (rawValue=-0.5, normalized=0.2), atr (rawValue=150, normalized=0.6), volume (rawValue=1500000, normalized=0.7)
   - `LABEL_RESULT_WIN: LabelResult` — WIN, pnlPct=1.8, mfePct=2.1, maePct=0.4, holdBars=12, exitPrice="66170"
   - `LABEL_RESULT_LOSS: LabelResult` — LOSS, pnlPct=-0.9, mfePct=0.3, maePct=1.0, holdBars=45, exitPrice="64415"
   - Entry/TP/SL prices: `"65000"`, `"66300"`, `"64350"`
   - Market data: SMA values for 1h/4h/1d, ATR current="150" avg="100", volume current="2000000" avg="1000000"
   - Backtest stats: winrate=0.60, expectancy=1.0, sampleCount=200
   - Live stats: winrate=0.55, expectancy=0.8, sampleCount=35

2. Write tests (RED):

   **Test A — Full winning trade lifecycle**
   - Step 1: Build entry snapshot from decision, patterns, features, prices
   - Step 2: Build entry market context (classify trends, calculate ratios)
   - Step 3: Build exit market context (slightly different values)
   - Step 4: Assemble journal from snapshot + WIN label + exit context + backtest/live stats
   - Step 5: Generate tags from journal
   - Assert: journal.direction is "LONG"
   - Assert: journal.resultType is "WIN"
   - Assert: journal.entryPrice is "65000" (exact string)
   - Assert: journal.exitPrice is "66170" (exact string)
   - Assert: journal.matchedPatterns has 5 elements
   - Assert: journal.backtestComparison is not null, has correct values
   - Assert: tags include "trending_up", "with_trend", "high_volatility", "high_volume"
   - Assert: tags include "quick_win" (holdBars=12 < 100*0.25=25)
   - Assert: tags are sorted alphabetically

   **Test B — Full losing trade lifecycle**
   - Same setup but use LOSS label
   - Step 1-4: same as Test A but with LOSS label and different exit context
   - Step 5: Generate tags
   - Assert: journal.resultType is "LOSS"
   - Assert: journal.pnlPct is negative
   - Assert: tags include "slow_loss" (holdBars=45 >= 25)
   - Assert: tags do NOT include "quick_loss", "quick_win", "slow_win"

   **Test C — MFE high loss pattern (gave back gains)**
   - Use a LOSS label with high mfePct (e.g., mfePct=1.5 with tpPct=2.0)
   - Assert: tags include "mfe_high" (mfePct 1.5 > tpPct*0.5=1.0)

   **Test D — SHORT trade against trend**
   - Change decision to SHORT, trends are "up"
   - Assert: journal.direction is "SHORT"
   - Assert: tags include "against_trend"

   **Test E — Minimal context (empty patterns, no backtest stats, no funding)**
   - Build snapshot with empty patterns, empty features
   - Build market context with empty trends, null funding
   - Assemble without backtest stats
   - Generate tags
   - Assert: journal.matchedPatterns is empty
   - Assert: journal.backtestComparison is null
   - Assert: tags include "ranging" (no trends)
   - Assert: no "high_funding" or "low_funding" tags

   **Test F — Pipeline output types are correct**
   - After full pipeline, verify:
     - `entrySnapshot` has `decision`, `patterns`, `features`, `entryPrice`, `tpPrice`, `slPrice`, `capturedAt` fields
     - `marketContext` has `trends`, `volatilityRatio`, `volumeRatio`, `fundingRate`, `capturedAt` fields
     - `journal` has all TradeJournal fields
     - `tags` is a string array with length >= 2

   **Test G — Deterministic pipeline**
   - Run the full pipeline twice with identical inputs
   - Assert: both journals have identical field values
   - Assert: both tag arrays are identical (same elements, same order)

3. Implement all test assertions with exact expected values
4. Ensure all imports use package paths

## Acceptance Criteria
- Test A proves the full winning trade pipeline composes correctly end-to-end
- Test B proves the full losing trade pipeline with different tag outcomes
- Test C proves MFE-high loss detection works through the pipeline
- Test D proves SHORT + against-trend detection through the pipeline
- Test E proves graceful degradation with minimal data
- Test F proves all interfaces are correctly typed and all fields present
- Test G proves the pipeline is deterministic
- All 7 tests pass, zero TypeScript errors
- No floating-point tolerance in string comparisons — exact string equality for prices

## Validation
```bash
bun test tests/integration/trade-journal.test.ts
bun test
bun run typecheck
```

## Out of Scope
- Database persistence integration (journal-worker concern)
- Event-driven pipeline testing (journal-worker concern)
- Performance benchmarking of the pipeline
- Net PnL with fee deduction (EP11 integration)
- Pattern drift detection with historical aggregation
- SSE streaming or API endpoint testing (M5 concern)
