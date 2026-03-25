# T-14-007 Paper Mode Slack Tag and Journal is_paper Flag

## Goal
Prepend "[모의매매]" to Slack alert messages when running in paper mode and add an `is_paper` boolean flag to the trade_journals table that is set based on execution mode when a journal entry is written.

## Why
Users must clearly distinguish paper trades from live trades in both real-time alerts and historical journal review. Without visual tagging in Slack and a database flag in the journal, paper and live trades look identical, risking confusion about actual trading performance and P&L.

## Inputs
- `workers/alert-worker/src/` — alert-worker that sends Slack notifications (T-06-004)
- `workers/journal-worker/src/` — journal-worker that writes trade journal entries (T-13-006)
- `packages/shared/db/schema/trade_journals.ts` — trade_journals table schema
- `packages/shared/execution-mode.ts` — execution mode enum/type (T-14-006)
- `docs/exec-plans/14-paper-trading.md` — EP14 paper mode spec

## Dependencies
- T-14-006 (execution mode switching — provides the execution mode enum and context)
- T-06-004 (Slack alert-worker — provides the Slack message construction logic)
- T-13-006 (trade journal writer — provides the journal schema and writer)

## Expected Outputs
- Updated `workers/alert-worker/src/formatter.ts` (or equivalent message builder) — prepends "[모의매매]" in paper mode
- Migration: `packages/shared/db/migrations/XXXX_add_is_paper_to_trade_journals.sql` — adds `is_paper` column
- Updated `packages/shared/db/schema/trade_journals.ts` — adds `is_paper: boolean` field with default `false`
- Updated `workers/journal-worker/src/journal-writer.ts` — sets `is_paper` from execution mode
- `workers/alert-worker/__tests__/formatter.test.ts` — updated or new tests for paper tag
- `workers/journal-worker/__tests__/journal-writer.test.ts` — updated or new tests for is_paper flag
- `bun run db:generate` output committed

## Deliverables
- Alert-worker formatter:
  - Reads execution mode from worker config or event payload
  - Prepends "[모의매매] " to Slack message title/text when `executionMode === 'paper'`
  - Live mode messages unchanged
- trade_journals schema:
  - New column `is_paper BOOLEAN NOT NULL DEFAULT FALSE`
  - Drizzle schema updated to include `isPaper: boolean('is_paper').notNull().default(false)`
- Journal-writer:
  - Reads execution mode from worker config or decision event payload
  - Sets `is_paper: true` when `executionMode === 'paper'`, `false` for live

## Constraints
- "[모의매매]" prefix must appear at the start of the Slack message text, not embedded mid-message
- `is_paper` must default to `false` for existing rows (non-breaking migration)
- Do not modify the decision engine or strategy pipeline — mode detection happens in the worker layer only
- Migration must be generated via `bun run db:generate` and not hand-written

## Steps
1. Write failing tests first (RED):
   - Test: alert formatter prepends "[모의매매] " when mode is paper
   - Test: alert formatter leaves message unchanged when mode is live
   - Test: journal-writer sets `is_paper: true` when mode is paper
   - Test: journal-writer sets `is_paper: false` when mode is live
2. Add `is_paper` column to Drizzle schema and run `bun run db:generate`
3. Update journal-writer to set `is_paper` from execution mode (GREEN)
4. Update alert formatter to prepend paper tag (GREEN)
5. Refactor (REFACTOR): extract `isPaperMode(mode: ExecutionMode): boolean` helper if not already present

## Acceptance Criteria
- Slack messages in paper mode always start with "[모의매매] "
- Slack messages in live mode do not contain "[모의매매]"
- `is_paper` column present in trade_journals with correct default
- Journal entries written in paper mode have `is_paper = true`
- Journal entries written in live mode have `is_paper = false`
- `bun test -- --filter "paper-tag"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "paper-tag"
bun run typecheck
bun run lint
```

## Out of Scope
- UI display of the is_paper flag (EP22)
- Paper trade filtering in journal list API (follow-up to T-13-008)
- Per-strategy paper/live mode toggle (T-14-006)
- Email or other notification channel tagging
