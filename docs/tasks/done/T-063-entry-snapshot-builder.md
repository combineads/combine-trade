# T-063 Entry snapshot builder

## Goal
Implement a pure function `buildEntrySnapshot(decision, patterns, features)` in `packages/core/journal/entry-snapshot.ts` that assembles an `EntrySnapshot` from a decision result, matched similar patterns, and a feature vector. This is the first building block of the trade journal pipeline — it captures the complete decision context at entry time into a single structured object.

## Why
EP13 M1 requires capturing the full decision context at the moment a LONG/SHORT signal fires. Without a structured snapshot, the journal assembler (T-065) cannot reconstruct why a trade was entered. By implementing this as a pure function that takes already-resolved inputs, the snapshot builder is testable in isolation, has zero IO dependencies, and can be called from both the live pipeline and the backtest engine. The snapshot preserves decision statistics, matched pattern details, and the raw + normalized feature vector for post-trade analysis.

## Inputs
- EP13 M1 spec — entry snapshot capture (decision context + similar patterns + feature vector)
- `packages/core/decision/types.ts` — `DecisionResult`, `DecisionInput`, `Direction`, `ConfidenceTier`
- `packages/core/vector/types.ts` — `SearchResult`, `PatternStatistics`
- `packages/core/label/types.ts` — `ResultType`
- Architecture guardrail: `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack

## Dependencies
None.

## Expected Outputs
- `packages/core/journal/entry-snapshot.ts`
  - `SnapshotDecision` interface:
    ```ts
    interface SnapshotDecision {
      direction: Direction;        // "LONG" | "SHORT" (never "PASS" — snapshots only exist for entries)
      reason: DecisionReason;
      winrate: number;
      expectancy: number;
      sampleCount: number;
      ciLower: number;
      ciUpper: number;
      confidenceTier: ConfidenceTier;
    }
    ```
  - `SnapshotPattern` interface:
    ```ts
    interface SnapshotPattern {
      eventId: string;
      distance: number;
      resultType: ResultType | null;  // null if pattern is unlabeled
      pnlPct: number | null;         // null if pattern is unlabeled
    }
    ```
  - `SnapshotFeature` interface:
    ```ts
    interface SnapshotFeature {
      name: string;
      rawValue: number;
      normalizedValue: number;
    }
    ```
  - `EntrySnapshot` interface:
    ```ts
    interface EntrySnapshot {
      decision: SnapshotDecision;
      patterns: SnapshotPattern[];
      features: SnapshotFeature[];
      entryPrice: string;
      tpPrice: string;
      slPrice: string;
      capturedAt: Date;
    }
    ```
  - `buildEntrySnapshot(params: BuildSnapshotInput): EntrySnapshot` — pure function that assembles the snapshot
  - `BuildSnapshotInput` interface:
    ```ts
    interface BuildSnapshotInput {
      decision: DecisionResult;
      patterns: SnapshotPattern[];
      features: SnapshotFeature[];
      entryPrice: string;
      tpPrice: string;
      slPrice: string;
      capturedAt: Date;
    }
    ```
- `packages/core/journal/__tests__/entry-snapshot.test.ts`

## Deliverables
- `packages/core/journal/entry-snapshot.ts`
- `packages/core/journal/__tests__/entry-snapshot.test.ts`

## Constraints
- All functions are synchronous and pure — no IO, no side effects, no async
- `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack
- `buildEntrySnapshot` must reject PASS decisions — throw `Error` if `decision.decision === "PASS"`
- `entryPrice`, `tpPrice`, `slPrice` are `string` (Decimal.js compatible) — not native float
- `patterns` array may be empty (no similar patterns found) — valid snapshot
- `features` array may be empty (no features computed) — valid snapshot
- All tests use `bun:test`

## Steps
1. Create type definitions in `packages/core/journal/entry-snapshot.ts`: `SnapshotDecision`, `SnapshotPattern`, `SnapshotFeature`, `EntrySnapshot`, `BuildSnapshotInput`
2. Write failing tests in `packages/core/journal/__tests__/entry-snapshot.test.ts` (RED):
   - **Test A — Basic LONG snapshot**: provide a LONG decision with 3 patterns and 4 features → verify all fields correctly mapped
   - **Test B — Basic SHORT snapshot**: provide a SHORT decision → verify direction is "SHORT"
   - **Test C — PASS rejection**: provide a PASS decision → throws Error with descriptive message
   - **Test D — Empty patterns**: provide 0 patterns → snapshot.patterns is empty array, no error
   - **Test E — Empty features**: provide 0 features → snapshot.features is empty array, no error
   - **Test F — Pattern with null labels**: provide patterns where some have `resultType: null` and `pnlPct: null` → correctly preserved
   - **Test G — Decision statistics mapping**: verify `winrate`, `expectancy`, `sampleCount`, `ciLower`, `ciUpper`, `confidenceTier` all correctly copied from DecisionResult
   - **Test H — Price fields preserved**: verify `entryPrice`, `tpPrice`, `slPrice` are exact string values (no float conversion)
   - **Test I — capturedAt preserved**: verify the Date object is exactly the one passed in
3. Implement `buildEntrySnapshot` (GREEN):
   - Extract decision fields into `SnapshotDecision`
   - Pass through patterns and features arrays as-is
   - Pass through price strings and capturedAt
   - Throw if direction is PASS
4. Refactor: add JSDoc to all exported types and the `buildEntrySnapshot` function

## Acceptance Criteria
- `buildEntrySnapshot` correctly maps `DecisionResult` fields to `SnapshotDecision`
- PASS decisions are rejected with a descriptive error
- Empty patterns and features arrays produce valid snapshots
- Price fields are preserved as exact strings (no Decimal conversion, no float conversion)
- `capturedAt` Date is preserved by reference
- Patterns with null labels are correctly represented
- All 9 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/journal/__tests__/entry-snapshot.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Database persistence of entry snapshots (EP13 M1 DB concern)
- Async snapshot capture hook in the vector-worker pipeline
- Market context enrichment (covered by T-064)
- Snapshot serialization to JSONB format
- Entry snapshot deduplication or idempotency
