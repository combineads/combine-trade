# T-090 Retrospective worker

## Goal
Implement a worker that listens for completed trade journals and generates LLM retrospective reports using `claude -p` subprocess.

## Why
EP16 M5 — automated retrospective analysis helps traders understand why trades succeeded or failed in the context of macro events, without manual effort.

## Inputs
- `packages/core/macro/prompt-builder.ts` (T-089 outputs: buildRetrospectivePrompt)
- `packages/core/macro/types.ts` (T-083 outputs: MacroContext)

## Dependencies
T-083, T-089

## Expected Outputs
- `RetrospectiveWorker` class with `processJournal(journalId)` method
- `RetrospectiveWorkerDeps` interface

## Deliverables
- `workers/retrospective-worker/index.ts`
- `workers/retrospective-worker/__tests__/retrospective-worker.test.ts`

## Constraints
- Uses `Bun.spawn(['claude', '-p', prompt])` for LLM invocation
- Graceful degradation: claude CLI not installed → warning log, no crash
- Graceful degradation: subprocess timeout (60s) → warning log, skip
- `trade_journals.retrospective_report` stores the LLM output
- `trade_journals.retrospective_generated_at` tracks generation time
- DB access via injected repository interface
- DB connection pool: max 2

## Steps
1. Define `RetrospectiveRepository` interface (getJournalWithContext, saveReport)
2. Implement subprocess wrapper for `claude -p` with timeout
3. Implement `processJournal` method: fetch context → build prompt → invoke LLM → save report
4. Handle all failure modes (CLI missing, timeout, empty output)
5. Write tests with mocked subprocess execution

## Acceptance Criteria
- Successful invocation stores report in `retrospective_report` and sets `retrospective_generated_at`
- Claude CLI not found → warning log, no exception
- Subprocess timeout → warning log, no exception
- Empty LLM output → warning log, report not saved
- Tests mock subprocess (no actual claude CLI calls)

## Validation
```bash
bun test workers/retrospective-worker/__tests__/retrospective-worker.test.ts
bun run typecheck
```

## Out of Scope
- `journal_ready` event bus channel (requires journal-worker extension)
- trade_journals schema migration (would need separate task)
- Actual LLM output quality testing
