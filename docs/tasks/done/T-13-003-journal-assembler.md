# T-13-003 Journal assembler

## Goal
Implement a pure function `assembleJournal(entrySnapshot, labelResult, exitContext, backtestStats?)` in `packages/core/journal/assembler.ts` that combines an entry snapshot, a label result, an exit market context, and optional backtest statistics into a single `TradeJournal` object. This is the central composition point of the trade journal pipeline.

## Why
EP13 M3 requires assembling the full trade journal when a trade closes (label is generated). The entry snapshot (T-13-001) captures why the trade was entered, the label result captures how it ended, the exit market context (T-13-002) captures the market state at exit, and the backtest statistics provide a baseline for comparison. By implementing this as a pure function, the assembler is testable without database, workers, or event infrastructure. The journal-worker will call this function and persist the result — the assembler itself has zero IO.

## Inputs
- EP13 M3 spec — journal assembly on trade close
- T-13-001 `packages/core/journal/entry-snapshot.ts` — `EntrySnapshot`, `SnapshotPattern`
- T-13-002 `packages/core/journal/market-context.ts` — `MarketContext`
- `packages/core/label/types.ts` — `LabelResult`, `ResultType`
- `packages/backtest/report.ts` — `BacktestReport` (optional reference for backtest comparison structure)
- Architecture guardrail: `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack

## Dependencies
- T-13-001 (entry snapshot builder) — provides `EntrySnapshot` type and structure
- T-13-002 (market context calculator) — provides `MarketContext` type and structure

## Expected Outputs
- `packages/core/journal/assembler.ts`
  - `BacktestComparison` interface:
    ```ts
    interface BacktestComparison {
      backtestWinrate: number;
      backtestExpectancy: number;
      backtestSampleCount: number;
      liveWinrate: number | null;       // null if insufficient live data
      liveExpectancy: number | null;
      liveSampleCount: number;
    }
    ```
  - `TradeJournal` interface:
    ```ts
    interface TradeJournal {
      entrySnapshot: EntrySnapshot;
      exitMarketContext: MarketContext;
      direction: Direction;
      entryPrice: string;
      exitPrice: string;
      resultType: ResultType;
      pnlPct: number;
      mfePct: number;
      maePct: number;
      holdBars: number;
      matchedPatterns: SnapshotPattern[];
      backtestComparison: BacktestComparison | null;
      assembledAt: Date;
    }
    ```
  - `AssembleJournalInput` interface:
    ```ts
    interface AssembleJournalInput {
      entrySnapshot: EntrySnapshot;
      labelResult: LabelResult;
      exitMarketContext: MarketContext;
      backtestStats?: {
        winrate: number;
        expectancy: number;
        sampleCount: number;
      };
      liveStats?: {
        winrate: number;
        expectancy: number;
        sampleCount: number;
      };
      assembledAt: Date;
    }
    ```
  - `assembleJournal(input: AssembleJournalInput): TradeJournal` — pure function that composes the journal
- `packages/core/journal/__tests__/assembler.test.ts`

## Deliverables
- `packages/core/journal/assembler.ts`
- `packages/core/journal/__tests__/assembler.test.ts`

## Constraints
- All functions are synchronous and pure — no IO, no side effects, no async
- `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack
- `packages/core/journal/assembler.ts` may import from `./entry-snapshot.ts` and `./market-context.ts` (same package, types only)
- `backtestStats` is optional — when absent, `backtestComparison` is null
- `liveStats` is optional — when absent and backtestStats is provided, `liveWinrate` and `liveExpectancy` are null
- Price fields from `entrySnapshot.entryPrice` and `labelResult.exitPrice` are preserved as exact strings
- `matchedPatterns` is copied from `entrySnapshot.patterns` (denormalized for journal convenience)
- All tests use `bun:test`

## Steps
1. Create type definitions in `packages/core/journal/assembler.ts`: `BacktestComparison`, `TradeJournal`, `AssembleJournalInput`
2. Write failing tests in `packages/core/journal/__tests__/assembler.test.ts` (RED):

   **Test A — Full journal with backtest comparison**
   - Provide entry snapshot (LONG, 3 patterns, 4 features), WIN label, exit market context, backtest stats, live stats
   - Verify all fields are correctly mapped:
     - `direction` from entry snapshot decision
     - `entryPrice` from entry snapshot
     - `exitPrice` from label result
     - `resultType`, `pnlPct`, `mfePct`, `maePct`, `holdBars` from label result
     - `matchedPatterns` from entry snapshot patterns
     - `backtestComparison` populated with both backtest and live stats
     - `assembledAt` preserved

   **Test B — Journal without backtest stats**
   - Provide all inputs except `backtestStats` and `liveStats`
   - Verify `backtestComparison` is null

   **Test C — Journal with backtest but no live stats**
   - Provide `backtestStats` but no `liveStats`
   - Verify `backtestComparison` is present with `liveWinrate: null`, `liveExpectancy: null`, `liveSampleCount: 0`

   **Test D — LOSS trade journal**
   - Provide a LOSS label result with negative pnlPct
   - Verify `resultType` is "LOSS" and `pnlPct` is negative

   **Test E — TIME_EXIT trade journal**
   - Provide a TIME_EXIT label result
   - Verify `resultType` is "TIME_EXIT"

   **Test F — Entry snapshot with empty patterns**
   - Provide entry snapshot with empty patterns array
   - Verify `matchedPatterns` is empty array

   **Test G — Price string preservation**
   - Use entry price `"65432.10"` and exit price `"66100.50"`
   - Verify both are exact string matches in the journal (no float conversion)

   **Test H — SHORT direction journal**
   - Provide a SHORT entry snapshot and WIN label
   - Verify `direction` is "SHORT"

3. Implement `assembleJournal` (GREEN):
   - Extract direction from `entrySnapshot.decision.direction`
   - Map label fields: `resultType`, `pnlPct`, `mfePct`, `maePct`, `holdBars`, `exitPrice`
   - Copy `matchedPatterns` from entry snapshot
   - Build `BacktestComparison` if `backtestStats` provided; set live fields from `liveStats` or null
   - Assemble and return `TradeJournal`
4. Refactor: add JSDoc to all exported types and the `assembleJournal` function

## Acceptance Criteria
- `assembleJournal` correctly maps fields from entry snapshot, label result, and exit market context
- Backtest comparison is null when `backtestStats` is not provided
- Backtest comparison has null live fields when `liveStats` is not provided
- Price strings are preserved exactly (no Decimal conversion, no float conversion)
- All result types (WIN, LOSS, TIME_EXIT) produce valid journals
- Matched patterns are correctly denormalized from entry snapshot
- All 8 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/journal/__tests__/assembler.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Database persistence of trade journals (journal-worker concern)
- Event-driven journal assembly trigger (journal-worker concern)
- Net PnL calculation with fee deduction (EP11 integration concern)
- MFE/MAE timing analysis (which bar reached peak — separate task)
- Journal idempotency / deduplication (DB layer concern)
- User notes or custom tags (M5 API concern)
