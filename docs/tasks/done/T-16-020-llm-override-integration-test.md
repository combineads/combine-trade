# T-16-020 LLM Override Integration Test

## Goal
Write an integration test verifying that when the LLM filter overrides a kNN LONG decision with PASS, no alert is sent and no order is placed.

## Why
The LLM filter's primary purpose is to suppress low-confidence or high-risk decisions. If the downstream alert-worker and execution-worker do not correctly respect a PASS override, live trades could be placed despite the LLM filter having rejected them. This integration test is the definitive proof that the override is end-to-end respected before the feature goes to production.

## Inputs
- `workers/vector-worker/` — produces kNN LONG decision (T-16-011)
- `workers/llm-decision-worker/` — overrides with PASS (T-16-010, T-16-019)
- `workers/alert-worker/` — must NOT fire on PASS action
- `workers/execution-worker/` — must NOT place order on PASS action
- Event bus test harness (`packages/shared/event-bus/test-utils`)
- Test database utilities (`packages/shared/db/test-utils`)
- Strategy and decision fixtures

## Dependencies
- T-16-019 (decision_pending_llm event bus and vector-worker branching — full routing pipeline in place)

## Expected Outputs
- Integration test exercising the full path from candle_closed to LLM PASS override
- Verified: alert-worker does not fire, execution-worker does not place order

## Deliverables
- `packages/shared/__tests__/llm-override.test.ts`:
  - Setup: create strategy with `use_llm_filter=true` and timeframe `15m`
  - Setup: mock/stub LLM client to always return `{ action: 'PASS', reason: 'high risk', confidence: 0.2, risk_factors: [...] }`
  - Trigger: emit `candle_closed` event for the strategy's symbol/timeframe
  - Wait: vector-worker processes → kNN produces LONG → routes to `decision_pending_llm`
  - Wait: llm-decision-worker receives → evaluates → stores PASS → emits `decision_completed` with `action: 'PASS'`
  - Assert: alert-worker does NOT emit any alert notification
  - Assert: execution-worker does NOT call exchange order placement API
  - Assert: decision row in DB has `llm_action = 'PASS'` and `llm_evaluated_at` is set
  - Assert: decision row has original kNN action preserved in existing `action` column (LONG)
  - Assert: `llm_reason` and `llm_confidence` are populated in the decision row
- Spy/stub helpers:
  - `alertWorkerSpy` — tracks whether alert notification was emitted
  - `executionWorkerSpy` — tracks whether order placement was attempted
  - `llmClientStub` — deterministic PASS response

## Constraints
- Test must use a real test database for decision row assertions — no full mocking of DB
- LLM client must be replaced with a deterministic stub — no real LLM API calls in tests
- Exchange order API must be stubbed — no real CCXT calls
- Alert notification endpoint must be stubbed — no real Slack/webhook calls
- Test must complete within 60 seconds
- Test must clean up all seeded data (strategy, decision, events) after completion
- Workers may be called in-process (not as separate processes) for test determinism
- Do not import Elysia in the test file

## Steps
1. Write failing integration test scaffolding (RED):
   - Set up strategy with `use_llm_filter=true` and `timeframe=15m`
   - Stub LLM client to return PASS
   - Define assertions: no alert, no order, PASS stored in DB
2. Wire candle_closed → vector-worker → kNN LONG result (GREEN):
   - Call vector-worker pipeline in-process
   - Confirm decision row created with kNN LONG
3. Wire decision_pending_llm → llm-decision-worker → PASS override:
   - Confirm `llm_action = 'PASS'` stored
   - Confirm `decision_completed` emitted with `action: 'PASS'`
4. Wire decision_completed → alert-worker and execution-worker:
   - Confirm neither fires
5. Add DB assertions for all LLM columns
6. Refactor (REFACTOR): extract setup/teardown into `beforeAll`/`afterAll` hooks, ensure cleanup is in `finally` block

## Acceptance Criteria
- Strategy with `use_llm_filter=true` + `timeframe=15m` routes through LLM filter
- LLM stub returns PASS
- No alert is emitted by alert-worker
- No order is placed by execution-worker
- Decision row has `llm_action = 'PASS'`, `llm_evaluated_at` set, `llm_reason` and `llm_confidence` populated
- Original kNN `action` field preserves `'LONG'` (LLM stores override in `llm_action`, not `action`)
- Test database is clean after test completion
- `bun test -- --filter "llm-override"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "llm-override"
bun run typecheck
bun run lint
```

## Out of Scope
- LLM LONG or SHORT agreement with kNN (only override scenario tested here)
- Multi-strategy concurrent override testing
- Real LLM API integration test
- Performance benchmarking of the LLM routing pipeline
- Testing the kNN-only path (no LLM filter) — covered by vector-worker unit tests
- Retrospective pipeline integration (T-16-016)
