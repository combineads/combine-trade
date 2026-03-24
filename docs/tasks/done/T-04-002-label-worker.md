# T-04-002 Build label worker

## Goal
Build the label worker that periodically scans for unlabeled strategy events, applies the labeler engine, persists labels, and publishes label_ready notifications.

## Why
Labels must be created after enough forward candles exist to determine the trade outcome. The label worker runs on a timer, scanning for events that have matured (max_hold_bars passed).

## Inputs
- EP04 M2 spec (label worker)
- T-04-001 labeler engine
- `db/schema/event-labels.ts` (label schema)
- `packages/shared/event-bus/channels.ts` (label_ready channel)

## Dependencies
- T-04-001 (labeler engine)

## Expected Outputs
- `workers/label-worker/src/scanner.ts` — LabelScanner class
- `workers/label-worker/src/health.ts` — health endpoint
- Worker tests with mock dependencies

## Deliverables
- `workers/label-worker/src/scanner.ts`
- `workers/label-worker/src/health.ts`
- `workers/label-worker/package.json` (updated)
- `workers/label-worker/__tests__/scanner.test.ts`

## Constraints
- Scan interval: 5 minutes (configurable)
- Only label events where max_hold_bars + buffer candles exist
- Candle gap detection: skip labeling if gaps exist in forward candles
- Label idempotency: unique(event_id) — duplicate label attempt is no-op
- Publish label_ready after successful label creation
- Worker imports: packages/core/label, packages/candle, packages/shared only

## Steps
1. Update `workers/label-worker/package.json` with dependencies
2. Write failing tests (RED):
   - Unlabeled event with sufficient candles → label created
   - Already labeled event → skipped
   - Insufficient forward candles → skipped
   - Candle gap detected → skipped
   - label_ready published after labeling
3. Implement LabelScanner:
   - findUnlabeledEvents() → list of events needing labels
   - For each: load strategy config, load forward candles, check gaps, apply labeler
   - Persist label, publish label_ready
4. Implement health endpoint (port 9004)
5. Make tests pass (GREEN)
6. Refactor

## Acceptance Criteria
- Scanner finds unlabeled events with matured hold periods
- Labels correctly created using labeler engine
- Candle gaps → event skipped (no invalid labels)
- Duplicate labeling prevented (idempotent)
- label_ready published for each new label
- Health endpoint responds on port 9004

## Validation
```bash
bun test workers/label-worker
bun run typecheck
bun run lint
```

## Out of Scope
- Decision engine integration (already done in T-03-006)
- Statistics refresh on new labels
