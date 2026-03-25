# T-14-012 Paper Safety Test — Zero Real Exchange API Calls

## Goal
Write a safety test suite that verifies zero real exchange API calls are made when the trading pipeline runs in paper mode, by mocking the exchange adapter and asserting that `createOrder` and `cancelOrder` are never invoked on the real exchange.

## Why
Paper mode must never place real orders under any circumstances. This is a critical safety requirement — a bug that causes paper mode to call the real exchange could result in unintended live trades and financial loss. An automated safety test that runs in CI provides continuous assurance that the isolation boundary is intact and cannot be accidentally broken by future changes.

## Inputs
- `packages/shared/exchange/` — exchange adapter interface (T-14-006)
- `workers/paper-matcher/src/` — paper order matching engine (T-14-002)
- `workers/execution-worker/src/` — execution worker that routes orders (T-14-006)
- `packages/shared/execution-mode.ts` — execution mode enum
- `docs/exec-plans/14-paper-trading.md` — EP14 safety requirements

## Dependencies
- T-14-006 (execution mode switching — provides the routing logic that must be verified)

## Expected Outputs
- `packages/shared/exchange/__tests__/paper-safety.test.ts` — safety test suite (or location near execution-worker if more appropriate)
- Mock exchange adapter used exclusively in tests — no production code changes required

## Deliverables
- Safety test suite covering:
  - Full pipeline run in paper mode with mocked real exchange adapter
  - Assert `createOrder` on real exchange mock: call count === 0 after N signals processed
  - Assert `cancelOrder` on real exchange mock: call count === 0 after N signals processed
  - Assert paper matcher receives all order requests (call count === N)
  - Assert paper_orders table is written (paper matcher processed the orders)
  - Test covers LONG signal, SHORT signal, and PASS signal paths
  - Test covers partial fill scenario (paper matcher internal behavior)
  - Test covers order rejection scenario (insufficient paper balance)
- Mock exchange adapter:
  - Implements the same interface as the real exchange adapter
  - Tracks `createOrder` and `cancelOrder` call counts
  - Throws an error if called (fail-fast: any real exchange call is a test failure)

## Constraints
- Tests must use only mock exchange adapters — never connect to a real exchange or staging environment
- The mock exchange adapter must throw an explicit error if `createOrder` or `cancelOrder` is called, in addition to the call count assertion (fail-fast)
- Tests must pass with no network access (fully offline)
- Do not modify production pipeline code to make tests pass — isolation must be enforced by existing routing logic
- Tests must be runnable in CI with `bun test -- --filter "paper-safety"`

## Steps
1. Write failing tests first (RED):
   - Test: LONG signal in paper mode → `createOrder` on real exchange: 0 calls
   - Test: SHORT signal in paper mode → `createOrder` on real exchange: 0 calls
   - Test: PASS signal in paper mode → no calls to either adapter
   - Test: paper matcher `createOrder` called for LONG/SHORT signals
   - Test: paper_orders written to DB for each processed signal
   - Test: insufficient balance → order rejected by paper matcher, no real exchange call
2. Implement mock exchange adapter with fail-fast behavior (GREEN)
3. Wire up full pipeline in test harness using mock adapters
4. Assert call counts and DB state
5. Refactor (REFACTOR): extract pipeline test harness as a reusable fixture for other paper trading tests

## Acceptance Criteria
- Zero calls to `createOrder` on real exchange mock for any paper mode signal
- Zero calls to `cancelOrder` on real exchange mock for any paper mode signal
- Mock adapter throws immediately if called (fail-fast)
- Paper matcher receives all LONG/SHORT order requests
- paper_orders written correctly for each processed signal
- Tests run fully offline with no network access
- `bun test -- --filter "paper-safety"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "paper-safety"
bun run typecheck
bun run lint
```

## Out of Scope
- Live mode execution testing (separate test scope)
- Exchange-specific order type handling
- Network-level firewall rules for paper mode (infrastructure concern)
- Performance/load testing of paper matcher
