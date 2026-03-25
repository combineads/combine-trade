# T-16-016 Macro Integration Test

## Goal
Write an end-to-end integration test for the M1–M6 macro retrospective pipeline, verifying that an economic event flows through news ingestion, journal context enrichment, and retrospective report generation correctly.

## Why
Unit tests for individual components do not catch wiring errors across worker boundaries. An integration test that exercises the full pipeline from economic event seeding to retrospective report generation provides confidence that all M1–M6 components work together before production deployment.

## Inputs
- `workers/economic-event-worker/` — economic event ingestion (T-16-002 / T-16-003)
- `workers/news-worker/` — news ingestion (T-16-004)
- `workers/journal-worker/` — journal assembly + macro enrichment (T-16-014, T-16-015)
- `workers/retrospective-worker/` — retrospective report generation (T-16-008)
- Test database utilities from `packages/shared/db/test-utils`
- Event bus test harness from `packages/shared/event-bus/test-utils`

## Dependencies
- T-16-015 (journal_ready event bus — pipeline is complete through this task)
- T-16-008 (retrospective-worker — report generation)

## Expected Outputs
- Integration test file that exercises the full macro pipeline end-to-end
- Test data fixtures for economic events and news items

## Deliverables
- `packages/shared/__tests__/macro-integration.test.ts`:
  - Seed: insert `economic_events` rows covering the trade entry/exit time window
  - Seed: insert `news_items` rows tagged with relevant macro categories
  - Trigger: call journal-worker assembler with a test trade record
  - Assert: journal row has `entry_macro_context` populated with non-null JSONB
  - Assert: journal `auto_tags` includes at least one macro-derived tag
  - Assert: `journal_ready` NOTIFY is emitted with the correct `journal_id`
  - Assert: retrospective-worker produces a `retrospective_report` (non-empty text) for the journal
  - Assert: `retrospective_generated_at` timestamp is set on the journal row
  - Assert: tags from macro context appear in the final merged tag set
- Test fixtures: `packages/shared/__tests__/fixtures/macro-pipeline.ts`
  - Sample `economic_events` array (at least 2 events)
  - Sample `news_items` array (at least 3 items)
  - Sample trade record for journal assembly

## Constraints
- Test must use a real test database (not mocks) — use the project's test DB utilities
- LLM calls in retrospective-worker must be replaced with a deterministic stub for the integration test
- Test must clean up all seeded data after completion (use transactions or explicit cleanup)
- Test must complete within 30 seconds
- Do not hardcode database connection strings — use environment variables
- Do not import Elysia or CCXT in the test file

## Steps
1. Write failing integration test scaffolding (RED):
   - Set up test DB connection and cleanup hooks
   - Seed economic events and news items
   - Define assertions for each pipeline stage
2. Wire journal assembler call into the test (GREEN):
   - Call assembler directly (not via event bus) for determinism
   - Assert `entry_macro_context` is populated
3. Wire journal_ready notification and retrospective-worker handler:
   - Use in-process event bus test harness
   - Assert retrospective report is generated
4. Add tag merge assertions
5. Add cleanup (REFACTOR): wrap all DB mutations in a transaction, rollback after test
6. Verify test completes within the 30-second time budget

## Acceptance Criteria
- Test seeds economic events and news items, triggers journal assembly, and verifies all pipeline stages
- `entry_macro_context` is non-null in the persisted journal
- `retrospective_report` is non-empty text in the persisted journal
- `retrospective_generated_at` is set
- Macro-derived tags appear in `auto_tags`
- Test database is clean after test completion
- `bun test -- --filter "macro-integration"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "macro-integration"
bun run typecheck
bun run lint
```

## Out of Scope
- LLM integration with a real provider (use stub)
- Exit-time macro context validation
- Performance benchmarking of the pipeline
- Multi-journal concurrent pipeline testing
- Alert and order execution pipeline (separate integration test)
