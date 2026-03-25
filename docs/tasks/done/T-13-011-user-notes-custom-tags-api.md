# T-13-011 User Notes and Custom Tags API

## Goal
Build API endpoints for adding user notes and custom tags to trade journal entries so traders can annotate trades with personal observations and organize entries with custom labels.

## Why
Automated journal entries capture system-generated data but lack personal context. Traders need to annotate trades with their own observations (why they agreed with the signal, what market conditions they noticed, lessons learned) and organize entries with custom tags (e.g. "FOMO trade", "news spike", "best setup"). Without annotation endpoints, the journal is read-only from the trader's perspective.

## Inputs
- `packages/shared/db/schema/trade_journals.ts` — trade_journals table with `notes` and `custom_tags` columns (T-13-006)
- `apps/api/src/routes/journals/index.ts` — journal router (T-13-008)
- `packages/shared/db/index.ts` — DrizzleORM instance
- `docs/exec-plans/13-journal-analytics.md` — EP13 annotation spec

## Dependencies
- T-13-008 (journal list/detail/search API — establishes journal router and auth patterns, provides user isolation model)

## Expected Outputs
- `apps/api/src/routes/journals/notes.ts` — notes mutation handler
- `apps/api/src/routes/journals/tags.ts` — tags mutation handlers and list handler
- `apps/api/__tests__/routes/journals-notes.test.ts` — test suite
- Updated `apps/api/src/routes/journals/index.ts` — registers notes and tags routes

## Deliverables
- `PATCH /api/v1/journals/:id/notes` — set note text on a journal entry:
  - Body: `{ note: string }` (max 2000 characters)
  - Replaces existing note (upsert semantics)
  - Returns updated `JournalEntry`
  - 404 if journal not found or belongs to different user
- `POST /api/v1/journals/:id/tags` — add a custom tag:
  - Body: `{ tag: string }` (max 50 characters, alphanumeric + hyphens + underscores)
  - Appends tag if not already present (idempotent)
  - Max 20 custom tags per journal entry
  - Returns updated `custom_tags: string[]`
- `DELETE /api/v1/journals/:id/tags/:tag` — remove a custom tag:
  - Removes tag from array (no-op if tag not present)
  - Returns updated `custom_tags: string[]`
- `GET /api/v1/journals/tags` — list all custom tags used by the authenticated user:
  - Returns distinct tags across all user's journals, sorted alphabetically
  - Response: `{ tags: string[] }`

## Constraints
- User isolation required: all mutation endpoints verify journal belongs to authenticated userId
- Note max length: 2000 characters — reject with 400 if exceeded
- Tag format: alphanumeric, hyphens, underscores only; reject invalid format with 400
- Tag max length: 50 characters per tag
- Max 20 custom tags per journal entry — reject with 400 if exceeded
- AOP transaction decorator required for all write operations

## Steps
1. Write failing tests first (RED):
   - Test: `PATCH /notes` updates note on own journal entry
   - Test: `PATCH /notes` returns 404 for another user's journal
   - Test: `PATCH /notes` returns 400 for note > 2000 chars
   - Test: `POST /tags` appends tag, is idempotent on duplicate
   - Test: `POST /tags` returns 400 for invalid tag format
   - Test: `POST /tags` returns 400 when 20-tag limit reached
   - Test: `DELETE /tags/:tag` removes tag, no-op on missing tag
   - Test: `GET /tags` returns distinct sorted tags for user
   - Test: user isolation on all mutation endpoints
2. Implement notes handler (GREEN)
3. Implement tags add/remove/list handlers (GREEN)
4. Register routes in journal router
5. Refactor (REFACTOR): extract tag validation as a shared validator function

## Acceptance Criteria
- Note upsert replaces previous note content
- Tag add is idempotent (no duplicate tags in array)
- Tag remove is no-op when tag is absent (no error)
- `GET /tags` returns only tags from authenticated user's journals
- All input validation (length, format, count) returns 400 with descriptive error
- User isolation enforced on all endpoints
- `bun test -- --filter "journal-notes"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "journal-notes"
bun run typecheck
bun run lint
```

## Out of Scope
- System-generated tag mutation (system tags are set by the pipeline, not editable by user)
- Bulk tag operations (tag all trades matching a filter)
- Tag renaming or merging
- UI for annotation (EP22)
