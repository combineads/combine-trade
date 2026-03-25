# T-16-019 Decision Pending LLM Event Bus

## Goal
Add a `decision_pending_llm` event bus channel and implement vector-worker branching logic so that qualifying decisions are routed through the LLM filter before emitting `decision_completed`.

## Why
Without a branching point, all decisions bypass the LLM filter regardless of strategy configuration. The `decision_pending_llm` channel creates a clean decoupling between the kNN decision stage and the LLM evaluation stage, keeping each worker's responsibility narrow and allowing the LLM filter to be disabled or scaled independently of the vector-worker.

## Inputs
- `packages/shared/event-bus/channels.ts` — event bus channel registry
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher
- `workers/vector-worker/src/` — vector-worker source (emits `decision_completed` today)
- `workers/llm-decision-worker/src/` — LLM decision worker (T-16-010)
- `strategies.use_llm_filter` column (T-16-017)
- `decisions` LLM columns (T-16-018)
- Strategy timeframe value available at decision time

## Dependencies
- T-16-018 (decisions LLM columns — worker writes llm_* fields after evaluation)
- T-16-011 (llm-decision-worker base implementation — receives the pending event)

## Expected Outputs
- `decision_pending_llm` channel registered in event bus channel registry
- vector-worker branching: qualifying decisions NOTIFY `decision_pending_llm`, others NOTIFY `decision_completed`
- llm-decision-worker: LISTEN `decision_pending_llm`, evaluate, NOTIFY `decision_completed` with merged result
- Tests covering the branching logic and the full LLM routing flow

## Deliverables
- Updated `packages/shared/event-bus/channels.ts`:
  - Add `Channels.decisionPendingLlm = 'decision_pending_llm'`
- Updated `workers/vector-worker/src/decision-publisher.ts` (or equivalent):
  - If `strategy.use_llm_filter === true` AND `strategy.timeframe >= 15m`: NOTIFY `decision_pending_llm` with `{ decision_id, strategy_id }`
  - Otherwise: NOTIFY `decision_completed` as before
- Updated `workers/llm-decision-worker/src/main.ts`:
  - LISTEN `decision_pending_llm`
  - On receipt: fetch decision record, run LLM evaluation, store `llm_action`, `llm_reason`, `llm_confidence`, `llm_risk_factors`, `llm_evaluated_at`
  - NOTIFY `decision_completed` with `{ decision_id, action: llm_action }` (LLM action takes precedence)
- `workers/vector-worker/__tests__/decision-publisher.test.ts` additions:
  - Test: strategy with `use_llm_filter=true` + timeframe `15m` routes to `decision_pending_llm`
  - Test: strategy with `use_llm_filter=true` + timeframe `1m` routes to `decision_completed` (bypass LLM)
  - Test: strategy with `use_llm_filter=false` + timeframe `15m` routes to `decision_completed` (bypass LLM)
  - Test: strategy with `use_llm_filter=false` + timeframe `1m` routes to `decision_completed` (bypass LLM)
- `workers/llm-decision-worker/__tests__/routing.test.ts`:
  - Test: listener receives `decision_pending_llm` and invokes LLM evaluation
  - Test: after evaluation, NOTIFY `decision_completed` is emitted with LLM action
  - Test: LLM columns are written to the decision row before `decision_completed` is emitted

## Constraints
- Timeframe threshold of `>= 15m` applies only when `use_llm_filter = true` — the two conditions are AND-linked
- Supported timeframes for LLM routing: `15m`, `30m`, `1h`, `4h`, `1d` and above
- Excluded timeframes: `1m`, `3m`, `5m`
- `decision_completed` payload must include `action` field regardless of routing path (LLM or kNN)
- LLM evaluation must complete within 500 ms to respect the < 1s total latency budget (log a warning if exceeded)
- llm-decision-worker must not emit `decision_completed` if LLM evaluation throws — log error, do not silently drop
- Channel name constants must be defined in `channels.ts`, not hardcoded in worker source files
- Do not import Elysia or CCXT in event bus or worker files

## Steps
1. Write failing tests first (RED):
   - Test: `Channels.decisionPendingLlm` equals `'decision_pending_llm'`
   - Test: branching conditions for all four flag+timeframe combinations
   - Test: llm-decision-worker listener is invoked on `decision_pending_llm`
   - Test: LLM columns written to DB before `decision_completed` emitted
2. Add `decisionPendingLlm` to `channels.ts` (GREEN)
3. Implement branching in vector-worker decision publisher
4. Implement llm-decision-worker LISTEN → evaluate → NOTIFY flow
5. Verify all four routing path tests pass
6. Refactor (REFACTOR): extract timeframe threshold check into a pure function `isLlmEligibleTimeframe(timeframe: Timeframe): boolean`

## Acceptance Criteria
- `Channels.decisionPendingLlm` is exported from `packages/shared/event-bus/channels.ts`
- `use_llm_filter=true` + timeframe `>= 15m` → NOTIFY `decision_pending_llm`
- All other combinations → NOTIFY `decision_completed` directly (LLM bypassed)
- llm-decision-worker writes LLM columns before emitting `decision_completed`
- `decision_completed` payload always contains `action` field
- `bun test -- --filter "decision-pending-llm"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "decision-pending-llm"
bun run typecheck
bun run lint
```

## Out of Scope
- Alert suppression logic when LLM returns PASS (T-16-020 integration test verifies this)
- Order execution gate for LLM PASS (handled by execution-worker reading final `action`)
- Dynamic timeframe threshold configuration (15m is hardcoded per spec)
- Retry logic if llm-decision-worker crashes mid-evaluation
- Dead-letter queue for failed LLM evaluations
