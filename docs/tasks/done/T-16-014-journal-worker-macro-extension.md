# T-16-014 Journal Worker Macro Extension

## Goal
Extend the journal-worker to attach macro economic context and merge macro-derived tags into each trade journal entry after assembly.

## Why
Each trade journal entry needs a macro economic snapshot captured at both entry and exit time. Attaching this context in the journal-worker ensures consistent enrichment before downstream consumers (retrospective-worker, reporting) see the record. Merging macro tags with existing auto-tags creates a unified tag set for filtering and analysis.

## Inputs
- `workers/journal-worker/src/` — journal-worker source (T-16-005)
- `packages/shared/event-bus/` — event bus publisher/listener
- Context-enricher service (T-16-006) — provides macro context snapshot for a given timestamp
- Macro-tagger service (T-16-006) — derives tags from macro context
- Updated `trade_journals` schema (T-16-013) — `entry_macro_context` column

## Dependencies
- T-16-013 (trade_journals schema extension — entry_macro_context column)
- T-16-005 (journal-worker base implementation)
- T-16-006 (context-enricher and macro-tagger services)

## Expected Outputs
- Updated journal-worker assembly pipeline with macro enrichment step
- Updated test suite covering macro context attachment and tag merging

## Deliverables
- Updated `workers/journal-worker/src/assembler.ts` (or equivalent assembly module):
  - After assembling core journal fields, call context-enricher with `entry_time` → store result in `entry_macro_context`
  - Call macro-tagger with the macro context → derive macro tag list
  - Merge macro tags with existing `auto_tags` array (deduplicate, preserve original tags)
  - Persist updated journal row with `entry_macro_context` and merged tags
- Updated `workers/journal-worker/__tests__/assembler.test.ts`:
  - Test: context-enricher is called with the journal's entry timestamp
  - Test: macro tags are merged into `auto_tags` without duplicates
  - Test: `entry_macro_context` is stored in the journal row
  - Test: if context-enricher throws, journal assembly still completes (graceful degradation)
  - Test: if macro-tagger returns empty array, original tags are preserved unchanged

## Constraints
- Macro enrichment must not block journal assembly on failure — use try/catch and log errors, continue with null context
- Do not call context-enricher for the exit time in this task (exit context is out of scope)
- Tags must be deduplicated by string equality (case-sensitive)
- All DB writes via DrizzleORM — no raw SQL
- Do not import Elysia or CCXT in the worker

## Steps
1. Write failing tests first (RED):
   - Test: assembler calls context-enricher with `entry_time`
   - Test: assembler stores returned context in `entry_macro_context`
   - Test: macro-tagger is called with context result
   - Test: returned macro tags are merged with existing auto_tags
   - Test: duplicate tags are deduplicated
   - Test: context-enricher error results in `entry_macro_context = null`, assembly continues
2. Update assembler to inject context-enricher and macro-tagger dependencies (GREEN)
3. Implement enrichment step after core journal fields are assembled
4. Implement tag merge with deduplication
5. Persist with `entry_macro_context` and merged tags in a single DB update
6. Refactor (REFACTOR): extract tag merge logic into a pure function `mergeTags(existing: string[], incoming: string[]): string[]`

## Acceptance Criteria
- Every assembled journal row has `entry_macro_context` populated (or null on enricher failure)
- Macro tags appear in the journal's `auto_tags` array alongside original tags
- No duplicate tags in merged result
- Context-enricher failure does not prevent journal from being persisted
- `bun test -- --filter "journal-worker.*macro"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "journal-worker.*macro"
bun run typecheck
bun run lint
```

## Out of Scope
- Exit-time macro context capture
- Retrospective report generation (T-16-008)
- journal_ready event emission (T-16-015)
- LLM-based tag generation
